const path = require("path");
const { TIPOS, ACTIVIDADES_OFICIALES, ARCHIVO } = require("../configuracion/nominas.config");
const Calc = require("../public/js/nominas-calculo");
const { leerReporteEEGSA, lecturaParaInspector, resumenInspectores } = require("../utilidades/excelEEGSA");
const { validarImportacion, nombreCompleto, buscarEmpleadoPorInspector } = require("./validacionEEGSA");
const { armarDocumento, nombreArchivoPdf } = require("./documentoComprobante");

/* ============================================================
   Servicio de NÓMINAS — máquina de estados
   ------------------------------------------------------------
   Estados:  EN_PREPARACION → PENDIENTE_APROBACION → APROBADA
             (CANCELADA = borrador descartado; nunca se borra nada)

   paso_actual     = pantalla en la que va la persona.
   paso_completado = último paso terminado. Solo se puede abrir un
                     paso si el anterior está completo; si se cambia
                     algo de un paso anterior, se "des-completan" los
                     posteriores (hay que volver a confirmarlos).

   El servicio no sabe de SQL: recibe un "repositorio" (el real usa
   SQL Server, el de pruebas usa memoria). Toda regla de negocio y
   todo cálculo final viven aquí, nunca en el navegador.
   ============================================================ */

class ErrorNegocio extends Error {
    constructor(mensaje, status = 400, extra = {}) {
        super(mensaje);
        this.status = status;
        this.extra = extra;
    }
}

const ESTADOS = { PREPARACION: "EN_PREPARACION", PENDIENTE: "PENDIENTE_APROBACION", APROBADA: "APROBADA", CANCELADA: "CANCELADA" };
const MAXIMO_MONTO = 100000000000; // Q 1,000,000,000.00 en centavos

const esTecnico = tipo => tipo === "TECNICO_SOCIO" || tipo === "TECNICO_NO_SOCIO";
/* Nombre del tipo de empleado (módulo Empleados → columna tipo_empleado). */
const NOMBRE_TIPO_EMPLEADO = { TECNICO_SOCIO: "Técnico socio", TECNICO_NO_SOCIO: "Técnico no socio", AUXILIAR: "Auxiliar", ADMINISTRATIVO: "Administrativo" };

function reglasDe(tipo) {
    const reglas = TIPOS[tipo];
    if (!reglas) throw new ErrorNegocio("Tipo de nómina no válido.");
    return reglas;
}

function validarPeriodo(periodo) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(periodo || ""))) throw new ErrorNegocio("El período debe tener el formato AAAA-MM.");
    return periodo;
}

function montoValido(valor, campo, { permitirNulo = false } = {}) {
    if ((valor === null || valor === "") && permitirNulo) return null;
    const c = Calc.aCentavos(valor);
    if (c === null) throw new ErrorNegocio(`${campo}: escribe un monto válido (ej. 1250.00).`);
    if (c < 0) throw new ErrorNegocio(`${campo}: el monto no puede ser negativo.`);
    if (c > MAXIMO_MONTO) throw new ErrorNegocio(`${campo}: el monto es demasiado grande.`);
    return c;
}

const textoCorto = (v, max) => String(v ?? "").trim().slice(0, max);
const aTexto = v => v === null || v === undefined ? "" : (typeof v === "number" ? Calc.formatoQ(v) : String(v));

