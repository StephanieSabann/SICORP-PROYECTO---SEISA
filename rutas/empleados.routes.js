const express = require("express");
const controller = require("../controlador/empleados.controller");

const router = express.Router();

router.post("/", controller.crear);
router.get("/", controller.obtenerTodos);
router.patch("/:codigo", controller.actualizar);
router.get("/:codigo", controller.obtenerPorCodigo);

module.exports = router;