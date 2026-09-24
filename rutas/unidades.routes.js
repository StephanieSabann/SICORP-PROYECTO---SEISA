const express = require("express");
const controller = require("../controlador/unidades.controller");

const router = express.Router();

router.get("/", controller.obtenerTodos);
router.post("/", controller.crear);
router.patch("/:id/estado", controller.actualizarEstado);
router.get("/:id/empleados", controller.obtenerEmpleados);
router.delete("/empleados/:idUnidadEmpleado", controller.quitarEmpleado);

module.exports = router;