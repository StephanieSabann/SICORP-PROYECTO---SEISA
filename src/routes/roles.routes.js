const express = require("express");
const controller = require("../controllers/roles.controller");

const router = express.Router();

router.get("/", controller.obtenerTodos);
router.get("/:id/accesos", controller.obtenerAccesosPorRol);

module.exports = router;
