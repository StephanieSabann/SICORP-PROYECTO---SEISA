const express = require("express");
const controller = require("../controlador/mensajes.controller");

const router = express.Router();

/* OJO: este router se monta en server.js SIN requiereLoginAPI para
   el POST (así el formulario de contacto de la landing puede
   funcionar sin haber iniciado sesión) pero SÍ protegido para ver,
   marcar y borrar. La separación exacta se hace en server.js, no
   aquí — revisa ese archivo si necesitas cambiar quién puede
   entrar a cada uno. */
router.get("/", controller.obtenerTodos);
router.post("/", controller.crear);
router.patch("/:id/leido", controller.marcarLeido);
router.patch("/:id/archivado", controller.marcarArchivado);
router.get("/:id/respuestas", controller.obtenerRespuestas);
router.post("/:id/respuestas", controller.responder);
router.delete("/:id", controller.eliminar);

module.exports = router;