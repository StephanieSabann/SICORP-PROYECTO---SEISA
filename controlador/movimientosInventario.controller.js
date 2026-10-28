const model = require("../modelos/movimientosInventario.model");

function validarFecha(valor, requerida = true) {
    if (!valor) {
        if (requerida) throw new Error("Selecciona una fecha.");
        return null;
    }
    if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        throw new Error("La fecha debe tener el formato AAAA-MM-DD.");
    }
    const fecha = new Date(`${valor}T00:00:00`);
    if (Number.isNaN(fecha.getTime())) throw new Error("La fecha no es válida.");
    return fecha;
}

function validarCantidad(valor, campo = "La cantidad") {
    const n = Number(valor);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${campo} debe ser un número mayor a cero.`);
    return n;
}

async function registrarEntrada(req, res) {
    try {
        const id_recurso = Number(req.body.id_recurso);
        if (!Number.isInteger(id_recurso) || id_recurso <= 0) throw new Error("Selecciona un recurso.");
        const cantidad = validarCantidad(req.body.cantidad, "La cantidad recibida");
        const fecha = validarFecha(req.body.fecha);
        const origen = req.body.origen || null;
        if (origen && !["EEGSA", "SEISA"].includes(origen)) throw new Error("El origen no es válido.");

        const movimiento = await model.registrarEntrada({
            id_recurso, cantidad, fecha, origen,
            observacion: (req.body.observacion || "").trim() || null,
            id_credencial: req.session.id_credencial,
            borrador: !!req.body.borrador
        });

        res.status(201).json({
            exito: true,
            mensaje: req.body.borrador ? "Entrada guardada como borrador." : "Entrada confirmada: las existencias ya se actualizaron.",
            datos: movimiento
        });
    } catch (error) {
        console.error("Error al registrar la entrada:", error);
        res.status(400).json({ exito: false, mensaje: error.message });
    }
}

async function registrarEntrega(req, res) {
    try {
        const id_recurso = Number(req.body.id_recurso);
        const id_empleado = Number(req.body.id_empleado);
        if (!Number.isInteger(id_recurso) || id_recurso <= 0) throw new Error("Selecciona un recurso.");
        if (!Number.isInteger(id_empleado) || id_empleado <= 0) throw new Error("Selecciona el trabajador que recibe el recurso.");
        const cantidad = validarCantidad(req.body.cantidad, "La cantidad a entregar");
        const fecha = validarFecha(req.body.fecha);
        const fecha_devolucion_prevista = validarFecha(req.body.fecha_devolucion_prevista, false);
        const origen = req.body.origen || null;
        if (origen && !["EEGSA", "SEISA"].includes(origen)) throw new Error("El origen no es válido.");

        const movimiento = await model.registrarEntrega({
            id_recurso, id_empleado, cantidad, fecha, fecha_devolucion_prevista, origen,
            condicion: (req.body.condicion || "").trim() || null,
            observacion: (req.body.observacion || "").trim() || null,
            id_credencial: req.session.id_credencial,
            borrador: !!req.body.borrador
        });

        res.status(201).json({
            exito: true,
            mensaje: req.body.borrador ? "Entrega guardada como borrador." : "Entrega confirmada: el recurso quedó asignado al trabajador.",
            datos: movimiento
        });
    } catch (error) {
        console.error("Error al registrar la entrega:", error);
        res.status(400).json({ exito: false, mensaje: error.message });
    }
}

async function obtenerEntregasAbiertas(req, res) {
    try {
        const idEmpleado = req.query.id_empleado ? Number(req.query.id_empleado) : null;
        const entregas = await model.obtenerEntregasAbiertas(idEmpleado);
        res.status(200).json({ exito: true, datos: entregas });
    } catch (error) {
        console.error("Error al obtener las entregas abiertas:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudieron obtener las entregas pendientes de devolución." });
    }
}

async function registrarDevolucion(req, res) {
    try {
        const id_movimiento_relacionado = req.body.id_movimiento_relacionado ? Number(req.body.id_movimiento_relacionado) : null;
        const id_recurso = Number(req.body.id_recurso);
        const id_empleado = Number(req.body.id_empleado);
        if (!Number.isInteger(id_recurso) || id_recurso <= 0) throw new Error("Selecciona el recurso asignado.");
        if (!Number.isInteger(id_empleado) || id_empleado <= 0) throw new Error("Selecciona el trabajador que devuelve el recurso.");
        const cantidad = validarCantidad(req.body.cantidad, "La cantidad devuelta");
        const fecha = validarFecha(req.body.fecha);
        const condicion = req.body.condicion || "Buen estado";
        if (!["Buen estado", "Dañado", "Incompleto", "Perdido"].includes(condicion)) {
            throw new Error("La condición de devolución no es válida.");
        }

        const movimiento = await model.registrarDevolucion({
            id_recurso, id_empleado, cantidad, fecha, condicion, id_movimiento_relacionado,
            observacion: (req.body.observacion || "").trim() || null,
            id_credencial: req.session.id_credencial,
            borrador: !!req.body.borrador
        });

        res.status(201).json({
            exito: true,
            mensaje: req.body.borrador ? "Devolución guardada como borrador." : "Devolución confirmada: la asignación quedó finalizada.",
            datos: movimiento
        });
    } catch (error) {
        console.error("Error al registrar la devolución:", error);
        res.status(400).json({ exito: false, mensaje: error.message });
    }
}

async function obtenerHistorial(req, res) {
    try {
        const resultado = await model.obtenerHistorial({
            tipo: req.query.tipo,
            desde: req.query.desde ? validarFecha(req.query.desde) : null,
            hasta: req.query.hasta ? validarFecha(req.query.hasta) : null,
            texto: req.query.texto,
            pagina: req.query.pagina,
            porPagina: req.query.porPagina
        });
        res.status(200).json({ exito: true, ...resultado });
    } catch (error) {
        console.error("Error al obtener el historial de movimientos:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudo obtener el historial de movimientos." });
    }
}

module.exports = {
    registrarEntrada, registrarEntrega, registrarDevolucion,
    obtenerEntregasAbiertas, obtenerHistorial
};
