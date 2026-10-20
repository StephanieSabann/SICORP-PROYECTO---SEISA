const express = require("express");
const controller = require("../controlador/movimientosInventario.controller");

const router = express.Router();

router.post("/entrada", controller.registrarEntrada);
router.post("/entrega", controller.registrarEntrega);
router.get("/entregas-abiertas", controller.obtenerEntregasAbiertas);
router.post("/devolucion", controller.registrarDevolucion);
router.get("/historial", controller.obtenerHistorial);

module.exports = router;
