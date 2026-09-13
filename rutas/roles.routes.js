const express = require("express");
const controller = require("../controlador/roles.controller");

const router = express.Router();

router.get("/", controller.obtenerTodos);
router.get("/:id/accesos", controller.obtenerAccesosPorRolId);

module.exports = router;
