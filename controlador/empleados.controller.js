const model = require("../modelos/empleados.model");

async function obtenerTodos(req, res) {
    try {
        const empleados = await model.obtenerTodos();

        res.status(200).json({
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