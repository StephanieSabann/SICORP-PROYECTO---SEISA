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

module.exports = {
    crear
};
