const express = require("express");
const controller = require("../controlador/roles.controller");

const router = express.Router();

router.get("/", controller.obtenerTodos);
router.get("/:id/accesos", controller.obtenerAccesosPorRolId);
router.put("/:id/accesos", controller.actualizarAccesos);
router.post("/", controller.crear);
router.delete("/:id", controller.eliminar);

module.exports = router;