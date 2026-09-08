const express = require("express");
const controller = require("../controllers/accesos.controller");

const router = express.Router();

router.get("/", controller.obtenerTodos);

module.exports = router;
