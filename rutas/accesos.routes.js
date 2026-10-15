const express = require("express");
const controller = require("../controlador/accesos.controller");

const router = express.Router();

router.get("/", controller.obtenerTodos);
router.post("/", controller.crear);
router.delete("/:id", controller.eliminar);

module.exports = router;