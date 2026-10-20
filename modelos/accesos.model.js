const { sql, obtenerPool } = require("../basededatos/conexion");

/* La columna "descripcion" es NUEVA — si todavía no la agregaste,
   corre esto en Seisa:

   ALTER TABLE Catalogo_acceso ADD descripcion VARCHAR(150) NULL;

   Mientras no exista, obtenerTodos() lo detecta solo y sigue
   funcionando (solo que sin descripción), igual que ya hacen
   LimitePermiso y Mensaje.archivado en otros archivos. */

async function obtenerTodos() {
    const pool = await obtenerPool();
    try {
        const resultado = await pool.request().query(`
            SELECT id_acceso, nombre, descripcion
            FROM Catalogo_acceso
            ORDER BY nombre ASC
        `);
        return resultado.recordset;
    } catch (error) {
        console.warn('Catalogo_acceso.descripcion: la columna todavía no existe.', error.message);
        const resultado = await pool.request().query(`
            SELECT id_acceso, nombre
            FROM Catalogo_acceso
            ORDER BY nombre ASC
        `);
        return resultado.recordset.map(fila => ({ ...fila, descripcion: null }));
    }
}

async function obtenerPorId(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_acceso", sql.Int, id)
        .query(`SELECT id_acceso, nombre FROM Catalogo_acceso WHERE id_acceso = @id_acceso`);
    return resultado.recordset[0];
}

async function crear(datos) {
    const pool = await obtenerPool();
    try {
        const resultado = await pool.request()
            .input("nombre", sql.VarChar(50), datos.nombre)
            .input("descripcion", sql.VarChar(150), datos.descripcion)
            .query(`
                INSERT INTO Catalogo_acceso (nombre, descripcion)
                OUTPUT INSERTED.id_acceso, INSERTED.nombre, INSERTED.descripcion
                VALUES (@nombre, @descripcion)
            `);
        return resultado.recordset[0];
    } catch (error) {
        if (!/invalid column name/i.test(error.message || '')) throw error;
        const resultado = await pool.request()
            .input("nombre", sql.VarChar(50), datos.nombre)
            .query(`
                INSERT INTO Catalogo_acceso (nombre)
                OUTPUT INSERTED.id_acceso, INSERTED.nombre
                VALUES (@nombre)
            `);
        return { ...resultado.recordset[0], descripcion: null };
    }
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