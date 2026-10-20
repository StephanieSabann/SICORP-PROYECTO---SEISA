const { sql, obtenerPool } = require("../basededatos/conexion");

/* La tabla Mensaje ya existe (la creaste tú). Para poder "archivar"
   un mensaje hace falta una columna nueva — corre esto en Seisa:

   ALTER TABLE Mensaje ADD archivado BIT NOT NULL DEFAULT 0;

   Mientras no exista esa columna, obtenerTodos() de abajo lo detecta
   solo y sigue funcionando igual que antes (todos los mensajes se
   muestran como "no archivados"), así que no se rompe nada mientras
   tanto. */

async function obtenerTodos() {
    const pool = await obtenerPool();
    try {
        const resultado = await pool.request().query(`
            SELECT id_mensaje, nombre, correo, telefono, asunto, mensaje, fecha_envio, leido, archivado
            FROM Mensaje
            ORDER BY fecha_envio DESC
        `);
        return resultado.recordset;
    } catch (error) {
        console.warn('Mensaje.archivado: la columna todavía no existe, se usa "false" por default.', error.message);
        const resultado = await pool.request().query(`
            SELECT id_mensaje, nombre, correo, telefono, asunto, mensaje, fecha_envio, leido
            FROM Mensaje
            ORDER BY fecha_envio DESC
        `);
        return resultado.recordset.map(fila => ({ ...fila, archivado: false }));
    }
}

async function obtenerPorId(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_mensaje", sql.Int, id)
        .query(`
            SELECT id_mensaje, nombre, correo, telefono, asunto, mensaje, fecha_envio, leido
            FROM Mensaje
            WHERE id_mensaje = @id_mensaje
        `);
    return resultado.recordset[0];
}

async function crear(datos) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("nombre", sql.VarChar(100), datos.nombre)
        .input("correo", sql.VarChar(100), datos.correo)
        .input("telefono", sql.VarChar(20), datos.telefono)
        .input("asunto", sql.VarChar(150), datos.asunto)
        .input("mensaje", sql.VarChar(1000), datos.mensaje)
        .query(`
            INSERT INTO Mensaje (nombre, correo, telefono, asunto, mensaje)
            OUTPUT INSERTED.id_mensaje, INSERTED.nombre, INSERTED.correo,
                   INSERTED.telefono, INSERTED.asunto, INSERTED.mensaje,
                   INSERTED.fecha_envio, INSERTED.leido
            VALUES (@nombre, @correo, @telefono, @asunto, @mensaje)
        `);
    return resultado.recordset[0];
}

async function marcarLeido(id, leido) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_mensaje", sql.Int, id)
        .input("leido", sql.Bit, leido)
        .query(`
            UPDATE Mensaje
            SET leido = @leido
            OUTPUT INSERTED.id_mensaje, INSERTED.leido
            WHERE id_mensaje = @id_mensaje
        `);
    return resultado.recordset[0];
}

async function marcarArchivado(id, archivado) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_mensaje", sql.Int, id)
        .input("archivado", sql.Bit, archivado)
        .query(`
            UPDATE Mensaje
            SET archivado = @archivado
            OUTPUT INSERTED.id_mensaje, INSERTED.archivado
            WHERE id_mensaje = @id_mensaje
        `);
    return resultado.recordset[0];
}

async function eliminar(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_mensaje", sql.Int, id)
        .query(`
            DELETE FROM Mensaje
            OUTPUT DELETED.id_mensaje
            WHERE id_mensaje = @id_mensaje
        `);
    return resultado.recordset[0];
}

module.exports = { obtenerTodos, obtenerPorId, crear, marcarLeido, marcarArchivado, eliminar };