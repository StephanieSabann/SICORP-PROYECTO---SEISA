const { sql, obtenerPool } = require("../basededatos/conexion");

/* Estructura real de la tabla (confirmada):
     Puesto(
       id_puesto    INT IDENTITY PRIMARY KEY,
       nombre       VARCHAR(24)  NOT NULL,
       descripcion  VARCHAR(64)  NULL
     )
*/

async function obtenerTodos() {
    const pool = await obtenerPool();
    const resultado = await pool.request().query(`
        SELECT id_puesto, nombre, descripcion
        FROM Puesto
        ORDER BY nombre ASC
    `);
    return resultado.recordset;
}

async function obtenerPorId(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_puesto", sql.Int, id)
        .query(`
            SELECT id_puesto, nombre, descripcion
            FROM Puesto
            WHERE id_puesto = @id_puesto
        `);
    return resultado.recordset[0];
}

async function crear(datos) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("nombre", sql.VarChar(24), datos.nombre)
        .input("descripcion", sql.VarChar(64), datos.descripcion)
        .query(`
            INSERT INTO Puesto (nombre, descripcion)
            OUTPUT INSERTED.id_puesto, INSERTED.nombre, INSERTED.descripcion
            VALUES (@nombre, @descripcion)
        `);
    return resultado.recordset[0];
}

async function actualizar(id, datos) {
    const pool = await obtenerPool();
    const request = pool.request().input("id_puesto", sql.Int, id);

    const columnas = [];
    if (datos.nombre !== undefined) {
        request.input("nombre", sql.VarChar(24), datos.nombre);
        columnas.push("nombre = @nombre");
    }
    if (datos.descripcion !== undefined) {
        request.input("descripcion", sql.VarChar(64), datos.descripcion);
        columnas.push("descripcion = @descripcion");
    }
    if (columnas.length === 0) {
        throw new Error("No hay nada que actualizar.");
    }

    const resultado = await request.query(`
        UPDATE Puesto
        SET ${columnas.join(", ")}
        OUTPUT INSERTED.id_puesto, INSERTED.nombre, INSERTED.descripcion
        WHERE id_puesto = @id_puesto
    `);
    return resultado.recordset[0];
}

async function eliminar(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_puesto", sql.Int, id)
        .query(`
            DELETE FROM Puesto
            OUTPUT DELETED.id_puesto, DELETED.nombre
            WHERE id_puesto = @id_puesto
        `);
    return resultado.recordset[0];
}

module.exports = { obtenerTodos, obtenerPorId, crear, actualizar, eliminar };
