const express = require("express");
const controller = require("../controlador/puestos.controller");

const router = express.Router();

router.get("/", controller.obtenerTodos);
router.post("/", controller.crear);
router.patch("/:id", controller.actualizar);
router.delete("/:id", controller.eliminar);

module.exports = router;