function crearServicioNominas({ repo, almacen, ahora = () => new Date() }) {

    /* ---------------- utilidades internas ---------------- */
    async function cargar(id) {
        const n = await repo.obtener(Number(id));
        if (!n || n.estado === ESTADOS.CANCELADA) throw new ErrorNegocio("No se encontró esa nómina.", 404);
        n.datos = n.datos || {};
        return n;
    }

    function exigirEditable(n) {
        if (n.estado === ESTADOS.APROBADA) throw new ErrorNegocio("Esta nómina ya fue aprobada: sus valores están bloqueados.", 409);
    }

    async function guardar(n, ctx, acciones = []) {
        n.actualizado_por = ctx.usuario.id_credencial;
        n.fecha_actualizacion = ahora();
        n.empleado_nombre = n.datos.empleado ? n.datos.empleado.nombre : null;
        const guardada = await repo.guardar(n);
        if (acciones.length) {
            await repo.registrarHistorial(acciones.map(a => ({
                id_nomina: n.id_nomina, accion: a.accion, campo: a.campo || null,
                valor_anterior: a.anterior === undefined ? null : textoCorto(aTexto(a.anterior), 400),
                valor_nuevo: a.nuevo === undefined ? null : textoCorto(aTexto(a.nuevo), 400),
                id_credencial: ctx.usuario.id_credencial, usuario: ctx.usuario.nombre, fecha: ahora()
            })));
        }
        return guardada;
    }

    async function preciosExtra(tipo) {
        const lista = await repo.preciosActividades(tipo);
        const mapa = {};
        lista.forEach(p => { mapa[p.actividad] = { produccion: p.precio_produccion, bono: p.precio_bono }; });
        return mapa;
    }

    async function calcular(n) {
        const reglas = reglasDe(n.tipo);
        if (esTecnico(n.tipo)) return Calc.calcularTecnico(n.datos, reglas, ACTIVIDADES_OFICIALES, await preciosExtra(n.tipo));
        return Calc.calcularAdministrativa(n.datos, reglas);
    }

    /* Al cambiar algo de un paso, los posteriores dejan de estar completos. */
    function invalidarDesde(n, paso) {
        if (n.paso_completado >= paso) n.paso_completado = paso - 1;
        if (n.estado === ESTADOS.PENDIENTE) n.estado = ESTADOS.PREPARACION;
    }

    async function buscarDuplicado(tipo, periodo, codigoEmpleado, excluirId) {
        if (!codigoEmpleado) return null;
        const existentes = await repo.buscar({ tipo, periodo, codigo_empleado: codigoEmpleado });
        return existentes.find(x => x.id_nomina !== excluirId && x.estado !== ESTADOS.CANCELADA) || null;
    }

    function errorDuplicado(existente, periodo) {
        const aprobada = existente.estado === ESTADOS.APROBADA;
        return new ErrorNegocio(
            aprobada
                ? `Ya existe una nómina APROBADA de este empleado para ${Calc.nombrePeriodo(periodo)} (recibo No. ${existente.numero_recibo}). Se abrirá ese registro en lugar de crear un duplicado.`
                : `Ya hay una nómina en preparación de este empleado para ${Calc.nombrePeriodo(periodo)}. Se abrirá esa misma para no duplicarla.`,
            409, { existente: existente.id_nomina, aprobada }
        );
    }

    /* ---------------- vista completa ---------------- */
    const dosDecimales = v => (typeof v === "number" && !Number.isInteger(v)) ? Math.round(v * 100) / 100 : v;

    async function vistaImportacion(imp, tipo) {
        const lectura = lecturaActual(imp);
        const esDetalle = imp.libro && imp.libro.formato === "detalle";
        return {
            archivo: imp.archivo,
            formato: esDetalle ? "detalle" : "simple",
            inspectores: esDetalle ? await tecnicosRegistrados(resumenInspectores(imp.libro), tipo) : null,
            inspectorSeleccionado: imp.inspectorSeleccionado || null,
            hoja: lectura ? lectura.hoja : (imp.libro && imp.libro.hojaDetalle),
            inspector: lectura ? lectura.inspector : null,
            periodoArchivo: lectura ? lectura.periodo : (imp.libro && imp.libro.periodo),
            columnaCantidad: lectura ? lectura.columnaCantidad : null,
            columnasAreas: lectura && lectura.columnasAreas ? lectura.columnasAreas : [],
            areas: lectura ? lectura.areas : null,
            actividades: lectura ? lectura.actividades.map(a => ({ fila: a.fila, nombre: a.nombre, cantidad: dosDecimales(a.cantidadCruda), areas: a.areas || null, deHoja: a.deHoja || null })) : [],
            totalDeclarado: lectura ? dosDecimales(lectura.totalDeclarado) : null,
            columnasExtra: lectura ? lectura.columnasExtra : [],
            penalizaciones: lectura && lectura.penalizaciones ? lectura.penalizaciones : null
        };
    }
    async function vista(id) {
        const n = await cargar(id);
        const reglas = reglasDe(n.tipo);
        const calculo = n.estado === ESTADOS.APROBADA && n.snapshot ? n.snapshot.calculo : await calcular(n);
        const imp = n.datos.importacion;
        return {
            id_nomina: n.id_nomina, tipo: n.tipo, tipoNombre: reglas.nombre, periodo: n.periodo,
            periodoNombre: Calc.nombrePeriodo(n.periodo), estado: n.estado,
            paso_actual: n.paso_actual, paso_completado: n.paso_completado, pasos: reglas.pasos,
            version: n.version, codigo_empleado: n.codigo_empleado,
            empleado: n.datos.empleado || null,
            importacion: imp ? await vistaImportacion(imp, n.tipo) : null,
            validacion: n.datos.validacion || null,
            ajustes: n.datos.ajustes || {}, precios: n.datos.precios || {},
            planilla: n.datos.planilla || {}, pago: n.datos.pago || {},
            descuentos_extra: n.datos.descuentos_extra || [],
            observaciones: n.datos.observaciones || "",
            calculo,
            preciosCatalogo: esTecnico(n.tipo) ? await preciosExtra(n.tipo) : {},
            numero_recibo: n.numero_recibo || null,
            fecha_aprobacion: n.fecha_aprobacion || null,
            aprobado_por: n.snapshot ? n.snapshot.aprobadoPor : null,
            fecha_actualizacion: n.fecha_actualizacion
        };
    }

    /* ---------------- crear / abrir ---------------- */
    async function abrirOCrear({ tipo, periodo, codigo_empleado }, ctx) {
        reglasDe(tipo);
        validarPeriodo(periodo);
        if (codigo_empleado) {
            const existente = await buscarDuplicado(tipo, periodo, Number(codigo_empleado));
            if (existente) return { id_nomina: existente.id_nomina, existente: true, aprobada: existente.estado === ESTADOS.APROBADA };
        }
        const n = {
            tipo, periodo, codigo_empleado: null, estado: ESTADOS.PREPARACION,
            paso_actual: 1, paso_completado: 0, version: 1,
            datos: { ajustes: {}, precios: {}, descuentos_extra: [], observaciones: "", planilla: {}, pago: {} },
            creado_por: ctx.usuario.id_credencial, fecha_creacion: ahora()
        };
        const creada = await repo.crear(n);
        await repo.registrarHistorial([{ id_nomina: creada.id_nomina, accion: "Creación", campo: null, valor_anterior: null,
            valor_nuevo: `${reglasDe(tipo).nombre} · ${Calc.nombrePeriodo(periodo)}`, id_credencial: ctx.usuario.id_credencial, usuario: ctx.usuario.nombre, fecha: ahora() }]);
        if (codigo_empleado && !esTecnico(tipo)) {
            await seleccionarEmpleado(creada.id_nomina, codigo_empleado, ctx);
        }
        return { id_nomina: creada.id_nomina, existente: false };
    }

    async function descartar(id, ctx) {
        const n = await cargar(id);
        exigirEditable(n);
        const archivo = n.datos.importacion && n.datos.importacion.archivo;
        n.estado = ESTADOS.CANCELADA;
        await guardar(n, ctx, [{ accion: "Borrador descartado" }]);
        if (archivo) await almacen.eliminar(archivo.nombre_guardado).catch(() => {});
    }

    /* Borra TODOS los borradores (en preparación / pendientes de aprobar).
       Nunca toca las nóminas aprobadas. */
    async function descartarBorradores(ctx) {
        const lista = await repo.listar({ estados: [ESTADOS.PREPARACION, ESTADOS.PENDIENTE] });
        let borrados = 0;
        for (const x of lista) {
            try { await descartar(x.id_nomina, ctx); borrados++; } catch (_) { /* otra persona la cambió: se deja */ }
        }
        return { borrados, total: lista.length };
    }

    /* Elimina del historial un comprobante ya aprobado (queda guardado
       para auditoría con quién y cuándo lo eliminó). */
    async function eliminarAprobada(id, motivo, ctx) {
        const n = await cargar(id);
        if (n.estado !== ESTADOS.APROBADA) throw new ErrorNegocio("Solo se pueden eliminar del historial las nóminas aprobadas.");
        await repo.eliminarAprobada(n.id_nomina, ctx.usuario.id_credencial);
        await repo.registrarHistorial([{
            id_nomina: n.id_nomina, accion: "Comprobante eliminado", campo: "recibo " + n.numero_recibo,
            valor_anterior: n.total_centavos != null ? Calc.formatoQ(n.total_centavos) : null,
            valor_nuevo: textoCorto(motivo, 400) || null,
            id_credencial: ctx.usuario.id_credencial, usuario: ctx.usuario.nombre, fecha: ahora()
        }]);
        return { id_nomina: n.id_nomina, numero_recibo: n.numero_recibo };
    }

    /* ---------------- paso 1 técnico: importar ---------------- */
    function validarArchivo(archivo) {
        if (!archivo) throw new ErrorNegocio("Selecciona el archivo de EEGSA.");
        const ext = path.extname(archivo.originalname || "").toLowerCase();
        if (!ARCHIVO.extensiones.includes(ext)) throw new ErrorNegocio("Formato no permitido: solo se aceptan archivos .xlsx y .xls.");
        if (!archivo.size || !archivo.buffer || !archivo.buffer.length) throw new ErrorNegocio("El archivo está vacío.");
        if (archivo.size > ARCHIVO.tamanoMaximo) throw new ErrorNegocio("El archivo supera el tamaño máximo de 10 MB.");
        // firma real del archivo: ZIP (xlsx) u OLE (xls) — evita archivos renombrados
        const b = archivo.buffer;
        const esZip = b[0] === 0x50 && b[1] === 0x4b;
        const esOle = b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
        if ((ext === ".xlsx" && !esZip) || (ext === ".xls" && !esOle && !esZip)) {
            throw new ErrorNegocio("El contenido no corresponde a un archivo de Excel (¿se cambió la extensión?).");
        }
    }

    /* Lectura del técnico elegido (formato de facturación con varios
       técnicos) o la única lectura (formato de un solo inspector). */
    function lecturaActual(imp) {
        if (!imp) return null;
        if (imp.libro && imp.libro.formato === "detalle") {
            return imp.inspectorSeleccionado ? lecturaParaInspector(imp.libro, imp.inspectorSeleccionado) : null;
        }
        return imp.lectura || imp.libro || null;
    }

    async function validarContra(n, lectura) {
        if (!lectura) {
            return {
                ok: false, fecha: ahora(), actividades: [], advertencias: [], inspector: null, empleado: null,
                totalCalculado: 0, totalDeclarado: null, areas: null, registros: 0, formato: "detalle",
                errores: [{ mensaje: "El archivo trae a varios técnicos: selecciona de quién es esta nómina en el paso 1.", campo: "Técnico", critico: true }]
            };
        }
        const empleados = await repo.empleadosActivos();
        const extra = await repo.preciosActividades(n.tipo);
        const resultado = validarImportacion(lectura, {
            periodo: n.periodo, empleados, oficiales: ACTIVIDADES_OFICIALES,
            preciosConocidos: extra.map(p => p.actividad)
        });
        resultado.fecha = ahora();
        // el técnico tiene que ser del mismo tipo que la nómina (socio / no socio)
        if (resultado.empleado && esTecnico(n.tipo) && resultado.empleado.tipo_empleado !== n.tipo) {
            const e = resultado.empleado;
            const nombre = e.nombre;
            resultado.errores.push({
                mensaje: e.tipo_empleado
                    ? `${nombre} está registrado en Empleados como ${NOMBRE_TIPO_EMPLEADO[e.tipo_empleado] || e.tipo_empleado}; esta nómina es de ${reglasDe(n.tipo).nombre}.`
                    : `${nombre} no tiene tipo en Empleados: abre su expediente y escoge "Técnico socio" o "Técnico no socio".`,
                campo: "Tipo de empleado", critico: true
            });
            resultado.ok = false;
        }
        if (resultado.empleado) {
            const dup = await buscarDuplicado(n.tipo, n.periodo, resultado.empleado.codigo_empleado, n.id_nomina);
            if (dup) {
                const e = errorDuplicado(dup, n.periodo);
                resultado.errores.push({ mensaje: e.message, campo: "Empleado", critico: true, existente: dup.id_nomina });
                resultado.ok = false;
                resultado.duplicado = { id_nomina: dup.id_nomina, aprobada: dup.estado === ESTADOS.APROBADA, numero_recibo: dup.numero_recibo };
            }
        }
        return resultado;
    }

    /* Valida con la lectura actual y deja todo listo para la vista previa. */
    async function aplicarLectura(n) {
        const lectura = lecturaActual(n.datos.importacion);
        const validacion = await validarContra(n, lectura);
        n.datos.validacion = { ...validacion, confirmada: false };
        aplicarEmpleadoDeValidacion(n, validacion);
        n.datos.importacion.actividades = validacion.actividades.map(a => ({ nombre: a.nombre, cantidad: a.cantidad }));
        // penalizaciones de la hoja "Penalizaciones" → Calcular nómina (editable)
        n.datos.ajustes = n.datos.ajustes || {};
        const pen = lectura && lectura.penalizaciones;
        if (pen && pen.total) n.datos.ajustes.penalizaciones_eegsa = Calc.aCentavos(pen.total);
        else if (n.datos.importacion.penalizacionesCargadas) delete n.datos.ajustes.penalizaciones_eegsa;
        n.datos.importacion.penalizacionesCargadas = !!(pen && pen.total);
        return validacion;
    }

    /* Los técnicos del archivo que corresponden a UN empleado activo.
       "delTipo" = el empleado es del mismo tipo que la nómina (socio / no socio);
       la lista desplegable solo muestra esos. */
    async function tecnicosRegistrados(inspectores, tipo) {
        const empleados = await repo.empleadosActivos();
        return inspectores.map(i => {
            const { encontrados } = buscarEmpleadoPorInspector(i.nombre, empleados);
            const e = encontrados.length === 1 ? encontrados[0] : null;
            const tipoEmpleado = e ? (e.tipo_empleado || null) : null;
            return {
                ...i,
                registrado: !!e,
                codigo_empleado: e ? e.codigo_empleado : null,
                ambiguo: encontrados.length > 1,
                tipo_empleado: tipoEmpleado,
                tipoEmpleadoNombre: tipoEmpleado ? (NOMBRE_TIPO_EMPLEADO[tipoEmpleado] || tipoEmpleado) : (e ? "Sin clasificar" : null),
                delTipo: !!e && tipoEmpleado === tipo
            };
        });
    }

    /* multer entrega el nombre en latin1: "FacturaciÃ³n" → "Facturación". */
    function arreglarNombre(nombre) {
        const n = String(nombre || "archivo.xlsx");
        if (/Ã.|Â/.test(n)) {
            try { return Buffer.from(n, "latin1").toString("utf8"); } catch (_) { return n; }
        }
        return n;
    }

    async function importar(id, archivo, ctx) {
        const n = await cargar(id);
        exigirEditable(n);
        if (!esTecnico(n.tipo)) throw new ErrorNegocio("La planilla administrativa no utiliza reporte de EEGSA.");
        validarArchivo(archivo);
        const nombreOriginal = arreglarNombre(archivo.originalname);

        const libro = leerReporteEEGSA(archivo.buffer, nombreOriginal);   // lanza ErrorArchivo si no se puede leer
        const anterior = n.datos.importacion && n.datos.importacion.archivo;
        const nombreGuardado = await almacen.guardar(archivo.buffer, nombreOriginal);

        let inspectorSeleccionado = null;
        let registros;
        if (libro.formato === "detalle") {
            registros = libro.filasLeidas;
            // si solo UN técnico del archivo está registrado en Empleados, se elige solo
            // (solo entre los técnicos del mismo tipo que la nómina)
            const lista = await tecnicosRegistrados(libro.inspectores, n.tipo);
            const registrados = lista.filter(t => t.delTipo);
            if (registrados.length === 1) inspectorSeleccionado = registrados[0].nombre;
        } else {
            registros = libro.actividades.length;
        }

        n.datos.importacion = {
            archivo: {
                nombre: textoCorto(path.basename(nombreOriginal), 200), nombre_guardado: nombreGuardado,
                tamano: archivo.size, registros,
                subido_por: ctx.usuario.nombre, id_credencial: ctx.usuario.id_credencial, fecha: ahora()
            },
            libro,
            inspectorSeleccionado,
            lectura: libro.formato === "detalle" ? null : libro
        };
        await aplicarLectura(n);

        n.paso_actual = 1;
        n.paso_completado = 1;
        n.estado = ESTADOS.PREPARACION;
        await guardar(n, ctx, [{ accion: anterior ? "Archivo EEGSA reemplazado" : "Archivo EEGSA importado", campo: "archivo", anterior: anterior && anterior.nombre, nuevo: n.datos.importacion.archivo.nombre }]);
        await repo.registrarArchivo({ id_nomina: n.id_nomina, ...n.datos.importacion.archivo });
        if (anterior) await almacen.eliminar(anterior.nombre_guardado).catch(() => {});
        return vista(n.id_nomina);
    }

    /* Archivo con varios técnicos: elegir de quién es esta nómina. */
    async function seleccionarInspector(id, nombre, ctx) {
        const n = await cargar(id);
        exigirEditable(n);
        const imp = n.datos.importacion;
        if (!imp || !imp.libro || imp.libro.formato !== "detalle") throw new ErrorNegocio("Este archivo no trae varios técnicos.");
        const ins = imp.libro.inspectores.find(i => Calc.normalizar(i.nombre) === Calc.normalizar(nombre));
        if (!ins) throw new ErrorNegocio("Ese técnico no aparece en el archivo.");
        const anterior = imp.inspectorSeleccionado;
        imp.inspectorSeleccionado = ins.nombre;
        await aplicarLectura(n);
        n.paso_actual = 1;
        n.paso_completado = 1;
        n.estado = ESTADOS.PREPARACION;
        await guardar(n, ctx, [{ accion: "Técnico del reporte seleccionado", campo: "inspector", anterior, nuevo: ins.nombre }]);
        return vista(n.id_nomina);
    }

    function aplicarEmpleadoDeValidacion(n, validacion) {
        if (validacion.empleado && !validacion.duplicado) {
            n.codigo_empleado = validacion.empleado.codigo_empleado;
            n.datos.empleado = validacion.empleado;
        } else {
            n.codigo_empleado = null;
            n.datos.empleado = null;
        }
    }

    async function cancelarImportacion(id, ctx) {
        const n = await cargar(id);
        exigirEditable(n);
        const archivo = n.datos.importacion && n.datos.importacion.archivo;
        if (!archivo) throw new ErrorNegocio("No hay ninguna importación que cancelar.");
        if (n.datos.importacion.penalizacionesCargadas && n.datos.ajustes) delete n.datos.ajustes.penalizaciones_eegsa;
        n.datos.importacion = null;
        n.datos.validacion = null;
        n.datos.empleado = null;
        n.codigo_empleado = null;
        n.paso_actual = 1;
        n.paso_completado = 0;
        n.estado = ESTADOS.PREPARACION;
        await guardar(n, ctx, [{ accion: "Importación cancelada", campo: "archivo", anterior: archivo.nombre, nuevo: null }]);
        await repo.marcarArchivoEliminado(n.id_nomina, archivo.nombre_guardado);
        await almacen.eliminar(archivo.nombre_guardado).catch(() => {});
        return vista(n.id_nomina);
    }

    /* ---------------- paso 2 técnico: validar ---------------- */
    async function validar(id, ctx) {
        const n = await cargar(id);
        exigirEditable(n);
        if (!n.datos.importacion) throw new ErrorNegocio("Primero carga el reporte de EEGSA.");
        const lectura = lecturaActual(n.datos.importacion);
        if (!lectura) throw new ErrorNegocio("Selecciona primero de qué técnico es esta nómina (el archivo trae a varios).");
        const validacion = await validarContra(n, lectura);
        n.datos.validacion = { ...validacion, confirmada: validacion.ok };
        aplicarEmpleadoDeValidacion(n, validacion);
        n.datos.importacion.actividades = validacion.actividades.map(a => ({ nombre: a.nombre, cantidad: a.cantidad }));
        n.paso_actual = 2;
        n.paso_completado = validacion.ok ? 2 : 1;
        await guardar(n, ctx, [{ accion: validacion.ok ? "Validación completada" : "Validación con errores", nuevo: `${validacion.errores.length} errores, ${validacion.advertencias.length} advertencias` }]);
        return vista(n.id_nomina);
    }

    /* ---------------- navegación entre pasos ---------------- */
    async function irAPaso(id, paso, ctx) {
        const n = await cargar(id);
        const total = reglasDe(n.tipo).pasos.length;
        paso = Number(paso);
        if (!Number.isInteger(paso) || paso < 1 || paso > total) throw new ErrorNegocio("Paso no válido.");
        if (n.estado === ESTADOS.APROBADA) {
            const minimo = total - 1; // aprobar / comprobante (solo lectura)
            if (paso < minimo) throw new ErrorNegocio("La nómina ya está aprobada: solo se pueden consultar la aprobación y el comprobante.", 409);
            // aprobada = inmutable: solo se cambia lo que se muestra, no se guarda nada
            const soloLectura = await vista(n.id_nomina);
            soloLectura.paso_actual = paso;
            return soloLectura;
        } else if (paso > n.paso_completado + 1) {
            throw new ErrorNegocio(`Primero termina el paso ${n.paso_completado + 1}: ${reglasDe(n.tipo).pasos[n.paso_completado]}.`, 409);
        }
        if (n.paso_actual !== paso) {
            n.paso_actual = paso;
            await guardar(n, ctx);
        }
        return vista(n.id_nomina);
    }

    /* Confirma el paso actual y pasa al siguiente. */
    async function completarPaso(id, paso, ctx) {
        const n = await cargar(id);
        exigirEditable(n);
        paso = Number(paso);
        if (paso > n.paso_completado + 1) throw new ErrorNegocio("Termina primero los pasos anteriores.", 409);
        const calculo = await calcular(n);

        if (esTecnico(n.tipo)) {
            if (paso === 1) {
                if (!n.datos.importacion) throw new ErrorNegocio("Primero carga el reporte de EEGSA.");
                return validar(id, ctx);
            }
            if (paso === 2) {
                if (!n.datos.validacion || !n.datos.validacion.ok) throw new ErrorNegocio("La validación tiene errores: corrige o reemplaza el archivo antes de continuar.");
            }
            if (paso === 3) {
                if (n.paso_completado < 2) throw new ErrorNegocio("Valida primero los datos importados.");
            }
            if (paso === 4) {
                if (calculo.pendientes.length) throw new ErrorNegocio(`Falta el precio de: ${calculo.pendientes.join(", ")}.`);
                if (calculo.total < 0) throw new ErrorNegocio("El total a recibir no puede ser negativo. Revisa los descuentos.");
                n.estado = ESTADOS.PENDIENTE;
            }
            if (paso >= 5) throw new ErrorNegocio("Para terminar este paso usa el botón Aprobar nómina.");
        } else {
            if (paso === 1) {
                if (!n.codigo_empleado) throw new ErrorNegocio("Selecciona un empleado.");
                if (!(calculo.ingresos[0].monto > 0)) throw new ErrorNegocio("Escribe el salario base del empleado.");
                if (calculo.liquido < 0) throw new ErrorNegocio("El líquido a recibir no puede ser negativo. Revisa los descuentos.");
                n.estado = ESTADOS.PENDIENTE;
            } else {
                throw new ErrorNegocio("Para terminar este paso usa el botón Aprobar planilla.");
            }
        }
        n.paso_completado = Math.max(n.paso_completado, paso);
        n.paso_actual = paso + 1;
        await guardar(n, ctx, [{ accion: `Paso ${paso} completado`, campo: reglasDe(n.tipo).pasos[paso - 1] }]);
        return vista(n.id_nomina);
    }

    /* ---------------- edición de valores (lápiz) ---------------- */
    const CAMPOS_TECNICO = new Set(["salario_mes", "mantenimiento_vehiculos", "penalizaciones_eegsa", "penalizaciones_seisa", "isr"]);
    const CAMPOS_PLANILLA_MONTO = new Set(["salario_base", "bonificacion", "otros_ingresos", "igss", "isr", "otros_descuentos"]);
    const CAMPOS_PLANILLA_TEXTO = { otros_ingresos_desc: 80, otros_descuentos_desc: 150 };
    const CAMPOS_PAGO = { forma_pago: 40, banco: 60, cuenta: 30 };

    async function editarValor(id, campo, valor, ctx) {
        const n = await cargar(id);
        exigirEditable(n);
        campo = String(campo || "");
        const d = n.datos;
        d.ajustes = d.ajustes || {};
        let anterior, nuevo, pasoAfectado;

        if (campo === "observaciones") {
            anterior = d.observaciones || "";
            nuevo = textoCorto(valor, 500);
            d.observaciones = nuevo;
            pasoAfectado = esTecnico(n.tipo) ? 4 : 1;
        } else if (campo.startsWith("pago.")) {
            const sub = campo.slice(5);
            if (!CAMPOS_PAGO[sub]) throw new ErrorNegocio("Campo no editable.");
            d.pago = d.pago || {};
            anterior = d.pago[sub] || "";
            nuevo = textoCorto(valor, CAMPOS_PAGO[sub]);
            if (sub === "cuenta" && nuevo && !/^[0-9-]{4,30}$/.test(nuevo)) throw new ErrorNegocio("La cuenta solo puede tener números y guiones.");
            d.pago[sub] = nuevo;
            pasoAfectado = esTecnico(n.tipo) ? 4 : 1;
        } else if (esTecnico(n.tipo)) {
            if (n.paso_completado < 3 && !campo.startsWith("precio:")) throw new ErrorNegocio("Estos valores se editan en el paso Calcular nómina.", 409);
            if (CAMPOS_TECNICO.has(campo)) {
                const permitirNulo = campo === "salario_mes";
                anterior = d.ajustes[campo] ?? null;
                nuevo = montoValido(valor, campo === "salario_mes" ? "Salario del mes" : campo, { permitirNulo });
                if (nuevo === null) delete d.ajustes[campo]; else d.ajustes[campo] = nuevo;
            } else if (campo.startsWith("cargo:")) {
                const clave = campo.slice(6);
                const cargo = reglasDe(n.tipo).cargosSeisa.find(c => c.clave === clave && !c.origen);
                if (!cargo) throw new ErrorNegocio("Ese cargo no se puede editar.");
                d.ajustes.cargos = d.ajustes.cargos || {};
                anterior = d.ajustes.cargos[clave] ?? cargo.monto;
                nuevo = montoValido(valor, cargo.nombre);
                d.ajustes.cargos[clave] = nuevo;
            } else if (campo.startsWith("precio:")) {
                // precio:<actividad>:produccion|bono
                const partes = campo.split(":");
                const tipoPrecio = partes.pop();
                const actividad = partes.slice(1).join(":");
                if (!["produccion", "bono"].includes(tipoPrecio) || !actividad) throw new ErrorNegocio("Precio no válido.");
                const calculo = await calcular(n);
                const fila = calculo.actividades.find(a => Calc.normalizar(a.nombre) === Calc.normalizar(actividad));
                if (!fila) throw new ErrorNegocio("Esa actividad no está en la nómina.");
                d.precios = d.precios || {};
                const actual = d.precios[fila.nombre] || {};
                anterior = tipoPrecio === "produccion" ? fila.precioProduccion : fila.precioBono;
                nuevo = montoValido(valor, `Precio de ${fila.nombre}`);
                d.precios[fila.nombre] = { ...actual, [tipoPrecio]: nuevo };
                if (fila.nueva) {
                    // se guarda en el catálogo para las próximas importaciones
                    const otros = d.precios[fila.nombre];
                    await repo.guardarPrecioActividad({ tipo: n.tipo, actividad: fila.nombre, precio_produccion: otros.produccion ?? null, precio_bono: otros.bono ?? null, id_credencial: ctx.usuario.id_credencial });
                }
            } else {
                throw new ErrorNegocio("Campo no editable.");
            }
            pasoAfectado = 4;
        } else {
            if (!campo.startsWith("planilla.")) throw new ErrorNegocio("Campo no editable.");
            const sub = campo.slice(9);
            d.planilla = d.planilla || {};
            anterior = d.planilla[sub] ?? null;
            if (CAMPOS_PLANILLA_MONTO.has(sub)) {
                nuevo = montoValido(valor, sub === "salario_base" ? "Salario base" : sub, { permitirNulo: sub === "igss" });
                if (nuevo === null) delete d.planilla[sub]; else d.planilla[sub] = nuevo;
            } else if (CAMPOS_PLANILLA_TEXTO[sub]) {
                nuevo = textoCorto(valor, CAMPOS_PLANILLA_TEXTO[sub]);
                d.planilla[sub] = nuevo;
            } else if (sub === "isr_aplica") {
                nuevo = valor === true || valor === "true" || valor === 1 || valor === "1";
                d.planilla.isr_aplica = nuevo;
            } else {
                throw new ErrorNegocio("Campo no editable.");
            }
            pasoAfectado = 1;
        }

        invalidarDesde(n, pasoAfectado);
        if (n.paso_actual > pasoAfectado) n.paso_actual = pasoAfectado;
        await guardar(n, ctx, [{ accion: "Valor editado", campo, anterior, nuevo }]);
        return vista(n.id_nomina);
    }

    /* ---------------- descuentos manuales ---------------- */
    async function agregarDescuento(id, { concepto, descripcion, monto }, ctx) {
        const n = await cargar(id);
        exigirEditable(n);
        if (esTecnico(n.tipo) && n.paso_completado < 3) throw new ErrorNegocio("Los descuentos se agregan en el paso Calcular nómina.", 409);
        const nombre = textoCorto(concepto, 80);
        if (nombre.length < 2) throw new ErrorNegocio("Escribe el concepto del descuento.");
        const centavos = montoValido(monto, "Monto del descuento");
        if (centavos === 0) throw new ErrorNegocio("El monto del descuento debe ser mayor a cero.");
        const lista = n.datos.descuentos_extra = n.datos.descuentos_extra || [];
        const nuevoId = (lista.reduce((m, x) => Math.max(m, x.id), 0) || 0) + 1;
        const descuento = { id: nuevoId, concepto: nombre, descripcion: textoCorto(descripcion, 150), monto: centavos, creado_por: ctx.usuario.nombre, fecha: ahora() };
        lista.push(descuento);
        const paso = esTecnico(n.tipo) ? 4 : 1;
        invalidarDesde(n, paso);
        if (n.paso_actual > paso) n.paso_actual = paso;
        await guardar(n, ctx, [{ accion: "Descuento agregado", campo: nombre, anterior: null, nuevo: centavos }]);
        return vista(n.id_nomina);
    }

    async function eliminarDescuento(id, idDescuento, ctx) {
        const n = await cargar(id);
        exigirEditable(n);
        const lista = n.datos.descuentos_extra || [];
        const i = lista.findIndex(x => x.id === Number(idDescuento));
        if (i < 0) throw new ErrorNegocio("No se encontró ese descuento.", 404);
        const [quitado] = lista.splice(i, 1);
        const paso = esTecnico(n.tipo) ? 4 : 1;
        invalidarDesde(n, paso);
        if (n.paso_actual > paso) n.paso_actual = paso;
        await guardar(n, ctx, [{ accion: "Descuento eliminado", campo: quitado.concepto, anterior: quitado.monto, nuevo: null }]);
        return vista(n.id_nomina);
    }

    /* ---------------- planilla: empleado ---------------- */
    async function seleccionarEmpleado(id, codigoEmpleado, ctx) {
        const n = await cargar(id);
        exigirEditable(n);
        if (esTecnico(n.tipo)) throw new ErrorNegocio("En la nómina técnica el empleado sale del reporte de EEGSA.");
        const emp = await repo.empleado(Number(codigoEmpleado));
        if (!emp || emp.activo === false || emp.activo === 0) throw new ErrorNegocio("Selecciona un empleado activo.");
        const dup = await buscarDuplicado(n.tipo, n.periodo, emp.codigo_empleado, n.id_nomina);
        if (dup) throw errorDuplicado(dup, n.periodo);

        const anterior = n.datos.empleado ? n.datos.empleado.nombre : null;
        const perfil = (await repo.perfilPago(emp.codigo_empleado)) || {};
        n.codigo_empleado = emp.codigo_empleado;
        n.datos.empleado = { codigo_empleado: emp.codigo_empleado, nombre: nombreCompleto(emp), puesto: emp.puesto || null, tipo_personal: emp.puesto || "Administrativo" };
        // datos laborales guardados de la planilla anterior (si existen)
        n.datos.planilla = {
            // perfil de la planilla anterior; si no hay, el sueldo base del expediente en Empleados
            salario_base: perfil.salario_base ?? (emp.salario_base !== null && emp.salario_base !== undefined && Number(emp.salario_base) > 0 ? Calc.aCentavos(emp.salario_base) : undefined),
            bonificacion: perfil.bonificacion ?? undefined
        };
        Object.keys(n.datos.planilla).forEach(k => n.datos.planilla[k] === undefined && delete n.datos.planilla[k]);
        n.datos.pago = { forma_pago: perfil.forma_pago || "", banco: perfil.banco || "", cuenta: perfil.cuenta || "" };
        invalidarDesde(n, 1);
        n.paso_actual = 1;
        await guardar(n, ctx, [{ accion: "Empleado seleccionado", campo: "empleado", anterior, nuevo: n.datos.empleado.nombre }]);
        return vista(n.id_nomina);
    }

    /* ---------------- aprobación ---------------- */
    async function aprobar(id, versionEsperada, ctx) {
        const n = await cargar(id);
        if (n.estado === ESTADOS.APROBADA) throw new ErrorNegocio(`Esta nómina ya fue aprobada (recibo No. ${n.numero_recibo}).`, 409, { numero_recibo: n.numero_recibo });
        if (versionEsperada !== undefined && versionEsperada !== null && Number(versionEsperada) !== n.version) {
            throw new ErrorNegocio("La nómina cambió mientras la revisabas. Revisa los valores actualizados y vuelve a aprobar.", 409);
        }
        const reglas = reglasDe(n.tipo);
        const pasoAprobar = reglas.pasos.length - 1;
        if (n.estado !== ESTADOS.PENDIENTE || n.paso_completado < pasoAprobar - 1) {
            throw new ErrorNegocio("La nómina todavía no está lista para aprobar: completa los pasos anteriores.", 409);
        }
        const calculo = await calcular(n);   // el backend recalcula todo
        if (esTecnico(n.tipo)) {
            if (!n.datos.validacion || !n.datos.validacion.ok) throw new ErrorNegocio("El reporte EEGSA no está validado.");
            if (calculo.pendientes.length) throw new ErrorNegocio(`Falta el precio de: ${calculo.pendientes.join(", ")}.`);
        } else if (!n.codigo_empleado) {
            throw new ErrorNegocio("Selecciona un empleado.");
        }
        if (calculo.total < 0) throw new ErrorNegocio("El total a recibir no puede ser negativo.");

        const fecha = ahora();
        const snapshot = {
            tipo: n.tipo, tipoNombre: reglas.nombre, periodo: n.periodo,
            empleado: n.datos.empleado,
            inspector: n.datos.importacion ? (lecturaActual(n.datos.importacion) || {}).inspector || null : null,
            archivo: n.datos.importacion ? { nombre: n.datos.importacion.archivo.nombre, registros: n.datos.importacion.archivo.registros } : null,
            calculo,
            observaciones: n.datos.observaciones || "",
            pago: { forma_pago: (n.datos.pago && n.datos.pago.forma_pago) || require("../configuracion/nominas.config").EMPRESA.formaPagoDefecto, banco: n.datos.pago && n.datos.pago.banco, cuenta: n.datos.pago && n.datos.pago.cuenta },
            reglas: { tasas: reglas.tasas },
            aprobadoPor: ctx.usuario.nombre, idAprobador: ctx.usuario.id_credencial, fechaAprobacion: fecha
        };
        const { numero_recibo } = await repo.aprobar({
            id_nomina: n.id_nomina, version: n.version, snapshot, total: calculo.total,
            id_credencial: ctx.usuario.id_credencial, fecha, paso_actual: reglas.pasos.length, paso_completado: pasoAprobar
        });
        await repo.registrarHistorial([{ id_nomina: n.id_nomina, accion: "Nómina aprobada", campo: "total", valor_anterior: null,
            valor_nuevo: `${Calc.formatoQ(calculo.total)} · recibo No. ${numero_recibo}`, id_credencial: ctx.usuario.id_credencial, usuario: ctx.usuario.nombre, fecha }]);
        if (!esTecnico(n.tipo) || (n.datos.pago && (n.datos.pago.banco || n.datos.pago.cuenta))) {
            await repo.guardarPerfilPago({
                codigo_empleado: n.codigo_empleado,
                salario_base: esTecnico(n.tipo) ? undefined : (n.datos.planilla.salario_base ?? null),
                bonificacion: esTecnico(n.tipo) ? undefined : (calculo.ingresos ? calculo.ingresos[1].monto : null),
                forma_pago: n.datos.pago && n.datos.pago.forma_pago, banco: n.datos.pago && n.datos.pago.banco, cuenta: n.datos.pago && n.datos.pago.cuenta,
                id_credencial: ctx.usuario.id_credencial
            }).catch(() => {});
        }
        return vista(n.id_nomina);
    }

    /* ---------------- comprobante ---------------- */
    async function documento(id) {
        const n = await cargar(id);
        if (n.estado !== ESTADOS.APROBADA || !n.snapshot) throw new ErrorNegocio("El comprobante se genera al aprobar la nómina.", 409);
        const doc = armarDocumento(n.snapshot, n.numero_recibo, n.fecha_aprobacion);
        doc.nombreArchivo = nombreArchivoPdf(doc);
        return doc;
    }

    async function listar(filtros) {
        const lista = await repo.listar(filtros || {});
        return lista.map(x => ({
            id_nomina: x.id_nomina, tipo: x.tipo, tipoNombre: TIPOS[x.tipo] ? TIPOS[x.tipo].nombre : x.tipo,
            periodo: x.periodo, periodoNombre: Calc.nombrePeriodo(x.periodo), estado: x.estado,
            empleado: x.empleado_nombre || null, codigo_empleado: x.codigo_empleado,
            numero_recibo: x.numero_recibo, total: x.total_centavos, totalTexto: x.total_centavos != null ? Calc.formatoQ(x.total_centavos) : null,
            fecha_aprobacion: x.fecha_aprobacion, fecha_actualizacion: x.fecha_actualizacion || x.fecha_creacion || null,
            paso_actual: x.paso_actual
        }));
    }

    function reglasPublicas() {
        const tipos = {};
        Object.values(TIPOS).forEach(t => {
            // copia completa: el navegador usa las mismas reglas para mostrar
            // los totales al instante mientras se escribe (el servidor recalcula igual)
            tipos[t.clave] = { subtitulo: "", ...JSON.parse(JSON.stringify(t)) };
        });
        return { tipos, actividadesOficiales: ACTIVIDADES_OFICIALES, archivo: { extensiones: ARCHIVO.extensiones, tamanoMaximo: ARCHIVO.tamanoMaximo } };
    }

    return {
        reglasPublicas, vista, abrirOCrear, descartar, descartarBorradores, eliminarAprobada, importar, cancelarImportacion, validar,
        seleccionarInspector, irAPaso, completarPaso, editarValor, agregarDescuento, eliminarDescuento, seleccionarEmpleado,
        aprobar, documento, listar,
        historialAcciones: id => repo.historial(Number(id)),
        empleados: () => repo.empleadosActivos()
    };
}

module.exports = { crearServicioNominas, ErrorNegocio, ESTADOS };
