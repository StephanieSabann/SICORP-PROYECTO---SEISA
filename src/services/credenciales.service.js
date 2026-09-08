const repository = require("../repositories/credenciales.repository");


// ==========================================
// OBTENER TODAS
// ==========================================

async function obtenerTodas() {
    const registros = await repository.obtenerTodas();
    
    // Transformamos los datos SQL a la estructura que espera tu HTML/JS
    return registros.map(row => ({
        id: row.id,
        nombre: row.nombre,
        usuario: row.usuario,
        estado: row.Activo ? 'activo' : 'inactivo',
        rol: row.rol || 'Sin rol asignado',
        id_rol: row.id_rol,
        accesos: row.accesos ? row.accesos.split(',') : ['Sin accesos']
    }));
}


// ==========================================
// OBTENER POR ID
// ==========================================

async function obtenerPorId(id) {

    if (!Number.isInteger(id) || id <= 0) {
        throw new Error("El ID de la credencial no es válido.");
    }

    const credencial = await repository.obtenerPorId(id);

    if (!credencial) {
        throw new Error("La credencial no existe.");
    }

    return credencial;
}


// ==========================================
// CREAR
// ==========================================

async function crear(datos) {

    const {
        codigo_empleado,
        usuario,
        contrasenia
    } = datos;


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

    if (!usuario || typeof usuario !== "string") {
        throw new Error("El usuario es obligatorio.");
    }

    const usuarioLimpio = usuario.trim();

    if (usuarioLimpio.length === 0) {
        throw new Error("El usuario es obligatorio.");
    }

    if (usuarioLimpio.length > 80) {
        throw new Error(
            "El usuario no puede superar los 80 caracteres."
        );
    }


    // --------------------------------------
    // VALIDAR CONTRASEÑA
    // --------------------------------------

    if (!contrasenia || typeof contrasenia !== "string") {
        throw new Error("La contraseña es obligatoria.");
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
        await repository.obtenerPorUsuario(usuarioLimpio);

    if (usuarioExistente) {
        throw new Error(
            "El nombre de usuario ya está registrado."
        );
    }


    // --------------------------------------
    // COMPROBAR EMPLEADO DUPLICADO
    // --------------------------------------

    const empleadoExistente =
        await repository.obtenerPorCodigoEmpleado(
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

    return await repository.crear({
        codigo_empleado: Number(codigo_empleado),
        usuario: usuarioLimpio,
        contrasenia
    });
}


// ==========================================
// ACTUALIZAR
// ==========================================

async function actualizar(id, datos) {

    if (!Number.isInteger(id) || id <= 0) {
        throw new Error("El ID no es válido.");
    }


    // --------------------------------------
    // COMPROBAR QUE EXISTE
    // --------------------------------------

    const actual =
        await repository.obtenerPorId(id);

    if (!actual) {
        throw new Error("La credencial no existe.");
    }


    const {
        codigo_empleado,
        usuario,
        contrasenia
    } = datos;


    // --------------------------------------
    // VALIDAR CÓDIGO
    // --------------------------------------

    if (
        codigo_empleado === undefined ||
        !Number.isInteger(Number(codigo_empleado))
    ) {
        throw new Error(
            "El código de empleado debe ser un número entero."
        );
    }


    // --------------------------------------
    // VALIDAR USUARIO
    // --------------------------------------

    if (!usuario || typeof usuario !== "string") {
        throw new Error("El usuario es obligatorio.");
    }

    const usuarioLimpio = usuario.trim();

    if (usuarioLimpio.length === 0) {
        throw new Error("El usuario es obligatorio.");
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
        await repository.obtenerPorUsuario(usuarioLimpio);

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
        await repository.obtenerPorCodigoEmpleado(
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
        await repository.actualizar(id, {
            codigo_empleado: Number(codigo_empleado),
            usuario: usuarioLimpio
        });


    // --------------------------------------
    // ACTUALIZAR CONTRASEÑA SI SE ENVIÓ
    // --------------------------------------

    if (contrasenia) {

        if (contrasenia.length < 6) {
            throw new Error(
                "La contraseña debe tener al menos 6 caracteres."
            );
        }

        await repository.actualizarContrasenia(
            id,
            contrasenia
        );
    }


    return resultado;
}


// ==========================================
// ELIMINAR
// ==========================================

async function eliminar(id) {

    if (!Number.isInteger(id) || id <= 0) {
        throw new Error("El ID no es válido.");
    }


    const existente =
        await repository.obtenerPorId(id);

    if (!existente) {
        throw new Error("La credencial no existe.");
    }


    await repository.eliminar(id);

    return {
        mensaje: "Credencial eliminada correctamente."
    };
}


module.exports = {
    obtenerTodas,
    obtenerPorId,
    crear,
    actualizar,
    eliminar
};