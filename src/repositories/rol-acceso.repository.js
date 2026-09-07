const { sql, poolPromise } = require("../config/database");

const columnas = "id_rol_credencial, id_rol, id_credencial";

async function obtenerTodos() {
    const pool = await poolPromise;
    const resultado = await pool.request().query(`
        SELECT ${columnas}
        FROM rol_acceso
        ORDER BY id_rol_credencial DESC
    `);
    return resultado.recordset;
}

async function obtenerPorId(id) {
    const pool = await poolPromise;
    const resultado = await pool.request()
        .input("id_rol_credencial", sql.Int, id)
        .query(`
            SELECT ${columnas}
            FROM rol_acceso
            WHERE id_rol_credencial = @id_rol_credencial
        `);
    return resultado.recordset[0];
}

async function crear(datos) {
    const pool = await poolPromise;
    const resultado = await pool.request()
        .input("id_rol", sql.Int, datos.id_rol)
        .input("id_credencial", sql.Int, datos.id_credencial)
        .query(`
            INSERT INTO rol_acceso (id_rol, id_credencial)
            OUTPUT INSERTED.${columnas}
            VALUES (@id_rol, @id_credencial)
        `);
    return resultado.recordset[0];
}

async function actualizar(id, datos) {
    const pool = await poolPromise;
    const resultado = await pool.request()
        .input("id_rol_credencial", sql.Int, id)
        .input("id_rol", sql.Int, datos.id_rol)
        .input("id_credencial", sql.Int, datos.id_credencial)
        .query(`
            UPDATE rol_acceso
            SET id_rol = @id_rol, id_credencial = @id_credencial
            OUTPUT INSERTED.${columnas}
            WHERE id_rol_credencial = @id_rol_credencial
        `);
    return resultado.recordset[0];
}

async function eliminar(id) {
    const pool = await poolPromise;
    const resultado = await pool.request()
        .input("id_rol_credencial", sql.Int, id)
        .query(`
            DELETE FROM rol_acceso
            OUTPUT DELETED.${columnas}
            WHERE id_rol_credencial = @id_rol_credencial
        `);
    return resultado.recordset[0];
}

module.exports = { obtenerTodos, obtenerPorId, crear, actualizar, eliminar };