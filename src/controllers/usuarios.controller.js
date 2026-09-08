const service = require("../services/usuarios.service");

async function crear(req, res) {
    try {
        const usuario = await service.crear(req.body);

        res.status(201).json({
            exito: true,
            mensaje: "Usuario creado correctamente.",
            datos: usuario
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            exito: false,
            mensaje: error.message
        });
    }
}

module.exports = {
    crear
};
