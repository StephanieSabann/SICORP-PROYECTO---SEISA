const model = require("../modelos/conteosInventario.model");

async function obtenerActual(req, res) {
    try {
        const conteo = await model.obtenerActual();
        res.status(200).json({ exito: true, datos: conteo });
    } catch (error) {
        console.error("Error al obtener el conteo actual:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudo obtener el conteo en curso." });
    }
}

async function crear(req, res) {
    try {
        const actual = await model.obtenerActual();
        if (actual) {
            return res.status(400).json({
                exito: false,
                mensaje: `Ya hay un conteo en curso (${actual.codigo}). Finalízalo antes de iniciar uno nuevo.`
            });
        }
        const fecha = req.body.fecha ? new Date(`${req.body.fecha}T00:00:00`) : new Date();
        const conteo = await model.crear(req.session.id_credencial, fecha);
        res.status(201).json({ exito: true, mensaje: `Conteo ${conteo.codigo} iniciado.`, datos: conteo });
    } catch (error) {
        console.error("Error al crear el conteo:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudo iniciar el conteo físico." });
    }
}

async function obtenerPorId(req, res) {
    try {
        const id = Number(req.params.id);
        const conteo = await model.obtenerPorId(id);
        if (!conteo) return res.status(404).json({ exito: false, mensaje: "No se encontró ese conteo." });
        res.status(200).json({ exito: true, datos: conteo });
    } catch (error) {
        console.error("Error al obtener el conteo:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudo obtener el conteo." });
    }
}

async function registrarFisico(req, res) {
    try {
        const idDetalle = Number(req.params.idDetalle);
        const cantidadFisica = Number(req.body.cantidad_fisica);
        if (!Number.isInteger(cantidadFisica) || cantidadFisica < 0) {
            throw new Error("La cantidad física debe ser un número mayor o igual a cero.");
        }
        await model.registrarFisico(idDetalle, cantidadFisica);
        res.status(200).json({ exito: true, mensaje: "Conteo del recurso guardado." });
    } catch (error) {
        console.error("Error al registrar el conteo físico:", error);
        res.status(400).json({ exito: false, mensaje: error.message });
    }
}

async function finalizar(req, res) {
    try {
        const id = Number(req.params.id);
        const conteo = await model.finalizar(id, req.session.id_credencial);
        res.status(200).json({ exito: true, mensaje: "Conteo finalizado: las diferencias ya se ajustaron en el inventario.", datos: conteo });
    } catch (error) {
        console.error("Error al finalizar el conteo:", error);
        res.status(400).json({ exito: false, mensaje: error.message });
    }
}

module.exports = { obtenerActual, crear, obtenerPorId, registrarFisico, finalizar };
