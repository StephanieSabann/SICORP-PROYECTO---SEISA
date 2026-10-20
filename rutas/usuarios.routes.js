const express = require("express");
const controller = require("../controlador/usuarios.controller");

const router = express.Router();

router.post("/", controller.crear);
router.put("/:id", controller.actualizar);

module.exports = router;
