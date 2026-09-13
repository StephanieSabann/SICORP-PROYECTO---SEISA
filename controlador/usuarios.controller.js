const model = require("../modelos/usuarios.model");

async function crear(req, res) {
    try {
        const {
            codigo_empleado,
            usuario,
            contrasenia,
            Activo,
            id_rol
        } = req.body;

        // Validar código de empleado
        if (
            codigo_empleado === undefined ||
            codigo_empleado === null ||
            !Number.isInteger(Number(codigo_empleado))
        ) {
            throw new Error("El código de empleado debe ser un número entero.");
        }

        // Validar usuario
        if (!usuario || typeof usuario !== "string") {
            throw new Error("El usuario es obligatorio.");
        }

        const usuarioLimpio = usuario.trim();

        if (usuarioLimpio.length === 0) {
            throw new Error("El usuario es obligatorio.");
        }

        if (usuarioLimpio.length > 80) {
            throw new Error("El usuario no puede superar los 80 caracteres.");
        }

        // Validar contraseña
        if (!contrasenia || typeof contrasenia !== "string") {
            throw new Error("La contraseña es obligatoria.");
        }

        if (contrasenia.length < 6) {
            throw new Error("La contraseña debe tener al menos 6 caracteres.");
        }

        // Validar rol
        if (!Number.isInteger(Number(id_rol)) || Number(id_rol) <= 0) {
            throw new Error("Debe seleccionar un rol válido.");
        }

        // Verificar usuario duplicado
        const usuarioExistente = await model.obtenerPorUsuario(usuarioLimpio);

        if (usuarioExistente) {
            throw new Error("El nombre de usuario ya está registrado.");
        }

        // Verificar empleado duplicado
        const empleadoExistente = await model.obtenerPorCodigoEmpleado(
            Number(codigo_empleado)
        );

        if (empleadoExistente) {
            throw new Error("El código de empleado ya tiene una credencial.");
        }

        // Crear usuario
        const usuarioCreado = await model.crear({
            codigo_empleado: Number(codigo_empleado),
            usuario: usuarioLimpio,
            contrasenia,
            Activo: Activo === undefined ? 1 : Number(Activo),
            id_rol: Number(id_rol)
        });

        res.status(201).json({
            exito: true,
            mensaje: "Usuario creado correctamente.",
            datos: usuarioCreado
        });

    } catch (error) {
        console.error(error);

        res.status(400).json({
            exito: false,
            mensaje: error.message
        });
    }
}


async function actualizar(req, res) {
    try {
        const idUsuario = Number(req.params.id);

        // Validar ID
        if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
            throw new Error("El usuario seleccionado es inválido.");
        }

        // Buscar usuario actual
        const actual = await model.obtenerPorId(idUsuario);

        if (!actual) {
            throw new Error("El usuario no existe.");
        }

        // Usuario
        const usuario =
            req.body.usuario !== undefined
                ? String(req.body.usuario).trim()
                : actual.usuario;

        if (!usuario) {
            throw new Error("El usuario es obligatorio.");
        }

        if (usuario.length > 80) {
            throw new Error("El usuario no puede superar los 80 caracteres.");
        }

        // Verificar usuario duplicado
        const usuarioExistente = await model.obtenerPorUsuario(usuario);

        if (
            usuarioExistente &&
            usuarioExistente.id_credencial !== idUsuario
        ) {
            throw new Error("El nombre de usuario ya está registrado.");
        }

        // Código de empleado
        const codigoEmpleado =
            req.body.codigo_empleado !== undefined
                ? Number(req.body.codigo_empleado)
                : Number(actual.codigo_empleado);

        if (
            !Number.isInteger(codigoEmpleado) ||
            codigoEmpleado <= 0
        ) {
            throw new Error("El código de empleado debe ser un número entero.");
        }

        // Verificar empleado duplicado
        const empleadoExistente =
            await model.obtenerPorCodigoEmpleado(codigoEmpleado);

        if (
            empleadoExistente &&
            empleadoExistente.id_credencial !== idUsuario
        ) {
            throw new Error("El código de empleado ya tiene una credencial.");
        }

        // Contraseña
        if (
            req.body.contrasenia !== undefined &&
            req.body.contrasenia !== "" &&
            typeof req.body.contrasenia !== "string"
        ) {
            throw new Error("La contraseña debe ser texto.");
        }

        if (
            req.body.contrasenia !== undefined &&
            req.body.contrasenia !== "" &&
            req.body.contrasenia.length < 6
        ) {
            throw new Error("La contraseña debe tener al menos 6 caracteres.");
        }

        // Rol
        const idRol =
            req.body.id_rol !== undefined
                ? Number(req.body.id_rol)
                : undefined;

        if (
            idRol !== undefined &&
            (!Number.isInteger(idRol) || idRol <= 0)
        ) {
            throw new Error("Debe seleccionar un rol válido.");
        }

        // Preparar datos
        const datos = {
            codigo_empleado: codigoEmpleado,
            usuario,
            Activo:
                req.body.Activo !== undefined
                    ? Number(req.body.Activo)
                    : Number(actual.Activo),

            ...(req.body.contrasenia !== undefined &&
            req.body.contrasenia !== ""
                ? {
                    contrasenia: req.body.contrasenia
                }
                : {}),

            ...(idRol !== undefined
                ? {
                    id_rol: idRol
                }
                : {})
        };

        // Actualizar
        const usuarioActualizado =
            await model.actualizar(idUsuario, datos);

        res.status(200).json({
            exito: true,
            mensaje: "Usuario actualizado correctamente.",
            datos: usuarioActualizado
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
    crear,
    actualizar
};