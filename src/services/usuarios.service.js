const repository = require("../repositories/usuarios.repository");

async function crear(datos) {
    const {
        codigo_empleado,
        usuario,
        contrasenia,
        Activo,
        id_rol
    } = datos;

    if (
        codigo_empleado === undefined ||
        codigo_empleado === null ||
        !Number.isInteger(Number(codigo_empleado))
    ) {
        throw new Error("El código de empleado debe ser un número entero.");
    }

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

    if (!contrasenia || typeof contrasenia !== "string") {
        throw new Error("La contraseña es obligatoria.");
    }

    if (contrasenia.length < 6) {
        throw new Error("La contraseña debe tener al menos 6 caracteres.");
    }

    if (!Number.isInteger(Number(id_rol)) || Number(id_rol) <= 0) {
        throw new Error("Debe seleccionar un rol válido.");
    }

    const usuarioExistente = await repository.obtenerPorUsuario(usuarioLimpio);
    if (usuarioExistente) {
        throw new Error("El nombre de usuario ya está registrado.");
    }

    const empleadoExistente = await repository.obtenerPorCodigoEmpleado(
        Number(codigo_empleado)
    );

    if (empleadoExistente) {
        throw new Error("El código de empleado ya tiene una credencial.");
    }

    return await repository.crear({
        codigo_empleado: Number(codigo_empleado),
        usuario: usuarioLimpio,
        contrasenia,
        Activo: Activo === undefined ? 1 : Number(Activo),
        id_rol: Number(id_rol)
    });
}

async function actualizar(id, datos) {
    const idUsuario = Number(id);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
        throw new Error("El usuario seleccionado es inválido.");
    }

    const actual = await repository.obtenerPorId(idUsuario);
    if (!actual) {
        throw new Error("El usuario no existe.");
    }

    const usuario = datos.usuario !== undefined ? String(datos.usuario).trim() : actual.usuario;
    if (!usuario) {
        throw new Error("El usuario es obligatorio.");
    }

    if (usuario.length > 80) {
        throw new Error("El usuario no puede superar los 80 caracteres.");
    }

    const usuarioExistente = await repository.obtenerPorUsuario(usuario);
    if (usuarioExistente && usuarioExistente.id_credencial !== idUsuario) {
        throw new Error("El nombre de usuario ya está registrado.");
    }

    const codigoEmpleado =
        datos.codigo_empleado !== undefined ? Number(datos.codigo_empleado) : Number(actual.codigo_empleado);

    if (!Number.isInteger(codigoEmpleado) || codigoEmpleado <= 0) {
        throw new Error("El código de empleado debe ser un número entero.");
    }

    const empleadoExistente = await repository.obtenerPorCodigoEmpleado(codigoEmpleado);
    if (empleadoExistente && empleadoExistente.id_credencial !== idUsuario) {
        throw new Error("El código de empleado ya tiene una credencial.");
    }

    if (datos.contrasenia !== undefined && datos.contrasenia !== "" && typeof datos.contrasenia !== "string") {
        throw new Error("La contraseña debe ser texto.");
    }

    if (datos.contrasenia !== undefined && datos.contrasenia !== "" && datos.contrasenia.length < 6) {
        throw new Error("La contraseña debe tener al menos 6 caracteres.");
    }

    const idRol = datos.id_rol !== undefined ? Number(datos.id_rol) : undefined;
    if (idRol !== undefined && (!Number.isInteger(idRol) || idRol <= 0)) {
        throw new Error("Debe seleccionar un rol válido.");
    }

    const payload = {
        codigo_empleado: codigoEmpleado,
        usuario,
        Activo: datos.Activo !== undefined ? Number(datos.Activo) : Number(actual.Activo),
        ...(datos.contrasenia !== undefined && datos.contrasenia !== "" ? { contrasenia: datos.contrasenia } : {}),
        ...(idRol !== undefined ? { id_rol: idRol } : {})
    };

    return await repository.actualizar(idUsuario, payload);
}

module.exports = {
    crear,
    actualizar
};
