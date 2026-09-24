const express = require("express");
const controller = require("../controlador/puestos.controller");

const router = express.Router();

router.get("/", controller.obtenerTodos);
router.post("/", controller.crear);

module.exports = router;
