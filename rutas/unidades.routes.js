const express = require("express");
const controller = require("../controlador/unidades.controller");

const router = express.Router();

router.get("/", controller.obtenerTodos);
router.post("/", controller.crear);
router.patch("/:id/estado", controller.actualizarEstado);
router.patch("/:id", controller.actualizarCodigo);
router.delete("/:id", controller.eliminar);
router.get("/:id/empleados", controller.obtenerEmpleados);
router.post("/:id/empleados", controller.asignarEmpleado);
router.delete("/empleados/:idUnidadEmpleado", controller.quitarEmpleado);

module.exports = router;