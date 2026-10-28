/* ============================================================
   Controlador de REPORTES: traduce HTTP ⇄ servicio.
   Toda la lógica está en servicios/reportes.servicio.js.
   ============================================================ */

function crearControladorReportes(servicio, resolverUsuario, obtenerAccesos) {

    function responderError(res, error) {
        const status = error.status || 500;
        if (status >= 500) console.error("[Reportes]", error);
        res.status(status).json({
            exito: false,
            mensaje: status >= 500 ? `Ocurrió un error en el servidor (${error.message}).` : error.message
        });
    }

    /* Arma el contexto (quién pide y qué módulos puede ver) y maneja errores. */
    const accion = fn => async (req, res) => {
        try {
            const ctx = { usuario: await resolverUsuario(req), accesos: await obtenerAccesos(req) };
            const datos = await fn(req, ctx, res);
            if (!res.headersSent) res.json({ exito: true, datos });
        } catch (error) {
            responderError(res, error);
        }
    };

    /* Los filtros de cada reporte llegan como f_<clave>=valor. */
    function filtrosDe(query) {
        const f = {};
        Object.keys(query || {}).forEach(k => { if (k.startsWith("f_")) f[k.slice(2)] = String(query[k]); });
        return f;
    }
    const opcionesTabla = q => ({
        periodo: q.periodo || undefined, texto: (q.texto || "").trim() || undefined, orden: q.orden || undefined,
        dir: q.dir === "desc" ? "desc" : "asc", pagina: q.pagina, porPagina: q.porPagina, filtros: filtrosDe(q)
    });

    function enviarArchivo(res, r) {
        res.setHeader("Content-Type", r.mime);
        res.setHeader("Content-Length", r.buffer.length);
        res.setHeader("Content-Disposition", `attachment; filename="${r.nombre}"`);
        res.setHeader("X-Nombre-Archivo", encodeURIComponent(r.nombre));
        res.end(r.buffer);
    }
    const descarga = fn => async (req, res) => {
        try {
            const ctx = { usuario: await resolverUsuario(req), accesos: await obtenerAccesos(req) };
            enviarArchivo(res, await fn(req, ctx));
        } catch (error) {
            responderError(res, error);
        }
    };

    return {
        periodos: accion(() => servicio.periodos()),
        catalogo: accion((req, ctx) => servicio.catalogo(ctx)),
        resumen: accion((req, ctx) => servicio.resumen(req.query.periodo, ctx, { refrescar: req.query.refrescar === "1" })),
        dashboard: accion((req, ctx) => servicio.dashboard(req.params.seccion, req.query.periodo, ctx, { refrescar: req.query.refrescar === "1" })),
        graficas: accion((req, ctx) => servicio.graficasSeccion(req.params.seccion, req.query.periodo, ctx)),
        grafica: accion((req, ctx) => servicio.graficaUna(req.params.seccion, req.params.id, req.query.periodo, filtrosDe(req.query), ctx)),
        exportarDashboard: descarga((req, ctx) => servicio.exportarDashboard(req.params.seccion, req.query.periodo, ctx)),
        tabla: accion((req, ctx) => servicio.tabla(req.params.clave, opcionesTabla(req.query), ctx)),
        exportarTabla: descarga((req, ctx) => servicio.exportarTabla(req.params.clave, opcionesTabla(req.query), ctx, { formato: req.query.formato === "csv" ? "csv" : (req.query.formato || "xlsx") })),

        // ----- mantenimiento -----
        parametros: accion(() => servicio.parametrosParaEditar()),
        guardarParametros: accion((req, ctx) => servicio.guardarParametros(req.body && req.body.valores, ctx)),
        visibilidad: accion(() => servicio.listaVisibilidad()),
        cambiarVisibilidad: accion((req, ctx) => servicio.cambiarVisibilidad(req.params.clave, req.body && req.body.activo, ctx)),
        bitacora: accion(req => servicio.listarBitacora({ reporte: req.query.reporte, usuario: req.query.usuario, pagina: req.query.pagina, porPagina: req.query.porPagina })),
        depurarBitacora: accion(() => servicio.depurarBitacora()),
        costos: accion(() => servicio.costosRecursos()),
        guardarCosto: accion((req, ctx) => servicio.guardarCosto(req.params.id, req.body && req.body.costo, ctx)),
        calidad: accion(() => servicio.calidadDatos()),
        programados: accion(() => servicio.listarProgramados()),
        crearProgramado: accion((req, ctx) => servicio.crearProgramado(req.body || {}, ctx)),
        actualizarProgramado: accion(req => servicio.actualizarProgramado(req.params.id, req.body || {})),
        eliminarProgramado: accion(req => servicio.eliminarProgramado(req.params.id)),
        ejecutarProgramado: accion(req => servicio.ejecutarProgramado(req.params.id, { manual: true })),
        estadoCache: accion(() => servicio.estadoCache()),
        limpiarCache: accion(() => ({ borradas: servicio.limpiarCache() }))
    };
}

module.exports = { crearControladorReportes };
