const service = require("../services/empleados.service");

async function obtenerTodos(req, res) {
    try {
        const empleados = await service.obtenerTodos();

        res.json({
            exito: true,
            datos: empleados
        });
    } catch (error) {
        console.error("Error al obtener los empleados:", error);

        res.status(500).json({
            exito: false,
            mensaje: "Error al obtener los empleados."
        });
    }
}

module.exports = {
    obtenerTodos
};