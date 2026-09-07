const { obtenerPool } = require("../config/database");

async function obtenerTodos() {
    const pool = await obtenerPool();

    const resultado = await pool.request().query(`
        SELECT
            codigo_empleado,
            nombre,
            apellido
        FROM Empleado
        ORDER BY nombre, apellido, codigo_empleado
    `);

    return resultado.recordset;
}

module.exports = {
    obtenerTodos
};