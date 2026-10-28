const { normalizar, nombrePeriodo } = require("../public/js/nominas-calculo");

/* ============================================================
   Validación del reporte EEGSA (paso 2)
   ------------------------------------------------------------
   Recibe lo que leyó utilidades/excelEEGSA.js y lo compara contra:
   el período elegido, los empleados registrados y el catálogo de
   actividades. Devuelve errores (bloquean el avance) y advertencias
   (se informan pero dejan continuar), siempre con la fila del Excel.
   ============================================================ */

function nombreCompleto(e) {
    return `${e.nombre || ""} ${e.apellido || ""}`.replace(/\s+/g, " ").trim();
}

/* Empleado cuyo nombre corresponde al inspector del reporte.
   Coincide si el nombre completo es igual o si todas las palabras
   de uno están en el otro (mínimo 2 palabras). */
function buscarEmpleadoPorInspector(inspector, empleados) {
    const objetivo = normalizar(inspector).split(" ").filter(Boolean);
    if (!objetivo.length) return { encontrados: [] };
    const exactos = empleados.filter(e => normalizar(nombreCompleto(e)) === objetivo.join(" "));
    if (exactos.length) return { encontrados: exactos };
    const parciales = empleados.filter(e => {
        const palabras = normalizar(nombreCompleto(e)).split(" ").filter(Boolean);
        if (palabras.length < 2 && objetivo.length < 2) return false;
        const [corta, larga] = palabras.length <= objetivo.length ? [palabras, objetivo] : [objetivo, palabras];
        return corta.length >= 2 && corta.every(p => larga.includes(p));
    });
    return { encontrados: parciales };
}

