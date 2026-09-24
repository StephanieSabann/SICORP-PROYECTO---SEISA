const permisos = require("../modelos/permisos.model");
const tipos = require("../modelos/tiposPermiso.model");
const limites = require("../modelos/limitesPermiso.model");

function validarFecha(valor, etiqueta){
    if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        throw new Error(`La fecha "${etiqueta}" debe tener el formato AAAA-MM-DD.`);
    }
    const fecha = new Date(`${valor}T00:00:00Z`);
    if (Number.isNaN(fecha.getTime())) {
        throw new Error(`La fecha "${etiqueta}" no es válida.`);
    }
    return valor;
}

/* ---------- listar los permisos de un empleado ---------- */
async function obtenerPorEmpleado(req, res) {
    try {
        const idEmpleado = Number(req.query.empleado);
        if (!Number.isInteger(idEmpleado) || idEmpleado <= 0) {
            return res.status(400).json({ exito: false, mensaje: "Falta indicar el empleado." });
        }
        const datos = await permisos.obtenerPorEmpleado(idEmpleado);
        res.status(200).json({ exito: true, datos });
    } catch (error) {
        console.error("Error al obtener los permisos:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudieron cargar los permisos." });
    }
}

/* ---------- catálogo de tipos (para el desplegable) ---------- */
async function obtenerTipos(req, res) {
    try {
        const datos = await tipos.obtenerTodos();
        res.status(200).json({ exito: true, datos });
    } catch (error) {
        console.error("Error al obtener los tipos de permiso:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudieron cargar los tipos de permiso." });
    }
}

/* ---------- crear un permiso nuevo ---------- */
async function crear(req, res) {
    try {
        const id_empleado = Number(req.body.id_empleado);
        const id_tipo = Number(req.body.id_tipo);
        const desde = validarFecha(req.body.desde, "desde");
        const hasta = validarFecha(req.body.hasta, "hasta");
        const motivo = (req.body.motivo || "").trim();

        if (!Number.isInteger(id_empleado) || id_empleado <= 0) {
            throw new Error("Falta indicar el empleado.");
        }
        if (!Number.isInteger(id_tipo) || id_tipo <= 0) {
            throw new Error("Selecciona el tipo de permiso.");
        }
        if (hasta < desde) {
            throw new Error('La fecha "hasta" no puede ser anterior a "desde".');
        }
        if (!motivo) {
            throw new Error("Escribe el motivo.");
        }
        if (motivo.length > 30) {
            throw new Error("El motivo no puede superar los 30 caracteres.");
        }

        /* Si es un permiso de tipo Vacaciones, se revisa el límite
           ANTES de guardar — así no se puede pedir de más. */
        if (await permisos.esTipoVacaciones(id_tipo)) {
            const diasSolicitados = Math.round((new Date(hasta) - new Date(desde)) / 86400000) + 1;
            const anio = new Date(desde).getFullYear();
            const limite = await limites.obtenerPorEmpleadoYAnio(id_empleado, anio);
            const usados = await permisos.diasVacacionesComprometidos(id_empleado, anio);
            const disponibles = limite.dias_asignados - usados;

            if (diasSolicitados > disponibles) {
                return res.status(400).json({
                    exito: false,
                    mensaje: disponibles <= 0
                        ? `Ya no puede pedir más vacaciones: ya usó o tiene pendientes los ${limite.dias_asignados} días de ${anio}.`
                        : `Solo quedan ${disponibles} día${disponibles === 1 ? '' : 's'} disponibles de vacaciones en ${anio} (pidió ${diasSolicitados}).`
                });
            }
        }

        const creado = await permisos.crear({ id_tipo, id_empleado, desde, hasta, motivo });

        res.status(201).json({
            exito: true,
            mensaje: "Permiso registrado y en espera de aprobación.",
            datos: creado
        });

    } catch (error) {
        console.error("Error al crear el permiso:", error);
        res.status(400).json({ exito: false, mensaje: error.message });
    }
}

/* ---------- aprobar / rechazar ---------- */
async function actualizarEstado(req, res) {
    try {
        const id = Number(req.params.id);
        const aprobado = !!req.body.aprobado;
        const actualizado = await permisos.actualizarEstado(id, aprobado);
        if (!actualizado) {
            return res.status(404).json({ exito: false, mensaje: "No se encontró ese permiso." });
        }
        res.status(200).json({ exito: true, datos: actualizado });
    } catch (error) {
        console.error("Error al actualizar el permiso:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudo actualizar el permiso." });
    }
}

/* ---------- eliminar ---------- */
async function eliminar(req, res) {
    try {
        const id = Number(req.params.id);
        const eliminado = await permisos.eliminar(id);
        if (!eliminado) {
            return res.status(404).json({ exito: false, mensaje: "No se encontró ese permiso." });
        }
        res.status(200).json({ exito: true, mensaje: "Permiso eliminado." });
    } catch (error) {
        console.error("Error al eliminar el permiso:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudo eliminar el permiso." });
    }
}

/* ---------- límite de vacaciones del año ---------- */
async function obtenerLimite(req, res) {
    try {
        const idEmpleado = Number(req.query.empleado);
        const anio = Number(req.query.anio) || new Date().getFullYear();
        if (!Number.isInteger(idEmpleado) || idEmpleado <= 0) {
            return res.status(400).json({ exito: false, mensaje: "Falta indicar el empleado." });
        }
        const limite = await limites.obtenerPorEmpleadoYAnio(idEmpleado, anio);
        const usados = await permisos.diasVacacionesComprometidos(idEmpleado, anio);
        res.status(200).json({
            exito: true,
            datos: {
                anio,
                dias_asignados: limite.dias_asignados,
                dias_usados: usados,
                dias_disponibles: Math.max(0, limite.dias_asignados - usados)
            }
        });
    } catch (error) {
        console.error("Error al obtener el límite de vacaciones:", error);
        res.status(500).json({ exito: false, mensaje: "No se pudo obtener el límite de vacaciones." });
    }
}

async function establecerLimite(req, res) {
    try {
        const idEmpleado = Number(req.body.id_empleado);
        const anio = Number(req.body.anio) || new Date().getFullYear();
        const dias = Number(req.body.dias_asignados);

        if (!Number.isInteger(idEmpleado) || idEmpleado <= 0) {
            throw new Error("Falta indicar el empleado.");
        }
        if (!Number.isInteger(dias) || dias < 0 || dias > 365) {
            throw new Error("El número de días debe ser un entero entre 0 y 365.");
        }

        const guardado = await limites.establecer(idEmpleado, anio, dias);
        res.status(200).json({ exito: true, mensaje: "Límite actualizado.", datos: guardado });
    } catch (error) {
        console.error("Error al establecer el límite de vacaciones:", error);
        res.status(400).json({
            exito: false,
            mensaje: /invalid object name/i.test(error.message || '')
                ? 'Falta crear la tabla "LimitePermiso" en la base de datos (ver el comentario en limitesPermiso.model.js).'
                : (error.message || "No se pudo guardar el límite.")
        });
    }
}

module.exports = {
    obtenerPorEmpleado, obtenerTipos, crear, actualizarEstado, eliminar,
    obtenerLimite, establecerLimite
};
