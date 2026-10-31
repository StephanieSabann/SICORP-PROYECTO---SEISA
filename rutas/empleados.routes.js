const express = require("express");
const controller = require("../controlador/empleados.controller");

const router = express.Router();

router.post("/", controller.crear);
router.get("/", controller.obtenerTodos);
router.patch("/:codigo", controller.actualizar);

/* El historial va ANTES de "/:codigo" a propósito: si se pusiera
   después, Express tomaría "historial" como si fuera un código de
   empleado y nunca llegaría aquí. */
router.get("/:codigo/historial", controller.obtenerHistorial);
router.get("/:codigo", controller.obtenerPorCodigo);

module.exports = router;