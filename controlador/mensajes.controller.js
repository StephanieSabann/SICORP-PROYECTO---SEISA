const model = require("../modelos/mensajes.model");
const respuestasModel = require("../modelos/respuestasMensaje.model");
const { enviarCorreoRespuesta } = require("../utilidades/correo");

async function obtenerTodos(req, res) {
    try {
        const mensajes = await model.obtenerTodos();

        res.status(200).json({
            exito: true,
            datos: mensajes
        });

    } catch (error) {
        console.error("Error al obtener los mensajes:", error);

        res.status(500).json({
            exito: false,
            mensaje: "No se pudieron cargar los mensajes. ¿Ya creaste la tabla Mensaje en la base de datos?"
        });
    }
}

/* Este SÍ lo llama gente de afuera (el formulario de contacto de la
   landing, sin haber iniciado sesión) — por eso valida todo a mano,
   no confía en nada de lo que llegue. */
async function crear(req, res) {
    try {
        const nombre = (req.body.nombre || "").trim();
        const correo = (req.body.correo || "").trim();
        const telefono = (req.body.telefono || "").trim();
        const asunto = (req.body.asunto || "").trim();
        const mensaje = (req.body.mensaje || "").trim();

        if (!nombre || nombre.length > 100) {
            throw new Error("Escribe tu nombre completo (máximo 100 caracteres).");
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 100) {
            throw new Error("Escribe un correo electrónico válido.");
        }
        if (telefono.length > 20) {
            throw new Error("El teléfono es demasiado largo.");
        }
        if (asunto.length > 150) {
            throw new Error("El asunto no puede superar los 150 caracteres.");
        }
        if (!mensaje || mensaje.length < 10) {
            throw new Error("Cuéntanos un poco más en el mensaje (mínimo 10 caracteres).");
        }
        if (mensaje.length > 1000) {
            throw new Error("El mensaje no puede superar los 1000 caracteres.");
        }

        const creado = await model.crear({ nombre, correo, telefono, asunto, mensaje });

        res.status(201).json({
            exito: true,
            mensaje: "Tu mensaje fue enviado correctamente.",
            datos: creado
        });

    } catch (error) {
        console.error("Error al guardar el mensaje de contacto:", error);

        res.status(400).json({
            exito: false,
            mensaje: error.message
        });
    }
}

async function marcarLeido(req, res) {
    try {
        const id = Number(req.params.id);
        const leido = req.body.leido !== false;
        const actualizado = await model.marcarLeido(id, leido);

        if (!actualizado) {
            return res.status(404).json({ exito: false, mensaje: "No se encontró ese mensaje." });
        }
        res.json({ exito: true, datos: actualizado });

    } catch (error) {
        console.error("Error al marcar el mensaje:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudo actualizar el mensaje." });
    }
}

async function marcarArchivado(req, res) {
    try {
        const id = Number(req.params.id);
        const archivado = req.body.archivado !== false;
        const actualizado = await model.marcarArchivado(id, archivado);

        if (!actualizado) {
            return res.status(404).json({ exito: false, mensaje: "No se encontró ese mensaje." });
        }
        res.json({ exito: true, datos: actualizado });

    } catch (error) {
        console.error("Error al archivar el mensaje:", error);
        const faltaColumna = /invalid column name/i.test(error.message || '');
        res.status(faltaColumna ? 400 : 500).json({
            exito: false,
            mensaje: faltaColumna
                ? 'Falta agregar la columna "archivado" a la tabla Mensaje (ver el comentario en mensajes.model.js).'
                : "No se pudo archivar el mensaje."
        });
    }
}

async function eliminar(req, res) {
    try {
        const id = Number(req.params.id);
        const eliminado = await model.eliminar(id);

        if (!eliminado) {
            return res.status(404).json({ exito: false, mensaje: "No se encontró ese mensaje." });
        }
        res.json({ exito: true, mensaje: "Mensaje eliminado." });

    } catch (error) {
        console.error("Error al eliminar el mensaje:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudo eliminar el mensaje." });
    }
}

/* ---------- historial de respuestas (el "chat") ---------- */
async function obtenerRespuestas(req, res) {
    try {
        const idMensaje = Number(req.params.id);
        const respuestas = await respuestasModel.obtenerPorMensaje(idMensaje);
        res.status(200).json({ exito: true, datos: respuestas });
    } catch (error) {
        console.error("Error al obtener las respuestas:", error);
        const faltaTabla = /invalid object name/i.test(error.message || '');
        res.status(faltaTabla ? 400 : 500).json({
            exito: false,
            mensaje: faltaTabla
                ? 'Falta crear la tabla "RespuestaMensaje" en la base de datos (ver el comentario en respuestasMensaje.model.js).'
                : "No se pudieron cargar las respuestas."
        });
    }
}

async function responder(req, res) {
    try {
        const idMensaje = Number(req.params.id);
        const texto = (req.body.texto || "").trim();

        if (!texto) {
            throw new Error("Escribe una respuesta antes de enviarla.");
        }
        if (texto.length > 1000) {
            throw new Error("La respuesta no puede superar los 1000 caracteres.");
        }

        const guardada = await respuestasModel.crear({
            id_mensaje: idMensaje,
            id_credencial: req.session.id_credencial || null,
            texto
        });

        /* El correo es opcional — si no está configurado, esto no
           truena, solo devuelve enviado:false. Lo que SIEMPRE pasa es
           que la respuesta ya quedó guardada en el historial (arriba). */
        let correoResultado = { enviado: false };
        try {
            const mensajeOriginal = await model.obtenerPorId(idMensaje);
            if (mensajeOriginal) {
                correoResultado = await enviarCorreoRespuesta({
                    para: mensajeOriginal.correo,
                    asuntoOriginal: mensajeOriginal.asunto,
                    textoRespuesta: texto
                });
            }
        } catch (errorCorreo) {
            console.warn("No se pudo intentar el envío de correo:", errorCorreo.message);
        }

        res.status(201).json({
            exito: true,
            mensaje: correoResultado.enviado
                ? "Respuesta guardada y correo enviado."
                : "Respuesta guardada en el historial (el correo no se mandó: " + (correoResultado.motivo || "no configurado") + ").",
            datos: guardada,
            correo_enviado: correoResultado.enviado
        });

    } catch (error) {
        console.error("Error al responder el mensaje:", error);
        res.status(400).json({ exito: false, mensaje: error.message });
    }
}

module.exports = { obtenerTodos, crear, marcarLeido, marcarArchivado, eliminar, obtenerRespuestas, responder };