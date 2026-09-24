const express = require("express");
const controller = require("../controlador/permisos.controller");

const router = express.Router();

router.get("/tipos", controller.obtenerTipos);
router.get("/limite", controller.obtenerLimite);
router.put("/limite", controller.establecerLimite);

router.get("/", controller.obtenerPorEmpleado);
router.post("/", controller.crear);
router.patch("/:id/estado", controller.actualizarEstado);
router.delete("/:id", controller.eliminar);

module.exports = router;
