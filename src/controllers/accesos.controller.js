const service = require("../services/accesos.service");

async function obtenerTodos(req, res) {
    try {
        const accesos = await service.obtenerTodos();

        res.json({
            exito: true,
            datos: accesos
        });
    } catch (error) {
        console.error("Error al obtener accesos:", error);

        res.status(500).json({
            exito: false,
            mensaje: "Error al obtener los accesos."
        });
    }
}

module.exports = {
    obtenerTodos
};
