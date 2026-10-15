const { sql, obtenerPool } = require("../basededatos/conexion");

async function obtenerTodos() {
    const pool = await obtenerPool();
    const resultado = await pool.request().query(`
        SELECT id_tipo, nombre, descripcion
        FROM TIPO_PERMISOS
        ORDER BY nombre ASC
    `);
    return resultado.recordset;
}

module.exports = { obtenerTodos };
