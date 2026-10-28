const U = require("./reportes/util");
const A = require("./reportes/agregadores");
const E = require("./reportes/exportador");
const { REPORTES, porClave } = require("./reportes/definiciones");
const GR = require("./reportes/graficas");
const { graficasDeFilas } = require("./reportes/graficasFilas");
const { PARAMETROS, validarParametro, resolverParametros, FRECUENCIAS, FORMATOS } = require("../configuracion/reportes.config");

/* ============================================================
   Servicio de REPORTES
   ------------------------------------------------------------
   Une el repositorio (SQL Server o memoria), los agregadores y
   las definiciones de reportes con: permisos por módulo, caché,
   búsqueda/orden/paginación, exportación, bitácora, parámetros,
   reportes programados y chequeos de calidad de datos.
   No sabe de HTTP ni de SQL.
   ============================================================ */

class ErrorReporte extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

const SECCIONES = {
    empleados: { acceso: "Empleados", titulo: "Dashboard de empleados" },
    inventario: { acceso: "Inventario", titulo: "Dashboard de inventario" },
    nominas: { acceso: "Nóminas", titulo: "Dashboard de nóminas" }
};

/* "Nóminas" y "Nominas" son el mismo acceso. */
function tieneAcceso(accesos, nombre) {
    const n = U.normalizar(nombre);
    const lista = (accesos || []).map(U.normalizar);
    if (n === "nominas") return lista.includes("nominas") || lista.includes("nomina");
    return lista.includes(n);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function crearServicioReportes({ repo, ahora = () => new Date(), enviarCorreo = null }) {
    const cache = new Map();

    /* ---------------- parámetros ---------------- */
    async function parametrosEfectivos() {
        return resolverParametros(await repo.parametros());
    }

    function exigirAcceso(ctx, nombre) {
        if (!tieneAcceso(ctx.accesos, nombre)) throw new ErrorReporte(`Tu rol no tiene acceso a los datos de ${nombre}.`, 403);
    }
    function periodoOActual(periodo) {
        if (periodo === undefined || periodo === null || periodo === "") return U.periodoActual(ahora());
        if (!U.periodoValido(periodo)) throw new ErrorReporte("El período debe tener el formato AAAA-MM.");
        // Un mes que todavía no llega no tiene información: el servidor lo rechaza aunque alguien escriba la dirección a mano.
        const maximo = U.periodoActual(ahora());
        if (periodo > maximo) throw new ErrorReporte(`${U.nombrePeriodo(periodo)} todavía no ha llegado. El último período disponible es ${U.nombrePeriodo(maximo)}.`, 409);
        return periodo;
    }

    /* ---------------- caché ---------------- */
    async function conCache(clave, refrescar, calcular) {
        const params = await parametrosEfectivos();
        const ttl = params.cache_segundos * 1000;
        const guardado = cache.get(clave);
        if (!refrescar && ttl > 0 && guardado && ahora().getTime() - guardado.momento < ttl) return { ...guardado.valor, desdeCache: true };
        const valor = await calcular(params);
        valor.actualizado = ahora().toISOString();
        if (ttl > 0) cache.set(clave, { momento: ahora().getTime(), valor });
        return { ...valor, desdeCache: false };
    }
    function limpiarCache() { const n = cache.size; cache.clear(); return n; }
    const estadoCache = () => ({ entradas: cache.size, claves: [...cache.keys()] });

    /* ---------------- dashboards ---------------- */
    async function construirEmpleados(periodo, params) {
        const [empleados, permisos] = await Promise.all([repo.empleados(), repo.permisos()]);
        return A.dashboardEmpleados({ empleados, permisos }, periodo, params, U.hoyISO(ahora()));
    }
    async function construirInventario(periodo, params) {
        const anterior = U.sumarMeses(periodo, -1);
        const [recursos, categorias, movimientos, entregasPendientes, ultimoConteo, ultimaEntrada] = await Promise.all([
            repo.recursos(), repo.categorias(),
            repo.movimientos({ desde: U.rangoPeriodo(anterior).desde, hasta: U.rangoPeriodo(periodo).hasta }),
            repo.entregasPendientes(), repo.ultimoConteo(), repo.ultimaEntrada()
        ]);
        return A.dashboardInventario({ recursos, categorias, movimientos, entregasPendientes, ultimoConteo, ultimaEntrada }, periodo, params, U.hoyISO(ahora()));
    }
    async function construirNominas(periodo, params) {
        const desde = U.sumarMeses(periodo, -Math.max(params.meses_historial - 1, 1));
        const [nominas, empleados, cerrados] = await Promise.all([
            repo.nominas({ desdePeriodo: desde, hastaPeriodo: periodo }), repo.empleados(), repo.periodosNominaCerrados()
        ]);
        return A.dashboardNominas({ nominas, empleados, cerrados }, periodo, params);
    }
    const CONSTRUCTORES = { empleados: construirEmpleados, inventario: construirInventario, nominas: construirNominas };

    async function dashboard(seccion, periodo, ctx, { refrescar = false } = {}) {
        const def = SECCIONES[seccion];
        if (!def) throw new ErrorReporte("Ese dashboard no existe.", 404);
        exigirAcceso(ctx, def.acceso);
        periodo = periodoOActual(periodo);
        return conCache(`${seccion}|${periodo}|${U.hoyISO(ahora())}`, refrescar, params => CONSTRUCTORES[seccion](periodo, params));
    }

    async function resumen(periodo, ctx, { refrescar = false } = {}) {
        periodo = periodoOActual(periodo);
        const partes = {};
        for (const seccion of Object.keys(SECCIONES)) {
            if (tieneAcceso(ctx.accesos, SECCIONES[seccion].acceso)) {
                const d = await dashboard(seccion, periodo, ctx, { refrescar });
                partes[seccion === "empleados" ? "emp" : seccion === "inventario" ? "inv" : "nom"] = d;
            }
        }
        const r = A.resumenGeneral(partes, periodo);
        r.secciones = Object.keys(SECCIONES).filter(s => tieneAcceso(ctx.accesos, SECCIONES[s].acceso));
        r.reportes = await catalogo(ctx);
        r.reportes = await Promise.all(r.reportes.map(async rep => {
            try {
                const { filas } = await prepararTabla(rep.clave, { periodo }, ctx);
                const g = graficasDeFilas(rep.clave, filas)[0];
                if (g) { const { tabla: _t, ...miniatura } = g; return { ...rep, miniatura: { ...miniatura, filas: filas.length } }; }
                return { ...rep, miniatura: null, filas: filas.length };
            } catch (_) { return { ...rep, miniatura: null }; }
        }));
        r.actualizado = ahora().toISOString();
        return r;
    }


    /* ---------------- gráficas de los dashboards (con filtros propios) ---------------- */
    async function contextoGraficas(seccion, periodo, ctx) {
        const def = SECCIONES[seccion];
        if (!def) throw new ErrorReporte("Ese dashboard no existe.", 404);
        exigirAcceso(ctx, def.acceso);
        periodo = periodoOActual(periodo);
        const params = await parametrosEfectivos();
        return { periodo, c: GR.crearContexto({ repo, params, hoy: U.hoyISO(ahora()), periodo }) };
    }
    /* Todas las gráficas de una pestaña con sus filtros en el valor por defecto. */
    async function graficasSeccion(seccion, periodo, ctx) {
        const { periodo: p, c } = await contextoGraficas(seccion, periodo, ctx);
        const lista = GR.GRAFICAS.filter(g => g.seccion === seccion);
        const graficas = await Promise.all(lista.map(async g => {
            try { return await GR.resolverGrafica(g, c, {}); }
            catch (error) { console.error(`[Reportes] Gráfica ${seccion}/${g.id}:`, error.message); return { id: g.id, titulo: g.titulo, sub: g.sub, tipo: g.tipo, ancho: g.ancho, filtros: [], filtrosAplicados: {}, error: "No se pudo calcular esta gráfica." }; }
        }));
        return { seccion, periodo: p, periodoNombre: U.nombrePeriodo(p), graficas, actualizado: ahora().toISOString() };
    }
    /* Una sola gráfica con los filtros que eligió la persona. */
    async function graficaUna(seccion, id, periodo, filtros, ctx) {
        const def = GR.grafica(seccion, id);
        if (!def) throw new ErrorReporte("Esa gráfica no existe.", 404);
        const { c } = await contextoGraficas(seccion, periodo, ctx);
        return GR.resolverGrafica(def, c, filtros || {});
    }

    /* ---------------- catálogo y períodos ---------------- */
    async function catalogo(ctx, { incluirOcultos = false } = {}) {
        const visibilidad = await repo.visibilidad();
        return REPORTES
            .filter(r => tieneAcceso(ctx.accesos, r.acceso))
            .filter(r => incluirOcultos || visibilidad[r.clave] !== false)
            .map(r => ({
                clave: r.clave, modulo: r.modulo, titulo: r.titulo, subtitulo: r.subtitulo, descripcion: r.descripcion,
                icono: r.icono, conPeriodo: r.conPeriodo, visible: visibilidad[r.clave] !== false
            }));
    }

    function periodos() {
        const actual = U.periodoActual(ahora());
        const lista = [];
        // Los meses que faltan del año en curso se muestran en gris (disponible: false) y no se pueden elegir.
        for (let i = 12 - Number(actual.slice(5)); i >= 1; i--) { const p = U.sumarMeses(actual, i); lista.push({ valor: p, etiqueta: U.nombrePeriodo(p), disponible: false }); }
        for (let i = 0; i < 24; i++) { const p = U.sumarMeses(actual, -i); lista.push({ valor: p, etiqueta: U.nombrePeriodo(p), disponible: true }); }
        return { actual, opciones: lista };
    }

    /* ---------------- reportes tabulares ---------------- */
    function definicion(clave, ctx) {
        const def = porClave[clave];
        if (!def) throw new ErrorReporte("Ese reporte no existe.", 404);
        exigirAcceso(ctx, def.acceso);
        return def;
    }

    async function normalizarFiltros(def, entrada, ctxBase) {
        const disponibles = def.filtros ? await def.filtros(ctxBase) : [];
        const valores = {};
        disponibles.forEach(f => {
            const pedido = entrada && entrada[f.clave] !== undefined ? String(entrada[f.clave]) : f.defecto;
            valores[f.clave] = f.opciones.some(o => o.valor === pedido) ? pedido : f.defecto;
        });
        return { disponibles, valores };
    }

    const textoFiltros = (disponibles, valores) => disponibles
        .filter(f => valores[f.clave] !== "" && valores[f.clave] !== undefined)
        .map(f => `${f.etiqueta}: ${(f.opciones.find(o => o.valor === valores[f.clave]) || {}).etiqueta || valores[f.clave]}`).join(" · ");

    function buscar(filas, texto, columnas) {
        const q = U.normalizar(texto);
        if (!q) return filas;
        return filas.filter(f => columnas.some(c => f[c.campo] !== null && f[c.campo] !== undefined && U.normalizar(f[c.campo]).includes(q)));
    }
    function ordenar(filas, campo, dir, columnas) {
        const col = columnas.find(c => c.campo === campo);
        if (!col) return filas;
        const factor = dir === "desc" ? -1 : 1;
        const numerico = ["entero", "decimal", "moneda"].includes(col.tipo);
        return [...filas].sort((a, b) => {
            const x = a[campo], y = b[campo];
            const nx = x === null || x === undefined || x === "", ny = y === null || y === undefined || y === "";
            if (nx || ny) return nx && ny ? 0 : nx ? 1 : -1; // vacíos siempre al final
            return factor * (numerico ? Number(x) - Number(y) : String(x).localeCompare(String(y), "es", { numeric: true, sensitivity: "base" }));
        });
    }
    function totalesDe(def, filas) {
        if (!def.totales || !filas.length) return null;
        const t = {};
        def.totales.forEach(c => { t[c] = U.redondear2(filas.reduce((s, f) => s + (Number(f[c]) || 0), 0)); });
        return t;
    }

    async function prepararTabla(clave, opciones, ctx) {
        const def = definicion(clave, ctx);
        const periodo = def.conPeriodo ? periodoOActual(opciones.periodo) : null;
        const params = await parametrosEfectivos();
        const ctxBase = { repo, params, hoy: U.hoyISO(ahora()), periodo, ahora: ahora() };
        const { disponibles, valores } = await normalizarFiltros(def, opciones.filtros, ctxBase);
        let filas = await def.filas({ ...ctxBase, filtros: valores });
        const sinBuscar = filas.length;
        filas = buscar(filas, opciones.texto, def.columnas);
        filas = ordenar(filas, opciones.orden, opciones.dir, def.columnas);
        return { def, periodo, params, disponibles, valores, filas, sinBuscar };
    }

    async function tabla(clave, opciones = {}, ctx) {
        const { def, periodo, disponibles, valores, filas, sinBuscar } = await prepararTabla(clave, opciones, ctx);
        const porPagina = Math.max(5, Math.min(200, Number(opciones.porPagina) || 15));
        const paginas = Math.max(1, Math.ceil(filas.length / porPagina));
        const pagina = Math.max(1, Math.min(paginas, Number(opciones.pagina) || 1));
        return {
            clave: def.clave, modulo: def.modulo, titulo: def.titulo, subtitulo: def.subtitulo, descripcion: def.descripcion,
            conPeriodo: def.conPeriodo, periodo, periodoNombre: periodo ? U.nombrePeriodo(periodo) : null,
            columnas: def.columnas, filtros: disponibles, filtrosAplicados: valores,
            filas: filas.slice((pagina - 1) * porPagina, pagina * porPagina),
            total: filas.length, totalSinBuscar: sinBuscar, pagina, paginas, porPagina,
            totales: totalesDe(def, filas), graficas: graficasDeFilas(def.clave, filas), actualizado: ahora().toISOString()
        };
    }

    /* ---------------- exportación ---------------- */
    async function exportarTabla(clave, opciones = {}, ctx, { formato = "xlsx" } = {}) {
        if (!FORMATOS.includes(formato)) throw new ErrorReporte("Formato de exportación no válido (xlsx o csv).");
        const inicio = Date.now();
        const { def, periodo, params, disponibles, valores, filas } = await prepararTabla(clave, opciones, ctx);
        if (filas.length > params.maximo_filas_exportar) {
            throw new ErrorReporte(`El reporte tiene ${filas.length} filas y el máximo para exportar es ${params.maximo_filas_exportar}. Aplica filtros para reducirlo.`, 413);
        }
        const meta = { usuario: ctx.usuario && ctx.usuario.nombre, fecha: ahora(), periodoNombre: periodo ? U.nombrePeriodo(periodo) : "", filtrosTexto: textoFiltros(disponibles, valores) };
        const buffer = formato === "csv" ? E.csvDeTabla(def.columnas, filas) : E.excelDeTabla(def, filas, meta);
        await bitacora({ accion: "EXPORTAR", reporte: def.clave, formato, periodo, filtros: meta.filtrosTexto, filas: filas.length, duracion_ms: Date.now() - inicio }, ctx);
        return {
            buffer, formato, filas: filas.length,
            nombre: E.nombreArchivo(`${def.titulo} ${def.subtitulo}`, formato, periodo),
            mime: formato === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        };
    }

    async function exportarDashboard(seccion, periodo, ctx) {
        const inicio = Date.now();
        const d = await dashboard(seccion, periodo, ctx, { refrescar: true });
        const buffer = E.excelDeDashboard(d, SECCIONES[seccion].titulo, { usuario: ctx.usuario && ctx.usuario.nombre, fecha: ahora() });
        await bitacora({ accion: "EXPORTAR", reporte: `dashboard_${seccion}`, formato: "xlsx", periodo: d.periodo, filas: (d.tablas || []).reduce((s, t) => s + t.filas.length, 0), duracion_ms: Date.now() - inicio }, ctx);
        return { buffer, nombre: E.nombreArchivo(SECCIONES[seccion].titulo, "xlsx", d.periodo), mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    }

    async function bitacora(b, ctx) {
        try {
            await repo.registrarBitacora({ ...b, id_credencial: ctx.usuario && ctx.usuario.id_credencial, usuario: ctx.usuario && ctx.usuario.nombre });
        } catch (error) {
            console.error("[Reportes] No se pudo guardar la bitácora:", error.message);
        }
    }

    /* ============================================================
       MANTENIMIENTO
       ============================================================ */
    async function parametrosParaEditar() {
        const guardados = await repo.parametros();
        const efectivos = resolverParametros(guardados);
        return PARAMETROS.map(p => ({
            clave: p.clave, grupo: p.grupo, nombre: p.nombre, ayuda: p.ayuda, tipo: p.tipo, unidad: p.unidad || "",
            minimo: p.minimo, maximo: p.maximo, defecto: String(p.defecto),
            valor: Array.isArray(efectivos[p.clave]) ? efectivos[p.clave].join(",") : String(efectivos[p.clave]),
            personalizado: guardados[p.clave] !== undefined
        }));
    }

    async function guardarParametros(valores, ctx) {
        const limpios = {};
        for (const [clave, bruto] of Object.entries(valores || {})) {
            const r = validarParametro(clave, bruto);
            if (r.error) throw new ErrorReporte(r.error);
            limpios[clave] = r.valor;
        }
        if (!Object.keys(limpios).length) throw new ErrorReporte("No hay cambios que guardar.");
        for (const [clave, valor] of Object.entries(limpios)) {
            await repo.guardarParametro({ clave, valor, id_credencial: ctx.usuario && ctx.usuario.id_credencial });
        }
        limpiarCache();
        return parametrosParaEditar();
    }

    async function listaVisibilidad() {
        const v = await repo.visibilidad();
        return REPORTES.map(r => ({ clave: r.clave, modulo: r.modulo, titulo: `${r.titulo} — ${r.subtitulo}`, activo: v[r.clave] !== false }));
    }
    async function cambiarVisibilidad(clave, activo, ctx) {
        if (!porClave[clave]) throw new ErrorReporte("Ese reporte no existe.", 404);
        await repo.guardarVisibilidad({ clave, activo: !!activo, id_credencial: ctx.usuario && ctx.usuario.id_credencial });
        return listaVisibilidad();
    }

    async function listarBitacora(f = {}) {
        const pagina = Math.max(1, Number(f.pagina) || 1), porPagina = Math.max(5, Math.min(100, Number(f.porPagina) || 15));
        const r = await repo.listarBitacora({ reporte: f.reporte || undefined, usuario: (f.usuario || "").trim() || undefined, pagina, porPagina });
        return {
            filas: r.filas.map(x => ({ ...x, fecha: U.aISOHora(x.fecha), reporteNombre: nombreDeReporte(x.reporte) })),
            total: r.total, pagina, paginas: Math.max(1, Math.ceil(r.total / porPagina)), porPagina
        };
    }
    function nombreDeReporte(clave) {
        if (porClave[clave]) return `${porClave[clave].titulo} — ${porClave[clave].subtitulo}`;
        const m = String(clave).match(/^dashboard_(.+)$/);
        return m && SECCIONES[m[1]] ? SECCIONES[m[1]].titulo : clave;
    }
    async function depurarBitacora() {
        const params = await parametrosEfectivos();
        const borradas = await repo.depurarBitacora(params.dias_conservar_bitacora);
        return { borradas, dias: params.dias_conservar_bitacora };
    }

    /* ---------- costos de recursos ---------- */
    async function costosRecursos() {
        return (await repo.recursos()).map(r => ({
            id_recurso: r.id_recurso, codigo: r.codigo, nombre: r.nombre, categoria: r.categoria,
            cantidad_total: Number(r.cantidad_total) || 0, costo_unitario: r.costo_unitario
        }));
    }
    async function guardarCosto(id_recurso, valor, ctx) {
        let costo = null;
        if (valor !== null && valor !== "" && valor !== undefined) {
            const limpio = String(valor).replace(/[Qq\s,]/g, "");
            if (!/^\d{1,9}(\.\d{1,2})?$/.test(limpio)) throw new ErrorReporte("Escribe un costo válido (ej. 125.50).");
            costo = Number(limpio);
        }
        const ok = await repo.guardarCostoRecurso({ id_recurso: Number(id_recurso), costo_unitario: costo });
        if (!ok) throw new ErrorReporte("No se encontró ese recurso.", 404);
        limpiarCache();
        return { id_recurso: Number(id_recurso), costo_unitario: costo };
    }

    /* ---------- calidad de datos ---------- */
    async function calidadDatos() {
        const [empleados, recursos, entregas, nominas] = await Promise.all([
            repo.empleados(), repo.recursos(), repo.entregasPendientes(),
            repo.nominas({ desdePeriodo: U.sumarMeses(U.periodoActual(ahora()), -12), hastaPeriodo: U.periodoActual(ahora()) })
        ]);
        const activos = empleados.filter(e => e.activo);
        const nombres = (lista, f) => lista.slice(0, 4).map(f);
        const hallazgo = (clave, titulo, lista, f, severidad, reporte) => ({ clave, titulo, cantidad: lista.length, severidad: lista.length ? severidad : "ok", ejemplos: nombres(lista, f), reporte: reporte || null });
        const nom = e => U.nombreCompleto(e);
        const limite = U.sumarMeses(U.periodoActual(ahora()), -2);
        const borradoresViejos = nominas.filter(n => n.estado !== "APROBADA" && n.periodo < limite);
        const inactivosConEntrega = entregas.filter(en => { const e = empleados.find(x => x.codigo_empleado === en.id_empleado); return e && !e.activo; });
        return [
            hallazgo("tecnicos_sin_clasificar", "Técnicos activos sin clasificar (socio / no socio)", activos.filter(e => A.esTecnico(e) && !e.tipo_empleado), nom, "aviso", "empleados_activos"),
            hallazgo("sin_fecha_contratacion", "Empleados activos sin fecha de contratación", activos.filter(e => !U.aISO(e.fecha_contratacion)), nom, "aviso", "expedientes_laborales"),
            hallazgo("expedientes_incompletos", "Empleados activos con DPI, NIT o contacto sin registrar", activos.filter(e => !e.dpi || !e.nit || !e.telefono || !e.email), nom, "info", "expedientes_laborales"),
            hallazgo("administrativos_sin_salario", "Auxiliares y administrativos sin salario base", activos.filter(e => ["AUXILIAR", "ADMINISTRATIVO"].includes(e.tipo_empleado) && !e.salario_base), nom, "info", "expedientes_laborales"),
            hallazgo("recursos_sin_costo", "Recursos sin costo unitario (inversión incompleta)", recursos.filter(r => r.costo_unitario === null || r.costo_unitario === undefined), r => `${r.codigo} ${r.nombre}`, "info"),
            hallazgo("recursos_sin_minimo", "Recursos sin cantidad mínima (nunca alertan stock bajo)", recursos.filter(r => !Number(r.cantidad_minima)), r => `${r.codigo} ${r.nombre}`, "info", "inventario_existencias"),
            hallazgo("disponible_mayor_total", "Recursos con más disponibles que existencias (error de datos)", recursos.filter(r => Number(r.cantidad_disponible) > Number(r.cantidad_total)), r => `${r.codigo} ${r.nombre}`, "critico", "inventario_existencias"),
            hallazgo("entregas_a_inactivos", "Entregas sin devolver a empleados inactivos", inactivosConEntrega, en => `${en.recurso_nombre} → ${nom({ nombre: en.empleado_nombre, apellido: en.empleado_apellido })}`, "critico", "inventario_entregas_pendientes"),
            hallazgo("nominas_atrasadas", "Nóminas sin aprobar de períodos anteriores", borradoresViejos, n => `${n.empleado_nombre || "Sin empleado"} (${n.periodo})`, "aviso", "nominas_planilla")
        ];
    }

    /* ============================================================
       REPORTES PROGRAMADOS
       ============================================================ */
    function validarProgramado(d) {
        const nombre = String(d.nombre || "").trim();
        if (!nombre || nombre.length > 100) throw new ErrorReporte("Escribe un nombre para el envío (máximo 100 caracteres).");
        const def = porClave[d.reporte];
        if (!def) throw new ErrorReporte("Elige el reporte que se va a enviar.");
        const formato = d.formato || "xlsx";
        if (!FORMATOS.includes(formato)) throw new ErrorReporte("El formato debe ser xlsx o csv.");
        const frecuencia = String(d.frecuencia || "").toUpperCase();
        if (!FRECUENCIAS.includes(frecuencia)) throw new ErrorReporte("Elige la frecuencia: diaria, semanal o mensual.");
        let dia = null;
        if (frecuencia === "SEMANAL") { dia = Number(d.dia); if (!Number.isInteger(dia) || dia < 1 || dia > 7) throw new ErrorReporte("Elige el día de la semana."); }
        if (frecuencia === "MENSUAL") { dia = Number(d.dia); if (!Number.isInteger(dia) || dia < 1 || dia > 28) throw new ErrorReporte("El día del mes debe estar entre 1 y 28."); }
        const hora = String(d.hora || "07:00");
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new ErrorReporte("La hora debe tener el formato HH:MM.");
        const correos = String(d.destinatarios || "").split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
        if (!correos.length) throw new ErrorReporte("Escribe al menos un correo destinatario.");
        if (correos.length > 10) throw new ErrorReporte("Máximo 10 destinatarios por envío.");
        const malo = correos.find(c => !EMAIL.test(c));
        if (malo) throw new ErrorReporte(`"${malo}" no es un correo válido.`);
        return { nombre, reporte: d.reporte, formato, frecuencia, dia, hora, destinatarios: correos.join(", "), activo: d.activo !== false && d.activo !== 0 };
    }

    async function listarProgramados() {
        return (await repo.listarProgramados()).map(p => ({
            ...p, reporteNombre: nombreDeReporte(p.reporte),
            ultima_ejecucion: U.aISOHora(p.ultima_ejecucion), proxima: proximaEjecucion(p)
        }));
    }
    async function crearProgramado(d, ctx) {
        const v = validarProgramado(d);
        const creado = await repo.crearProgramado({ ...v, id_credencial: ctx.usuario && ctx.usuario.id_credencial });
        return { ...creado, reporteNombre: nombreDeReporte(creado.reporte) };
    }
    async function actualizarProgramado(id, d) {
        const actual = await repo.obtenerProgramado(Number(id));
        if (!actual) throw new ErrorReporte("No se encontró ese envío programado.", 404);
        const v = validarProgramado({ ...actual, ...d });
        return repo.actualizarProgramado(Number(id), v);
    }
    async function eliminarProgramado(id) {
        if (!(await repo.obtenerProgramado(Number(id)))) throw new ErrorReporte("No se encontró ese envío programado.", 404);
        await repo.eliminarProgramado(Number(id));
    }

    /* Última vez que "tocaba" enviar según la frecuencia (hora local del servidor). */
    function ultimaProgramada(p, ref) {
        const [h, m] = String(p.hora || "07:00").split(":").map(Number);
        const en = (y, mes, d) => new Date(y, mes, d, h, m, 0, 0);
        if (p.frecuencia === "DIARIA") {
            let t = en(ref.getFullYear(), ref.getMonth(), ref.getDate());
            if (t > ref) t = en(ref.getFullYear(), ref.getMonth(), ref.getDate() - 1);
            return t;
        }
        if (p.frecuencia === "SEMANAL") {
            const hoySem = ref.getDay() === 0 ? 7 : ref.getDay();
            let atras = (hoySem - p.dia + 7) % 7;
            let t = en(ref.getFullYear(), ref.getMonth(), ref.getDate() - atras);
            if (t > ref) t = en(ref.getFullYear(), ref.getMonth(), ref.getDate() - atras - 7);
            return t;
        }
        let t = en(ref.getFullYear(), ref.getMonth(), p.dia);
        if (t > ref) t = en(ref.getFullYear(), ref.getMonth() - 1, p.dia);
        return t;
    }
    function proximaEjecucion(p) {
        if (!p.activo) return null;
        const ref = ahora();
        const ultima = ultimaProgramada(p, ref);
        const [h, m] = String(p.hora).split(":").map(Number);
        let siguiente;
        if (p.frecuencia === "DIARIA") siguiente = new Date(ultima.getFullYear(), ultima.getMonth(), ultima.getDate() + 1, h, m);
        else if (p.frecuencia === "SEMANAL") siguiente = new Date(ultima.getFullYear(), ultima.getMonth(), ultima.getDate() + 7, h, m);
        else siguiente = new Date(ultima.getFullYear(), ultima.getMonth() + 1, p.dia, h, m);
        const dos = n => String(n).padStart(2, "0");
        return `${siguiente.getFullYear()}-${dos(siguiente.getMonth() + 1)}-${dos(siguiente.getDate())} ${dos(siguiente.getHours())}:${dos(siguiente.getMinutes())}`;
    }

    async function ejecutarProgramado(id, { manual = false } = {}) {
        const p = await repo.obtenerProgramado(Number(id));
        if (!p) throw new ErrorReporte("No se encontró ese envío programado.", 404);
        const ctxSistema = { accesos: ["Empleados", "Inventario", "Nóminas"], usuario: { id_credencial: null, nombre: `Envío programado: ${p.nombre}` } };
        let estado;
        try {
            const r = await exportarTabla(p.reporte, { periodo: U.periodoActual(ahora()) }, ctxSistema, { formato: p.formato });
            if (!enviarCorreo) {
                estado = "Correo no configurado (falta EMAIL_USUARIO y EMAIL_CLAVE en .env).";
            } else {
                const envio = await enviarCorreo({
                    para: p.destinatarios, asunto: `SICORP — ${nombreDeReporte(p.reporte)} (${U.nombrePeriodo(U.periodoActual(ahora()))})`,
                    texto: `Hola,\n\nAdjuntamos el reporte "${nombreDeReporte(p.reporte)}" generado automáticamente por SICORP — SEISA.\n\nFilas: ${r.filas}\n\nEste mensaje se envió por el envío programado "${p.nombre}".`,
                    adjuntos: [{ filename: r.nombre, content: r.buffer }]
                });
                estado = envio && envio.enviado ? `Enviado a ${p.destinatarios} (${r.filas} filas)` : `No se envió: ${(envio && envio.motivo) || "error desconocido"}`;
            }
        } catch (error) {
            estado = `Error: ${error.message}`.slice(0, 240);
        }
        await repo.marcarEjecucion(p.id_programado, { fecha: ahora(), estado: (manual ? "(manual) " : "") + estado });
        await bitacora({ accion: "PROGRAMADO", reporte: p.reporte, formato: p.formato, filtros: estado.slice(0, 380) }, ctxSistema);
        return { estado };
    }

    /* Lo llama el programador cada minuto: ejecuta los que ya "tocaban". */
    async function ejecutarPendientes() {
        const ref = ahora();
        const lista = await repo.listarProgramados();
        const ejecutados = [];
        for (const p of lista) {
            if (!p.activo) continue;
            const toca = ultimaProgramada(p, ref);
            const base = Math.max(p.ultima_ejecucion ? new Date(p.ultima_ejecucion).getTime() : 0, p.fecha_creacion ? new Date(p.fecha_creacion).getTime() : 0);
            if (toca.getTime() > base && toca <= ref) {
                await ejecutarProgramado(p.id_programado);
                ejecutados.push(p.id_programado);
            }
        }
        return ejecutados;
    }

    return {
        ErrorReporte, tieneAcceso,
        periodos, catalogo, resumen, dashboard, graficasSeccion, graficaUna, tabla, exportarTabla, exportarDashboard,
        limpiarCache, estadoCache,
        parametrosParaEditar, guardarParametros, listaVisibilidad, cambiarVisibilidad,
        listarBitacora, depurarBitacora, costosRecursos, guardarCosto, calidadDatos,
        listarProgramados, crearProgramado, actualizarProgramado, eliminarProgramado, ejecutarProgramado, ejecutarPendientes,
        _ultimaProgramada: ultimaProgramada
    };
}

module.exports = { crearServicioReportes, ErrorReporte, SECCIONES, tieneAcceso };
