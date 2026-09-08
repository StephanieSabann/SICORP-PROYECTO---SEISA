const { sql, obtenerPool } = require("../config/database");

const columnas = "id_rol_credencial, id_rol, id_credencial";

async function obtenerTodos() {
    const pool = await obtenerPool();
    const resultado = await pool.request().query(`
        SELECT ${columnas}
        FROM Rol_credencial
        ORDER BY id_rol_credencial ASC
    `);
    return resultado.recordset;
}

async function obtenerPorId(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_rol_credencial", sql.Int, id)
        .query(`
            SELECT ${columnas}
            FROM Rol_credencial
            WHERE id_rol_credencial = @id_rol_credencial
        `);
    return resultado.recordset[0];
}

async function crear(datos) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_rol", sql.Int, datos.id_rol)
        .input("id_credencial", sql.Int, datos.id_credencial)
        .query(`
            INSERT INTO Rol_credencial (id_rol, id_credencial)
            OUTPUT INSERTED.${columnas}
            VALUES (@id_rol, @id_credencial)
        `);
    return resultado.recordset[0];
}

async function actualizar(id, datos) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_rol_credencial", sql.Int, id)
        .input("id_rol", sql.Int, datos.id_rol)
        .input("id_credencial", sql.Int, datos.id_credencial)
        .query(`
            UPDATE Rol_credencial
            SET id_rol = @id_rol, id_credencial = @id_credencial
            OUTPUT INSERTED.${columnas}
            WHERE id_rol_credencial = @id_rol_credencial
        `);
    return resultado.recordset[0];
}

async function eliminar(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_rol_credencial", sql.Int, id)
        .query(`
            DELETE FROM Rol_credencial
            OUTPUT DELETED.${columnas}
            WHERE id_rol_credencial = @id_rol_credencial
        `);
    return resultado.recordset[0];
}

module.exports = { obtenerTodos, obtenerPorId, crear, actualizar, eliminar };