/* Números siempre con máximo 2 decimales en los mensajes. */
function num(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return String(n);
    return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const enFila = fila => fila ? ` (fila ${fila})` : "";

function validarImportacion(lectura, { periodo, empleados = [], oficiales = [], preciosConocidos = [] }) {
    const errores = [];
    const advertencias = [];
    const error = (mensaje, fila = null, campo = null, registros = null) => errores.push({ mensaje, fila, campo, registros, critico: true });
    const aviso = (mensaje, fila = null, campo = null) => advertencias.push({ mensaje, fila, campo, critico: false });

    if (!lectura.encabezadoEncontrado) {
        error('No se encontró el encabezado "Actividad". El reporte debe tener una columna Actividad y otra con la cantidad de órdenes (por ejemplo "Áreas: 1").', null, "Encabezado");
    } else if (lectura.columnaCantidad === null) {
        error("No se encontró la columna con la cantidad de órdenes junto a la columna Actividad.", null, "Encabezado");
    }

    // ---------- inspector ----------
    let empleado = null;
    if (!lectura.inspector) {
        error('No se encontró el nombre del inspector (una celda "Inspector:" con el nombre).', null, "Inspector");
    } else {
        const { encontrados } = buscarEmpleadoPorInspector(lectura.inspector, empleados);
        if (!encontrados.length) {
            error(`El inspector "${lectura.inspector}" no corresponde a ningún empleado activo registrado en Empleados.`, lectura.filaInspector, "Inspector");
        } else if (encontrados.length > 1) {
            error(`El inspector "${lectura.inspector}" coincide con varios empleados (${encontrados.map(nombreCompleto).join(", ")}). Escribe el nombre completo en el reporte.`, lectura.filaInspector, "Inspector");
        } else {
            empleado = encontrados[0];
        }
    }

    // ---------- período ----------
    if (lectura.ordenesSinActividad) {
        aviso(`${lectura.ordenesSinActividad} orden(es) de ${lectura.inspector} no tienen actividad (REPORTE) y no se contaron.`, null, "Actividad");
    }
    if (lectura.penalizaciones && lectura.penalizaciones.total) {
        aviso(`Se encontraron ${lectura.penalizaciones.detalle.length} penalización(es) de EEGSA por Q ${num(lectura.penalizaciones.total)} en la hoja Penalizaciones; se cargaron en "Calcular nómina" (puedes cambiarlas).`, null, "Penalizaciones");
    }

    if (!lectura.periodo) {
        aviso(`El archivo no indica el período; se tomará el período seleccionado (${nombrePeriodo(periodo)}).`, null, "Período");
    } else if (lectura.periodo !== periodo) {
        error(`El reporte es de ${nombrePeriodo(lectura.periodo)}, pero el período seleccionado es ${nombrePeriodo(periodo)}.`, null, "Período");
    } else if (lectura.origenPeriodo === "nombre_archivo") {
        aviso(`El período (${nombrePeriodo(periodo)}) se tomó del nombre del archivo.`, null, "Período");
    }

    // ---------- actividades ----------
    const clavesOficiales = new Set(oficiales.map(normalizar));
    const clavesConPrecio = new Set(preciosConocidos.map(normalizar));
    const vistas = new Map();
    const actividades = [];
    let suma = 0;

    lectura.actividades.forEach(a => {
        const fila = { fila: a.fila, nombre: a.nombre, cantidad: 0, estado: "ok", mensajes: [], nueva: false, extras: a.extras, areas: a.areas, deHoja: a.deHoja };
        const marcar = (estado, mensaje) => {
            if (estado === "error" || fila.estado === "ok") fila.estado = estado;
            fila.mensajes.push(mensaje);
        };

        if (!a.nombre) {
            marcar("error", "Fila con cantidad pero sin nombre de actividad.");
            error("Hay una cantidad sin nombre de actividad.", a.fila, "Actividad", 1);
        }

        const crudo = a.cantidadCruda;
        let cantidad = null;
        if (crudo === null || crudo === undefined || String(crudo).trim() === "") {
            marcar("advertencia", "Cantidad vacía: se tomó como 0.");
            aviso(`"${a.nombre}" no tiene cantidad; se tomó como 0.`, a.fila, "Cantidad");
            cantidad = 0;
        } else {
            const n = typeof crudo === "number" ? crudo : Number(String(crudo).replace(/,/g, "").trim());
            if (!Number.isFinite(n)) {
                marcar("error", `"${crudo}" no es un número.`);
                error(`La cantidad de "${a.nombre}" ("${crudo}") no es un número.`, a.fila, "Cantidad", 1);
            } else if (n < 0) {
                marcar("error", "Cantidad negativa.");
                error(`La cantidad de "${a.nombre}" es negativa (${num(n)}).`, a.fila, "Cantidad", 1);
            } else if (!Number.isInteger(n)) {
                marcar("error", `Cantidad con decimales (${num(n)}).`);
                error(`La cantidad de "${a.nombre}" tiene decimales (${num(n)}); deben ser órdenes completas. Puede que se haya cargado una hoja de montos en quetzales en lugar de la de órdenes.`, a.fila, "Cantidad", 1);
            } else {
                cantidad = n;
            }
        }
        if (cantidad !== null) { fila.cantidad = cantidad; suma += cantidad; }

        const clave = normalizar(a.nombre);
        if (clave) {
            if (vistas.has(clave)) {
                marcar("advertencia", `Repetida${enFila(vistas.get(clave))}; se sumaron las cantidades.`);
                aviso(`"${a.nombre}" aparece repetida; se sumaron sus cantidades.`, a.fila, "Actividad");
            } else {
                vistas.set(clave, a.fila || null);
            }
            if (!clavesOficiales.has(clave)) {
                fila.nueva = true;
                const conPrecio = clavesConPrecio.has(clave);
                marcar("advertencia", conPrecio ? "Actividad nueva (ya tiene precio guardado)." : "Actividad nueva: se le pondrá precio en Calcular nómina.");
                aviso(`"${a.nombre}" es una actividad nueva${a.deHoja ? ` (de la hoja ${a.deHoja})` : ""}; se agregó al final${conPrecio ? "" : " y necesita precio en Calcular nómina"}.`, a.fila, "Actividad");
            }
        }
        if (a.extras) {
            marcar("advertencia", "Trae columnas adicionales: " + Object.keys(a.extras).join(", "));
        }
        actividades.push(fila);
    });

    if (lectura.encabezadoEncontrado && !lectura.actividades.length) {
        error("El reporte no tiene ninguna actividad debajo del encabezado.", null, "Actividad");
    }
    if (lectura.columnasExtra.length) {
        aviso(`El archivo trae columnas adicionales que se conservaron como información: ${lectura.columnasExtra.join(", ")}.`, null, "Columnas");
    }

    // ---------- total general ----------
    let totalDeclarado = null;
    if (lectura.totalDeclarado === null || lectura.totalDeclarado === undefined || lectura.totalDeclarado === "") {
        aviso('No se encontró la fila "Total general"; se usará la suma de las actividades.', null, "Total general");
    } else {
        totalDeclarado = Number(String(lectura.totalDeclarado).replace(/,/g, ""));
        if (!Number.isFinite(totalDeclarado)) {
            error(`El "Total general" ("${lectura.totalDeclarado}") no es un número.`, lectura.filaTotal, "Total general");
            totalDeclarado = null;
        } else if (totalDeclarado !== suma && !errores.some(e => e.campo === "Cantidad")) {
            const donde = lectura.hojaTotal ? ` en la hoja "${lectura.hojaTotal}"` : "";
            error(`El total del archivo${donde} (${num(totalDeclarado)}) no coincide con la suma de las actividades (${num(suma)}). Diferencia: ${num(redondeo(totalDeclarado - suma))}.`, lectura.filaTotal, "Total general", lectura.actividades.length);
        }
    }

    return {
        ok: errores.length === 0,
        errores, advertencias, actividades,
        inspector: lectura.inspector,
        empleado: empleado ? { codigo_empleado: empleado.codigo_empleado, nombre: nombreCompleto(empleado), puesto: empleado.puesto || null, tipo_empleado: empleado.tipo_empleado || null } : null,
        totalCalculado: suma,
        totalDeclarado,
        areas: lectura.areas,
        formato: lectura.formato || "simple",
        registros: lectura.actividades.length
    };
}

const redondeo = n => Math.round(n * 100) / 100;

module.exports = { num, validarImportacion, buscarEmpleadoPorInspector, nombreCompleto };
