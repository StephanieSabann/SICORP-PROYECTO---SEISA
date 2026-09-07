const { sql, poolPromise } = require("../config/database");


// ==========================================
// OBTENER TODAS LAS CREDENCIALES
// ==========================================

async function obtenerTodas() {

    const pool = await poolPromise;

    const resultado = await pool
        .request()
        .query(`
            SELECT
                id_credencial,
                codigo_empleado,
                usuario
            FROM credenciales
            ORDER BY id_credencial DESC
        `);

    return resultado.recordset;
}


// ==========================================
// OBTENER UNA CREDENCIAL POR ID
// ==========================================

async function obtenerPorId(id) {

    const pool = await poolPromise;

    const resultado = await pool
        .request()
        .input("id_credencial", sql.Int, id)
        .query(`
            SELECT
                id_credencial,
                codigo_empleado,
                usuario
            FROM credenciales
            WHERE id_credencial = @id_credencial
        `);

    return resultado.recordset[0];
}


// ==========================================
// BUSCAR POR USUARIO
// ==========================================

async function obtenerPorUsuario(usuario) {

    const pool = await poolPromise;

    const resultado = await pool
        .request()
        .input("usuario", sql.VarChar(80), usuario)
        .query(`
            SELECT
                id_credencial,
                codigo_empleado,
                usuario
            FROM credenciales
            WHERE usuario = @usuario
        `);

    return resultado.recordset[0];
}


// ==========================================
// BUSCAR POR CÓDIGO DE EMPLEADO
// ==========================================

async function obtenerPorCodigoEmpleado(codigoEmpleado) {

    const pool = await poolPromise;

    const resultado = await pool
        .request()
        .input("codigo_empleado", sql.Int, codigoEmpleado)
        .query(`
            SELECT
                id_credencial,
                codigo_empleado,
                usuario
            FROM credenciales
            WHERE codigo_empleado = @codigo_empleado
        `);

    return resultado.recordset[0];
}


// ==========================================
// CREAR CREDENCIAL
// ==========================================

async function crear(datos) {

    const pool = await poolPromise;

    const resultado = await pool
        .request()
        .input(
            "codigo_empleado",
            sql.Int,
            datos.codigo_empleado
        )
        .input(
            "usuario",
            sql.VarChar(80),
            datos.usuario
        )
        .input(
            "contrasenia",
            sql.VarChar(255),
            datos.contrasenia
        )
        .query(`
            INSERT INTO credenciales
            (
                codigo_empleado,
                usuario,
                contrasenia
            )
            VALUES
            (
                @codigo_empleado,
                @usuario,
                HASHBYTES('SHA2_512', @contrasenia)
            );

            SELECT
                id_credencial,
                codigo_empleado,
                usuario
            FROM credenciales
            WHERE id_credencial = SCOPE_IDENTITY();
        `);

    return resultado.recordset[0];
}


// ==========================================
// ACTUALIZAR CREDENCIAL
// ==========================================

async function actualizar(id, datos) {

    const pool = await poolPromise;

    const resultado = await pool
        .request()
        .input(
            "id_credencial",
            sql.Int,
            id
        )
        .input(
            "codigo_empleado",
            sql.Int,
            datos.codigo_empleado
        )
        .input(
            "usuario",
            sql.VarChar(80),
            datos.usuario
        )
        .query(`
            UPDATE credenciales
            SET
                codigo_empleado = @codigo_empleado,
                usuario = @usuario
            WHERE id_credencial = @id_credencial;

            SELECT
                id_credencial,
                codigo_empleado,
                usuario
            FROM credenciales
            WHERE id_credencial = @id_credencial;
        `);

    return resultado.recordset[0];
}


// ==========================================
// ACTUALIZAR CONTRASEÑA
// ==========================================

async function actualizarContrasenia(id, contrasenia) {

    const pool = await poolPromise;

    await pool
        .request()
        .input(
            "id_credencial",
            sql.Int,
            id
        )
        .input(
            "contrasenia",
            sql.VarChar(255),
            contrasenia
        )
        .query(`
            UPDATE credenciales
            SET
                contrasenia = HASHBYTES(
                    'SHA2_512',
                    @contrasenia
                )
            WHERE id_credencial = @id_credencial
        `);
}


// ==========================================
// ELIMINAR
// ==========================================

async function eliminar(id) {

    const pool = await poolPromise;

    const resultado = await pool
        .request()
        .input(
            "id_credencial",
            sql.Int,
            id
        )
        .query(`
            DELETE FROM credenciales
            WHERE id_credencial = @id_credencial
        `);

    return resultado.rowsAffected[0];
}


module.exports = {
    obtenerTodas,
    obtenerPorId,
    obtenerPorUsuario,
    obtenerPorCodigoEmpleado,
    crear,
    actualizar,
    actualizarContrasenia,
    eliminar
};