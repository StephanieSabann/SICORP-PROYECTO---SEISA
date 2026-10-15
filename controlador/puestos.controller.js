const model = require("../modelos/puestos.model");

async function obtenerTodos(req, res) {
    try {
        const puestos = await model.obtenerTodos();

        res.status(200).json({
            exito: true,
            datos: puestos
        });

    } catch (error) {
        console.error("Error al obtener los puestos:", error);

        res.status(500).json({
            exito: false,
            mensaje: "Error al obtener los puestos."
        });
    }
}

async function crear(req, res) {
    try {
        const nombre = (req.body.nombre || "").trim();
        const descripcion = (req.body.descripcion || "").trim();

        if (!nombre) {
            throw new Error("Escribe el nombre del puesto.");
        }
        if (nombre.length > 24) {
            throw new Error("El nombre del puesto no puede superar los 24 caracteres.");
        }
        if (descripcion.length > 64) {
            throw new Error("La descripción no puede superar los 64 caracteres.");
        }

        const creado = await model.crear({ nombre, descripcion: descripcion || null });

        res.status(201).json({
            exito: true,
            mensaje: "Puesto creado correctamente.",
            datos: creado
        });

    } catch (error) {
        console.error("Error al crear el puesto:", error);

        res.status(400).json({
            exito: false,
            mensaje: error.message
        });
    }
}

module.exports = { obtenerTodos, crear };
