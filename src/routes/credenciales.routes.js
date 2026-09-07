const express = require("express");

const router = express.Router();

const controller =
    require("../controllers/credenciales.controller");


// GET todas
router.get(
    "/",
    controller.obtenerTodas
);


// GET por ID
router.get(
    "/:id",
    controller.obtenerPorId
);


// POST crear
router.post(
    "/",
    controller.crear
);


// PUT actualizar
router.put(
    "/:id",
    controller.actualizar
);


// DELETE eliminar
router.delete(
    "/:id",
    controller.eliminar
);


module.exports = router;