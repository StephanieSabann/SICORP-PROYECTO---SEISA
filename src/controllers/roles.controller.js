const service = require("../services/roles.service");

async function obtenerTodos(req, res) {
    try {
        const roles = await service.obtenerTodos();

        res.json({
            exito: true,
            datos: roles
        });
    } catch (error) {
        console.error("Error al obtener roles:", error);

        res.status(500).json({
            exito: false,
            mensaje: "Error al obtener los roles."
        });
    }
}

async function obtenerAccesosPorRol(req, res) {
    try {
        const idRol = Number(req.params.id);

        if (!Number.isInteger(idRol) || idRol <= 0) {
            return res.status(400).json({
                exito: false,
                mensaje: "El ID del rol no es válido."
            });
        }

        const accesos = await service.obtenerAccesosPorRolId(idRol);

        return res.json({
            exito: true,
            datos: accesos
        });
    } catch (error) {
        console.error("Error al obtener accesos del rol:", error);

        return res.status(500).json({
            exito: false,
            mensaje: "Error al obtener los accesos del rol."
        });
    }
}

module.exports = {
    obtenerTodos,
    obtenerAccesosPorRol
};
