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


module.exports = {
    obtenerTodos,
    obtenerAccesosPorRolId
};