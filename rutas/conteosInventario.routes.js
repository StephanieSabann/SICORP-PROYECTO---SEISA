const express = require("express");
const controller = require("../controlador/conteosInventario.controller");

const router = express.Router();

router.get("/actual", controller.obtenerActual);
router.post("/", controller.crear);
router.get("/:id", controller.obtenerPorId);
router.patch("/detalle/:idDetalle", controller.registrarFisico);
router.post("/:id/finalizar", controller.finalizar);

module.exports = router;
