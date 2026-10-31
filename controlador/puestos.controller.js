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

/* Editar un puesto. El nombre viejo se queda guardado en el historial
   de cada empleado, así que renombrar no borra el pasado. */
async function actualizar(req, res) {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            throw new Error("El puesto no es válido.");
        }

        const datos = {};

        if (req.body.nombre !== undefined) {
            const nombre = String(req.body.nombre).trim();

            if (!nombre) {
                throw new Error("Escribe el nombre del puesto.");
            }
            if (nombre.length > 24) {
                throw new Error("El nombre del puesto no puede superar los 24 caracteres.");
            }

            datos.nombre = nombre;
        }

        if (req.body.descripcion !== undefined) {
            const descripcion = String(req.body.descripcion).trim();

            if (descripcion.length > 64) {
                throw new Error("La descripción no puede superar los 64 caracteres.");
            }

            datos.descripcion = descripcion || null;
        }

        const actualizado = await model.actualizar(id, datos);

        if (!actualizado) {
            return res.status(404).json({ exito: false, mensaje: "Ese puesto ya no existe." });
        }

        res.status(200).json({
            exito: true,
            mensaje: "Puesto actualizado correctamente.",
            datos: actualizado
        });
    } catch (error) {
        console.error("Error al actualizar el puesto:", error);
        res.status(400).json({ exito: false, mensaje: error.message });
    }
}

/* Borrar un puesto. Nunca se permite si hay empleados usándolo: esos
   empleados quedarían apuntando a un puesto que ya no existe y la
   pantalla no podría mostrar su puesto. */
async function eliminar(req, res) {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            throw new Error("El puesto no es válido.");
        }

        const enUso = await model.contarEmpleados(id);

        if (enUso > 0) {
            return res.status(409).json({
                exito: false,
                mensaje: enUso === 1
                    ? "No se puede borrar: hay 1 empleado con este puesto. Cámbiale el puesto primero."
                    : `No se puede borrar: hay ${enUso} empleados con este puesto. Cámbiales el puesto primero.`
            });
        }

        const eliminado = await model.eliminar(id);

        if (!eliminado) {
            return res.status(404).json({ exito: false, mensaje: "Ese puesto ya no existe." });
        }

        res.status(200).json({
            exito: true,
            mensaje: `Puesto "${eliminado.nombre}" eliminado.`
        });
    } catch (error) {
        console.error("Error al eliminar el puesto:", error);
        res.status(400).json({ exito: false, mensaje: error.message });
    }
}

module.exports = { obtenerTodos, crear, actualizar, eliminar };
