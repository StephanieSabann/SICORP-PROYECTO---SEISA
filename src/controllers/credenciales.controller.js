const service = require("../services/credenciales.service");


// ==========================================
// GET /api/credenciales
// ==========================================

async function obtenerTodas(req, res) {

    try {

        const credenciales =
            await service.obtenerTodas();

        res.json({
            exito: true,
            datos: credenciales
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            exito: false,
            mensaje: "Error al obtener las credenciales."
        });
    }
}


// ==========================================
// GET /api/credenciales/:id
// ==========================================

async function obtenerPorId(req, res) {

    try {

        const id = Number(req.params.id);

        const credencial =
            await service.obtenerPorId(id);

        res.json({
            exito: true,
            datos: credencial
        });

    } catch (error) {

        console.error(error);

        res.status(404).json({
            exito: false,
            mensaje: error.message
        });
    }
}


// ==========================================
// POST /api/credenciales
// ==========================================

async function crear(req, res) {

    try {

        const credencial =
            await service.crear(req.body);

        res.status(201).json({
            exito: true,
            mensaje: "Credencial creada correctamente.",
            datos: credencial
        });

    } catch (error) {

        console.error(error);

        res.status(400).json({
            exito: false,
            mensaje: error.message
        });
    }
}


// ==========================================
// PUT /api/credenciales/:id
// ==========================================

async function actualizar(req, res) {

    try {

        const id = Number(req.params.id);

        const credencial =
            await service.actualizar(
                id,
                req.body
            );

        res.json({
            exito: true,
            mensaje: "Credencial actualizada correctamente.",
            datos: credencial
        });

    } catch (error) {

        console.error(error);

        res.status(400).json({
            exito: false,
            mensaje: error.message
        });
    }
}


// ==========================================
// DELETE /api/credenciales/:id
// ==========================================

async function eliminar(req, res) {

    try {

        const id = Number(req.params.id);

        const resultado =
            await service.eliminar(id);

        res.json({
            exito: true,
            ...resultado
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
    obtenerTodas,
    obtenerPorId,
    crear,
    actualizar,
    eliminar
};