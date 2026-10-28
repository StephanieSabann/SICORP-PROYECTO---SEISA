const express = require("express");

/* /api/mantenimiento/nominas — configuración de nómina (solo administradores). */
function crearRutasNominasMantenimiento(servicio, resolverUsuario) {
    const r = express.Router();

    const accion = fn => async (req, res) => {
        try {
            const ctx = { usuario: await resolverUsuario(req) };
            const datos = await fn(req, ctx);
            res.json({ exito: true, datos });
        } catch (error) {
            const status = error.status || 500;
            if (status >= 500) console.error("[Nóminas · mantenimiento]", error);
            res.status(status).json({ exito: false, mensaje: status >= 500 ? `Ocurrió un error en el servidor (${error.message}).` : error.message, ...(error.extra || {}) });
        }
    };

    r.get("/tipos", accion(() => servicio.tipos()));
    r.get("/parametros", accion(req => servicio.parametros(req.query.tipo, req.query.periodo)));
    r.put("/parametros", accion((req, ctx) => servicio.guardarParametro(req.body || {}, ctx)));
    r.delete("/parametros", accion((req, ctx) => servicio.restablecer(req.body || {}, ctx)));
    r.get("/bitacora", accion(req => servicio.bitacora({ pagina: req.query.pagina })));
    r.get("/periodos", accion(() => servicio.periodos()));
    r.post("/periodos/cerrar", accion((req, ctx) => servicio.cerrarPeriodo(req.body || {}, ctx)));
    r.post("/periodos/reabrir", accion((req, ctx) => servicio.reabrirPeriodo(req.body || {}, ctx)));
    r.get("/auditoria", accion(req => servicio.auditoria({ texto: req.query.texto, usuario: req.query.usuario, pagina: req.query.pagina })));
    return r;
}

module.exports = { crearRutasNominasMantenimiento };
