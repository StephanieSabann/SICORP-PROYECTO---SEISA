const model = require("../modelos/roles.model");


async function obtenerTodos(req, res) {
    try {
        const roles = await model.obtenerTodosLosRoles();

        res.status(200).json({
            exito: true,
            datos: roles
        });

    } catch (error) {
        console.error("Error al obtener los roles:", error);

        res.status(500).json({
            exito: false,
            mensaje: "Error al obtener los roles."
        });
    }
}


async function obtenerAccesosPorRolId(req, res) {
    try {
        const idRol = Number(req.params.id);

        if (!Number.isInteger(idRol) || idRol <= 0) {
            return res.status(400).json({
                exito: false,
                mensaje: "El ID del rol no es válido."
            });
        }

        const accesos = await model.obtenerAccesosPorRolId(idRol);

        res.status(200).json({
            exito: true,
            datos: accesos
        });

    } catch (error) {
        console.error("Error al obtener los accesos del rol:", error);

        res.status(500).json({
            exito: false,
            mensaje: "Error al obtener los accesos del rol."
        });
    }
}

async function crear(req, res) {
    try {
        const nombre = (req.body.nombre || "").trim();
        const descripcion = (req.body.descripcion || "").trim();
        const accesos = Array.isArray(req.body.accesos) ? req.body.accesos.map(Number).filter(Number.isInteger) : [];

        if (!nombre) {
            throw new Error("Escribe el nombre del rol.");
        }
        if (nombre.length > 100) {
            throw new Error("El nombre del rol no puede superar los 100 caracteres.");
        }

        const creado = await model.crearRol({ nombre, descripcion: descripcion || null });

        /* El checklist de permisos se guarda aparte, justo después de
           crear el rol — si viene vacío, el rol simplemente nace sin
           ningún acceso todavía (se le puede asignar después con
           "Editar accesos"). */
        if (accesos.length > 0) {
            await model.establecerAccesosDeRol(creado.id_rol, accesos);
        }

        res.status(201).json({
            exito: true,
            mensaje: "Rol creado correctamente.",
            datos: creado
        });

    } catch (error) {
        console.error("Error al crear el rol:", error);

        res.status(400).json({
            exito: false,
            mensaje: error.message
        });
    }
}

async function actualizarAccesos(req, res) {
    try {
        const idRol = Number(req.params.id);
        const accesos = Array.isArray(req.body.accesos) ? req.body.accesos.map(Number).filter(Number.isInteger) : [];

        if (!Number.isInteger(idRol) || idRol <= 0) {
            return res.status(400).json({ exito: false, mensaje: "El ID del rol no es válido." });
        }

        const actualizado = await model.establecerAccesosDeRol(idRol, accesos);

        res.status(200).json({
            exito: true,
            mensaje: "Accesos del rol actualizados.",
            datos: actualizado
        });

    } catch (error) {
        console.error("Error al actualizar los accesos del rol:", error);

        res.status(500).json({
            exito: false,
            mensaje: "No se pudieron actualizar los accesos del rol."
        });
    }
}

async function eliminar(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ exito: false, mensaje: "El ID del rol no es válido." });
        }

        const eliminado = await model.eliminarRol(id);

        if (!eliminado) {
            return res.status(404).json({ exito: false, mensaje: "No se encontró ese rol." });
        }

        res.status(200).json({ exito: true, mensaje: "Rol eliminado." });

    } catch (error) {
        console.error("Error al eliminar el rol:", error);
        /* Si algún usuario todavía tiene este rol asignado (tabla
           Rol_credencial), SQL Server rechaza el borrado por la
           llave foránea — se lo explicamos claro en vez de un error
           crudo de base de datos. */
        const enUso = /reference constraint|foreign key|conflicted with/i.test(error.message || '');
        res.status(enUso ? 400 : 500).json({
            exito: false,
            mensaje: enUso
                ? "Este rol todavía está asignado a uno o más usuarios. Cámbiales el rol primero desde el módulo de Usuarios, y después podrás borrarlo."
                : "No se pudo eliminar el rol."
        });
    }
}


module.exports = {
    obtenerTodos,
    obtenerAccesosPorRolId,
    actualizarAccesos,
    eliminar,
    crear
};