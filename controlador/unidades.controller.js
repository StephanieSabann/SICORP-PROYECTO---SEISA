const model = require("../modelos/unidades.model");
const { normalizarCodigoUnidad } = require("../utilidades/codigoUnidad");

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
        /* Mismo formato que exige el módulo de Empleados: SI-01 ... SI-99 */
        const codigo = normalizarCodigoUnidad(req.body.codigo);
        const id_empleado = req.body.id_empleado ? Number(req.body.id_empleado) : null;

        if (!codigo) {
            throw new Error("Escribe el código de la unidad (por ejemplo SI-01).");
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

/* Cambia el código de una unidad (por ejemplo, arreglar una vieja
   que quedó como "S1" y debe ser "SI-01"). */
async function actualizarCodigo(req, res) {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            throw new Error("La unidad no es válida.");
        }

        const codigo = normalizarCodigoUnidad(req.body.codigo);

        if (!codigo) {
            throw new Error("Escribe el código de la unidad (por ejemplo SI-01).");
        }

        const actualizada = await model.actualizarCodigo(id, codigo);

        if (!actualizada) {
            return res.status(404).json({ exito: false, mensaje: "Esa unidad ya no existe." });
        }

        res.status(200).json({
            exito: true,
            mensaje: "Unidad actualizada a " + codigo + ".",
            datos: actualizada
        });
    } catch (error) {
        console.error("Error al actualizar la unidad:", error);
        /* Si ya existe otra unidad con ese código, SQL Server lo rechaza
           por el índice único y aquí se traduce a algo entendible. */
        const duplicado = /violation of unique|duplicate key/i.test(error.message || "");
        res.status(400).json({
            exito: false,
            mensaje: duplicado ? "Ya existe otra unidad con ese código." : error.message
        });
    }
}

/* Borra una unidad. Nunca se permite si tiene empleados asignados:
   esas personas quedarían sin cuadrilla sin que nadie se entere. */
async function eliminar(req, res) {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            throw new Error("La unidad no es válida.");
        }

        const enUso = await model.contarEmpleados(id);

        if (enUso > 0) {
            return res.status(409).json({
                exito: false,
                mensaje: enUso === 1
                    ? "No se puede borrar: hay 1 empleado asignado a esta unidad. Cámbialo de unidad primero."
                    : `No se puede borrar: hay ${enUso} empleados asignados a esta unidad. Cámbialos de unidad primero.`
            });
        }

        const eliminada = await model.eliminar(id);

        if (!eliminada) {
            return res.status(404).json({ exito: false, mensaje: "Esa unidad ya no existe." });
        }

        res.status(200).json({
            exito: true,
            mensaje: "Unidad " + (eliminada.codigo || eliminada.id_unidad) + " eliminada."
        });
    } catch (error) {
        console.error("Error al eliminar la unidad:", error);
        res.status(400).json({ exito: false, mensaje: error.message });
    }
}

/* Asigna un empleado a una unidad.
   Esta función faltaba: modelos/unidades.model.js ya traía
   asignarEmpleado(), pero no había controlador ni ruta que la
   llamara, así que era código muerto y no existía forma de
   asignarle una unidad a nadie desde el sistema. */
async function asignarEmpleado(req, res) {
    try {
        const idUnidad = Number(req.params.id);
        const idEmpleado = Number(req.body ? req.body.id_empleado : NaN);

        if (!Number.isInteger(idUnidad) || idUnidad <= 0) {
            return res.status(400).json({ exito: false, mensaje: "La unidad no es válida." });
        }

        if (!Number.isInteger(idEmpleado) || idEmpleado <= 0) {
            return res.status(400).json({ exito: false, mensaje: "El empleado no es válido." });
        }

        const asignado = await model.asignarEmpleado(idUnidad, idEmpleado);

        res.status(201).json({
            exito: true,
            mensaje: "Empleado asignado a la unidad.",
            datos: asignado
        });
    } catch (error) {
        console.error("Error al asignar el empleado a la unidad:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudo asignar el empleado a la unidad." });
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

module.exports = { obtenerTodos, crear, actualizarEstado, actualizarCodigo, eliminar, obtenerEmpleados, asignarEmpleado, quitarEmpleado };