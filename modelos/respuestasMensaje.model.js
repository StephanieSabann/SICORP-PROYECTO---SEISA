const { sql, obtenerPool } = require("../basededatos/conexion");

/* TABLA NUEVA — corre esto en Seisa antes de usar esta parte:

   CREATE TABLE RespuestaMensaje (
       id_respuesta    INT IDENTITY(1,1) PRIMARY KEY,
       id_mensaje      INT NOT NULL,
       id_credencial   INT NULL,
       texto           VARCHAR(1000) NOT NULL,
       fecha_respuesta DATETIME NOT NULL DEFAULT GETDATE(),
       CONSTRAINT FK_Respuesta_Mensaje FOREIGN KEY (id_mensaje)
           REFERENCES Mensaje(id_mensaje),
       CONSTRAINT FK_Respuesta_Credencial FOREIGN KEY (id_credencial)
           REFERENCES credenciales(id_credencial)
   );

   id_credencial guarda QUIÉN respondió (el administrador que escribió
   la respuesta) — así el historial dice de verdad quién contestó y
   cuándo, no es un dato inventado. Puede ser NULL por si algún día se
   borra esa credencial y no se quiere perder la respuesta. */

async function obtenerPorMensaje(idMensaje) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_mensaje", sql.Int, idMensaje)
        .query(`
            SELECT
                r.id_respuesta,
                r.id_mensaje,
                r.texto,
                r.fecha_respuesta,
                c.usuario AS respondido_por
            FROM RespuestaMensaje r
            LEFT JOIN credenciales c ON c.id_credencial = r.id_credencial
            WHERE r.id_mensaje = @id_mensaje
            ORDER BY r.fecha_respuesta ASC
        `);
    return resultado.recordset;
}

async function crear(datos) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_mensaje", sql.Int, datos.id_mensaje)
        .input("id_credencial", sql.Int, datos.id_credencial)
        .input("texto", sql.VarChar(1000), datos.texto)
        .query(`
            INSERT INTO RespuestaMensaje (id_mensaje, id_credencial, texto)
            OUTPUT INSERTED.id_respuesta, INSERTED.id_mensaje, INSERTED.texto, INSERTED.fecha_respuesta
            VALUES (@id_mensaje, @id_credencial, @texto)
        `);
    return resultado.recordset[0];
}

module.exports = { obtenerPorMensaje, crear };