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

module.exports = {
    obtenerTodos
};