const express = require("express");
const controller = require("../controlador/recursos.controller");
const { middlewareImagenRecurso, middlewareImagenCategoria } = require("../utilidades/subidaImagenes");

const router = express.Router();

// Categorías (las nuevas se crean desde Soporte y Mantenimiento → Inventario)
router.get("/categorias", controller.obtenerCategorias);
router.post("/categorias", middlewareImagenCategoria, controller.crearCategoria);
router.put("/categorias/:id", middlewareImagenCategoria, controller.actualizarCategoria);
router.patch("/categorias/:id/imagen", middlewareImagenCategoria, controller.subirImagenCategoria);
router.delete("/categorias/:id", controller.eliminarCategoria);

// Recursos
router.get("/resumen", controller.obtenerResumen);
router.get("/select", controller.obtenerParaSelect);
router.get("/siguiente-codigo", controller.obtenerSiguienteCodigo);
router.get("/empleados", controller.obtenerEmpleados);
router.get("/", controller.obtenerTodos);
router.post("/", middlewareImagenRecurso, controller.crear);
router.get("/:id", controller.obtenerUno);
router.put("/:id", middlewareImagenRecurso, controller.actualizar);
router.patch("/:id/imagen", middlewareImagenRecurso, controller.subirImagen);
router.delete("/:id", controller.eliminar);

module.exports = router;
