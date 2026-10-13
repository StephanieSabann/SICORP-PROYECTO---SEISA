const { generarPdfComprobante } = require("../utilidades/pdfComprobante");

/* ============================================================
   Controlador de NÓMINAS: traduce HTTP ⇄ servicio.
   Toda regla de negocio está en servicios/nominas.servicio.js.
   ============================================================ */

function crearControladorNominas(servicio, resolverUsuario) {

    function responderError(res, error) {
        const status = error.status || (error.esArchivo ? 400 : 500);
        if (status >= 500) console.error("[Nóminas]", error);
        res.status(status).json({
            exito: false,
            mensaje: status >= 500 ? `Ocurrió un error en el servidor (${error.message}).` : error.message,
            ...(error.extra || {})
        });
    }

    /* Envuelve cada acción: arma el contexto (quién lo hace) y maneja errores. */
    const accion = fn => async (req, res) => {
        try {
            const ctx = { usuario: await resolverUsuario(req) };
            const datos = await fn(req, ctx, res);
            if (!res.headersSent) res.json({ exito: true, datos });
        } catch (error) {
            responderError(res, error);
        }
    };

    return {
        reglas: accion(() => servicio.reglasPublicas()),
        empleados: accion(() => servicio.empleados()),
        listar: accion(req => servicio.listar({
            texto: (req.query.texto || "").trim() || undefined,
            tipo: req.query.tipo || undefined,
            periodo: req.query.periodo || undefined,
            estado: req.query.estado || undefined,
            codigo_empleado: req.query.codigo_empleado || undefined,
            estados: req.query.borradores ? ["EN_PREPARACION", "PENDIENTE_APROBACION"] : undefined
        })),
        abrirOCrear: accion((req, ctx) => servicio.abrirOCrear({
            tipo: req.body.tipo, periodo: req.body.periodo, codigo_empleado: req.body.codigo_empleado || null
        }, ctx)),
        vista: accion(req => servicio.vista(req.params.id)),
        historial: accion(req => servicio.historialAcciones(req.params.id)),
        descartar: accion((req, ctx) => servicio.descartar(req.params.id, ctx)),
        descartarBorradores: accion((req, ctx) => servicio.descartarBorradores(ctx)),
        eliminarAprobada: accion((req, ctx) => servicio.eliminarAprobada(req.params.id, req.body && req.body.motivo, ctx)),
        importar: accion((req, ctx) => servicio.importar(req.params.id, req.file, ctx)),
        seleccionarInspector: accion((req, ctx) => servicio.seleccionarInspector(req.params.id, req.body.nombre, ctx)),
        cancelarImportacion: accion((req, ctx) => servicio.cancelarImportacion(req.params.id, ctx)),
        validar: accion((req, ctx) => servicio.validar(req.params.id, ctx)),
        irAPaso: accion((req, ctx) => servicio.irAPaso(req.params.id, req.params.paso, ctx)),
        completarPaso: accion((req, ctx) => servicio.completarPaso(req.params.id, req.params.paso, ctx)),
        editarValor: accion((req, ctx) => servicio.editarValor(req.params.id, req.body.campo, req.body.valor, ctx)),
        agregarDescuento: accion((req, ctx) => servicio.agregarDescuento(req.params.id, req.body, ctx)),
        eliminarDescuento: accion((req, ctx) => servicio.eliminarDescuento(req.params.id, req.params.idDescuento, ctx)),
        seleccionarEmpleado: accion((req, ctx) => servicio.seleccionarEmpleado(req.params.id, req.body.codigo_empleado, ctx)),
        aprobar: accion((req, ctx) => servicio.aprobar(req.params.id, req.body.version, ctx)),
        comprobante: accion(req => servicio.documento(req.params.id)),
        pdf: async (req, res) => {
            try {
                await resolverUsuario(req);
                const doc = await servicio.documento(req.params.id);
                const buffer = await generarPdfComprobante(doc);
                res.setHeader("Content-Type", "application/pdf");
                res.setHeader("Content-Length", buffer.length);
                res.setHeader("Content-Disposition", `attachment; filename="${doc.nombreArchivo}"`);
                res.setHeader("X-Nombre-Archivo", encodeURIComponent(doc.nombreArchivo));
                res.end(buffer);
            } catch (error) {
                responderError(res, error);
            }
        }
    };
}

module.exports = { crearControladorNominas };
