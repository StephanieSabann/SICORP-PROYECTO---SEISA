const express = require("express");
const { crearControladorReportes } = require("../controlador/reportes.controller");

/* Devuelve dos routers:
     reportes       → /api/reportes             (consulta y exportación)
     mantenimiento  → /api/mantenimiento/reportes (configuración; solo administradores)  */
function crearRutasReportes(servicio, resolverUsuario, obtenerAccesos) {
    const c = crearControladorReportes(servicio, resolverUsuario, obtenerAccesos);

    const reportes = express.Router();
    reportes.get("/periodos", c.periodos);
    reportes.get("/catalogo", c.catalogo);
    reportes.get("/resumen", c.resumen);
    reportes.get("/dashboard/:seccion", c.dashboard);
    reportes.get("/graficas/:seccion", c.graficas);
    reportes.get("/graficas/:seccion/:id", c.grafica);
    reportes.get("/dashboard/:seccion/exportar", c.exportarDashboard);
    reportes.get("/tabla/:clave", c.tabla);
    reportes.get("/tabla/:clave/exportar", c.exportarTabla);

    const mantenimiento = express.Router();
    mantenimiento.get("/parametros", c.parametros);
    mantenimiento.put("/parametros", c.guardarParametros);
    mantenimiento.get("/visibilidad", c.visibilidad);
    mantenimiento.put("/visibilidad/:clave", c.cambiarVisibilidad);
    mantenimiento.get("/bitacora", c.bitacora);
    mantenimiento.delete("/bitacora", c.depurarBitacora);
    mantenimiento.get("/costos", c.costos);
    mantenimiento.put("/costos/:id", c.guardarCosto);
    mantenimiento.get("/calidad", c.calidad);
    mantenimiento.get("/programados", c.programados);
    mantenimiento.post("/programados", c.crearProgramado);
    mantenimiento.put("/programados/:id", c.actualizarProgramado);
    mantenimiento.delete("/programados/:id", c.eliminarProgramado);
    mantenimiento.post("/programados/:id/ejecutar", c.ejecutarProgramado);
    mantenimiento.get("/cache", c.estadoCache);
    mantenimiento.post("/cache/limpiar", c.limpiarCache);

    return { reportes, mantenimiento };
}

module.exports = { crearRutasReportes };
