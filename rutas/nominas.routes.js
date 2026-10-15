const express = require("express");
const multer = require("multer");
const { ARCHIVO } = require("../configuracion/nominas.config");
const { crearControladorNominas } = require("../controlador/nominas.controller");

/* El Excel se recibe en memoria (máx. 10 MB), se valida y recién
   entonces se guarda en almacen/nominas (ver utilidades/almacenNominas.js). */
const subirExcel = multer({ storage: multer.memoryStorage(), limits: { fileSize: ARCHIVO.tamanoMaximo, files: 1 } }).single("archivo");

function middlewareExcel(req, res, next) {
    subirExcel(req, res, error => {
        if (!error) return next();
        const mensaje = error.code === "LIMIT_FILE_SIZE"
            ? "El archivo supera el tamaño máximo de 10 MB."
            : "No se pudo recibir el archivo: " + error.message;
        res.status(400).json({ exito: false, mensaje });
    });
}

function crearRutasNominas(servicio, resolverUsuario) {
    const c = crearControladorNominas(servicio, resolverUsuario);
    const r = express.Router();

    r.get("/reglas", c.reglas);
    r.get("/empleados", c.empleados);
    r.get("/", c.listar);
    r.post("/", c.abrirOCrear);
    r.delete("/borradores", c.descartarBorradores);          // "Borrar todos" (solo borradores)
    r.post("/:id/eliminar-aprobada", c.eliminarAprobada);    // historial: quitar un comprobante aprobado
    r.get("/:id", c.vista);
    r.delete("/:id", c.descartar);
    r.get("/:id/historial", c.historial);
    r.post("/:id/importar", middlewareExcel, c.importar);
    r.delete("/:id/importacion", c.cancelarImportacion);
    r.put("/:id/inspector", c.seleccionarInspector);
    r.post("/:id/validar", c.validar);
    r.post("/:id/pasos/:paso/ir", c.irAPaso);
    r.post("/:id/pasos/:paso/completar", c.completarPaso);
    r.patch("/:id/valores", c.editarValor);
    r.post("/:id/descuentos", c.agregarDescuento);
    r.delete("/:id/descuentos/:idDescuento", c.eliminarDescuento);
    r.put("/:id/empleado", c.seleccionarEmpleado);
    r.post("/:id/aprobar", c.aprobar);
    r.get("/:id/comprobante", c.comprobante);
    r.get("/:id/comprobante.pdf", c.pdf);
    return r;
}

module.exports = { crearRutasNominas };
