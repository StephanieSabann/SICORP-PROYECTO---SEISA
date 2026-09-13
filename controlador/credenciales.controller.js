const model = require("../modelos/credenciales.model");


// ==========================================
// GET /api/credenciales
// ==========================================

async function obtenerTodas(req, res) {

    try {

        const registros = await model.obtenerTodas();

        // Transformamos los datos para el frontend
        const credenciales = registros.map(row => ({
            id: row.id,
            nombre: row.nombre,
            usuario: row.usuario,
            estado: row.Activo
                ? "activo"
                : "inactivo",
            rol: row.rol || "Sin rol asignado",
            id_rol: row.id_rol,
            accesos: row.accesos
                ? row.accesos.split(",")
                : ["Sin accesos"]
        }));

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

        if (!Number.isInteger(id) || id <= 0) {
            throw new Error("El ID no es válido.");
        }

        const credencial = await model.obtenerPorId(id);

        if (!credencial) {
            throw new Error("La credencial no existe.");
        }

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

        const {
            codigo_empleado,
            usuario,
            contrasenia
        } = req.body;


        // --------------------------------------
        // VALIDAR CÓDIGO DE EMPLEADO
        // --------------------------------------

        if (
            codigo_empleado === undefined ||
            codigo_empleado === null ||
            !Number.isInteger(Number(codigo_empleado))
        ) {
            throw new Error(
                "El código de empleado debe ser un número entero."
            );
        }


        // --------------------------------------
        // VALIDAR USUARIO
        // --------------------------------------

        if (
            !usuario ||
            typeof usuario !== "string"
        ) {
            throw new Error(
                "El usuario es obligatorio."
            );
        }

        const usuarioLimpio = usuario.trim();

        if (usuarioLimpio.length === 0) {
            throw new Error(
                "El usuario es obligatorio."
            );
        }

        if (usuarioLimpio.length > 80) {
            throw new Error(
                "El usuario no puede superar los 80 caracteres."
            );
        }


        // --------------------------------------
        // VALIDAR CONTRASEÑA
        // --------------------------------------

        if (
            !contrasenia ||
            typeof contrasenia !== "string"
        ) {
            throw new Error(
                "La contraseña es obligatoria."
            );
        }

        if (contrasenia.length < 6) {
            throw new Error(
                "La contraseña debe tener al menos 6 caracteres."
            );
        }


        // --------------------------------------
        // COMPROBAR USUARIO DUPLICADO
        // --------------------------------------

        const usuarioExistente =
            await model.obtenerPorUsuario(
                usuarioLimpio
            );

        if (usuarioExistente) {
            throw new Error(
                "El nombre de usuario ya está registrado."
            );
        }


        // --------------------------------------
        // COMPROBAR EMPLEADO DUPLICADO
        // --------------------------------------

        const empleadoExistente =
            await model.obtenerPorCodigoEmpleado(
                Number(codigo_empleado)
            );

        if (empleadoExistente) {
            throw new Error(
                "El código de empleado ya tiene una credencial."
            );
        }


        // --------------------------------------
        // CREAR
        // --------------------------------------

        const credencial = await model.crear({
            codigo_empleado:
                Number(codigo_empleado),

            usuario: usuarioLimpio,

            contrasenia
        });


        res.status(201).json({
            exito: true,
            mensaje:
                "Credencial creada correctamente.",
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

        if (!Number.isInteger(id) || id <= 0) {
            throw new Error(
                "El ID no es válido."
            );
        }


        // --------------------------------------
        // COMPROBAR QUE EXISTE
        // --------------------------------------

        const actual =
            await model.obtenerPorId(id);

        if (!actual) {
            throw new Error(
                "La credencial no existe."
            );
        }


        const {
            codigo_empleado,
            usuario,
            contrasenia
        } = req.body;


        // --------------------------------------
        // VALIDAR CÓDIGO
        // --------------------------------------

        if (
            codigo_empleado === undefined ||
            !Number.isInteger(
                Number(codigo_empleado)
            )
        ) {
            throw new Error(
                "El código de empleado debe ser un número entero."
            );
        }


        // --------------------------------------
        // VALIDAR USUARIO
        // --------------------------------------

        if (
            !usuario ||
            typeof usuario !== "string"
        ) {
            throw new Error(
                "El usuario es obligatorio."
            );
        }

        const usuarioLimpio = usuario.trim();

        if (usuarioLimpio.length === 0) {
            throw new Error(
                "El usuario es obligatorio."
            );
        }

        if (usuarioLimpio.length > 80) {
            throw new Error(
                "El usuario no puede superar los 80 caracteres."
            );
        }


        // --------------------------------------
        // COMPROBAR USUARIO DUPLICADO
        // --------------------------------------

        const usuarioExistente =
            await model.obtenerPorUsuario(
                usuarioLimpio
            );

        if (
            usuarioExistente &&
            usuarioExistente.id_credencial !== id
        ) {
            throw new Error(
                "El nombre de usuario ya está registrado."
            );
        }


        // --------------------------------------
        // COMPROBAR EMPLEADO DUPLICADO
        // --------------------------------------

        const empleadoExistente =
            await model.obtenerPorCodigoEmpleado(
                Number(codigo_empleado)
            );

        if (
            empleadoExistente &&
            empleadoExistente.id_credencial !== id
        ) {
            throw new Error(
                "El código de empleado ya tiene una credencial."
            );
        }


        // --------------------------------------
        // ACTUALIZAR DATOS
        // --------------------------------------

        const resultado =
            await model.actualizar(
                id,
                {
                    codigo_empleado:
                        Number(codigo_empleado),

                    usuario: usuarioLimpio
                }
            );


        // --------------------------------------
        // ACTUALIZAR CONTRASEÑA
        // --------------------------------------

        if (contrasenia) {

            if (contrasenia.length < 6) {
                throw new Error(
                    "La contraseña debe tener al menos 6 caracteres."
                );
            }

            await model.actualizarContrasenia(
                id,
                contrasenia
            );
        }


        res.json({
            exito: true,
            mensaje:
                "Credencial actualizada correctamente.",
            datos: resultado
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

        if (!Number.isInteger(id) || id <= 0) {
            throw new Error(
                "El ID no es válido."
            );
        }


        const existente =
            await model.obtenerPorId(id);

        if (!existente) {
            throw new Error(
                "La credencial no existe."
            );
        }


        await model.eliminar(id);

        res.json({
            exito: true,
            mensaje:
                "Credencial eliminada correctamente."
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
// CAMBIAR ESTADO
// ==========================================

async function cambiarEstado(req, res) {

    try {

        const id = Number(req.params.id);
        const { activo } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            throw new Error(
                "El ID no es válido."
            );
        }

        if (typeof activo !== "boolean") {
            throw new Error(
                "El estado debe ser true o false."
            );
        }

        await model.cambiarEstado(
            id,
            activo
        );

        res.json({
            exito: true,
            mensaje:
                "Estado actualizado correctamente."
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
    eliminar,
    cambiarEstado
};