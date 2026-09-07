const { sql, obtenerPool } = require("../config/database");

async function obtenerTodos() {
    const pool = await obtenerPool();
    const resultado = await pool.request().query(`
        SELECT id_acceso, nombre
        FROM Catalogo_acceso
        ORDER BY id_acceso DESC
    `);
    return resultado.recordset;
}

async function obtenerPorId(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_acceso", sql.Int, id)
        .query(`
            SELECT id_acceso, nombre
            FROM Catalogo_acceso
            WHERE id_acceso = @id_acceso
        `);
    return resultado.recordset[0];
}

async function crear(datos) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("nombre", sql.VarChar(50), datos.nombre)
        .query(`
            INSERT INTO Catalogo_acceso (nombre)
            OUTPUT INSERTED.id_acceso, INSERTED.nombre
            VALUES (@nombre)
        `);
    return resultado.recordset[0];
}

async function actualizar(id, datos) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_acceso", sql.Int, id)
        .input("nombre", sql.VarChar(50), datos.nombre)
        .query(`
            UPDATE Catalogo_acceso
            SET nombre = @nombre
            OUTPUT INSERTED.id_acceso, INSERTED.nombre
            WHERE id_acceso = @id_acceso
        `);
    return resultado.recordset[0];
}

async function eliminar(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_acceso", sql.Int, id)
        .query(`
            DELETE FROM Catalogo_acceso
            OUTPUT DELETED.id_acceso, DELETED.nombre
            WHERE id_acceso = @id_acceso
        `);
    return resultado.recordset[0];
}

module.exports = { obtenerTodos, obtenerPorId, crear, actualizar, eliminar };