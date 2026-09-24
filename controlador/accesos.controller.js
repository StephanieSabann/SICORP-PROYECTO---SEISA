const model = require("../modelos/accesos.model");

async function obtenerTodos(req, res) {
    try {
        const accesos = await model.obtenerTodos();

        res.status(200).json({
            exito: true,
            datos: accesos
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            exito: false,
            mensaje: "Error al obtener los accesos."
        });
    }
}

async function crear(req, res) {
    try {
        const nombre = (req.body.nombre || "").trim();
        const descripcion = (req.body.descripcion || "").trim();

        if (!nombre) {
            throw new Error("Escribe el nombre del permiso.");
        }
        if (nombre.length > 50) {
            throw new Error("El nombre del permiso no puede superar los 50 caracteres.");
        }
        if (descripcion.length > 150) {
            throw new Error("La descripción no puede superar los 150 caracteres.");
        }

        const creado = await model.crear({ nombre, descripcion: descripcion || null });

        res.status(201).json({
            exito: true,
            mensaje: "Permiso creado correctamente.",
            datos: creado
        });

    } catch (error) {
        console.error("Error al crear el permiso:", error);

        res.status(400).json({
            exito: false,
            mensaje: error.message
        });
    }
}

async function eliminar(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ exito: false, mensaje: "El ID del permiso no es válido." });
        }

        const eliminado = await model.eliminar(id);

        if (!eliminado) {
            return res.status(404).json({ exito: false, mensaje: "No se encontró ese permiso." });
        }

        res.status(200).json({ exito: true, mensaje: "Permiso eliminado." });

    } catch (error) {
        console.error("Error al eliminar el permiso:", error);
        /* Si algún rol todavía tiene este permiso marcado (tabla
           rol_acceso), SQL Server rechaza el borrado por la llave
           foránea — se lo explicamos claro en vez de un error crudo. */
        const enUso = /reference constraint|foreign key|conflicted with/i.test(error.message || '');
        res.status(enUso ? 400 : 500).json({
            exito: false,
            mensaje: enUso
                ? "Este permiso todavía está asignado a uno o más roles. Quítaselo primero desde \"Editar accesos\" en cada rol, y después podrás borrarlo."
                : "No se pudo eliminar el permiso."
        });
    }
}

module.exports = {
    obtenerTodos,
    crear,
    eliminar
};