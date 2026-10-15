const model = require("../modelos/unidades.model");

async function obtenerTodos(req, res) {
    try {
        const unidades = await model.obtenerTodos();
        res.status(200).json({ exito: true, datos: unidades });
    } catch (error) {
        console.error("Error al obtener las unidades:", error);
        res.status(500).json({ exito: false, mensaje: "Error al obtener las unidades." });
    }
}

function validarFecha(valor){
    if (!valor) return new Date();   /* si no la escriben, se usa hoy */
    if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        throw new Error('La fecha debe tener el formato AAAA-MM-DD.');
    }
    const fecha = new Date(`${valor}T00:00:00`);
    if (Number.isNaN(fecha.getTime())) {
        throw new Error('La fecha no es válida.');
    }
    return fecha;
}

async function crear(req, res) {
    try {
        const codigo = (req.body.codigo || "").trim().toUpperCase();
        const id_empleado = req.body.id_empleado ? Number(req.body.id_empleado) : null;

        if (!codigo) {
            throw new Error("Escribe el código de la unidad (por ejemplo S1).");
        }
        if (codigo.length > 10) {
            throw new Error("El código no puede superar los 10 caracteres.");
        }
        if (id_empleado !== null && (!Number.isInteger(id_empleado) || id_empleado <= 0)) {
            throw new Error("El empleado seleccionado no es válido.");
        }

        const fecha_creacion = validarFecha(req.body.fecha_creacion);

        const creada = await model.crear({ codigo, fecha_creacion, id_empleado });

        res.status(201).json({
            exito: true,
            mensaje: "Unidad " + (creada.codigo || creada.id_unidad) + " creada correctamente.",
            datos: creada
        });
    } catch (error) {
        console.error("Error al crear la unidad:", error);
        const duplicado = /violation of unique|duplicate key/i.test(error.message || '');
        res.status(400).json({
            exito: false,
            mensaje: duplicado ? 'Ya existe una unidad con ese código.' : error.message
        });
    }
}

async function actualizarEstado(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ exito: false, mensaje: "El ID de la unidad no es válido." });
        }
        const esActiva = req.body.es_activa !== false;
        const actualizada = await model.actualizarEstado(id, esActiva);
        if (!actualizada) {
            return res.status(404).json({ exito: false, mensaje: "No se encontró esa unidad." });
        }
        res.status(200).json({ exito: true, datos: actualizada });
    } catch (error) {
        console.error("Error al actualizar la unidad:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudo actualizar la unidad." });
    }
}

async function obtenerEmpleados(req, res) {
    try {
        const id = Number(req.params.id);
        const empleados = await model.obtenerEmpleadosDeUnidad(id);
        res.status(200).json({ exito: true, datos: empleados });
    } catch (error) {
        console.error("Error al obtener los empleados de la unidad:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudieron obtener los empleados de la unidad." });
    }
}

async function quitarEmpleado(req, res) {
    try {
        const idUnidadEmpleado = Number(req.params.idUnidadEmpleado);
        const eliminado = await model.quitarEmpleado(idUnidadEmpleado);
        if (!eliminado) {
            return res.status(404).json({ exito: false, mensaje: "No se encontró esa asignación." });
        }
        res.status(200).json({ exito: true, mensaje: "Empleado quitado de la unidad." });
    } catch (error) {
        console.error("Error al quitar el empleado de la unidad:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudo quitar el empleado de la unidad." });
    }
}

module.exports = { obtenerTodos, crear, actualizarEstado, obtenerEmpleados, quitarEmpleado };