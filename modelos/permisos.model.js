const { sql, obtenerPool } = require("../basededatos/conexion");

/* Estructura real (confirmada):
     PERMISOS(id_permiso PK, id_tipo FK, id_empleado FK, desde date,
               hasta date, motivo varchar(30), estado bit NULL)
     TIPO_PERMISOS(id_tipo PK, nombre varchar(50), descripcion varchar(255))

   "estado" es un bit que puede ser NULL — se usa así en todo este
   módulo:
     NULL  = pendiente (todavía nadie lo revisó)
     1     = aprobado
     0     = rechazado
   Si en tu equipo lo pensaron distinto, dímelo y se cambia acá nada
   más (está centralizado en las funciones de abajo). */

function estadoTexto(bit){
    if (bit === null || bit === undefined) return "pendiente";
    return bit ? "aprobado" : "rechazado";
}

async function obtenerPorEmpleado(idEmpleado) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_empleado", sql.Int, idEmpleado)
        .query(`
            SELECT
                p.id_permiso, p.id_tipo, p.id_empleado, p.desde, p.hasta, p.motivo, p.estado,
                t.nombre AS tipo_nombre
            FROM PERMISOS p
            INNER JOIN TIPO_PERMISOS t ON t.id_tipo = p.id_tipo
            WHERE p.id_empleado = @id_empleado
            ORDER BY p.desde DESC
        `);
    return resultado.recordset.map(fila => ({ ...fila, estado_texto: estadoTexto(fila.estado) }));
}

async function crear(datos) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_tipo", sql.Int, datos.id_tipo)
        .input("id_empleado", sql.Int, datos.id_empleado)
        .input("desde", sql.Date, datos.desde)
        .input("hasta", sql.Date, datos.hasta)
        .input("motivo", sql.VarChar(30), datos.motivo)
        .query(`
            INSERT INTO PERMISOS (id_tipo, id_empleado, desde, hasta, motivo, estado)
            OUTPUT INSERTED.id_permiso, INSERTED.id_tipo, INSERTED.id_empleado,
                   INSERTED.desde, INSERTED.hasta, INSERTED.motivo, INSERTED.estado
            VALUES (@id_tipo, @id_empleado, @desde, @hasta, @motivo, NULL)
        `);
    return { ...resultado.recordset[0], estado_texto: "pendiente" };
}

async function actualizarEstado(id, aprobado) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_permiso", sql.Int, id)
        .input("estado", sql.Bit, aprobado)
        .query(`
            UPDATE PERMISOS
            SET estado = @estado
            OUTPUT INSERTED.id_permiso, INSERTED.estado
            WHERE id_permiso = @id_permiso
        `);
    if (!resultado.recordset[0]) return null;
    return { ...resultado.recordset[0], estado_texto: estadoTexto(resultado.recordset[0].estado) };
}

async function eliminar(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_permiso", sql.Int, id)
        .query(`
            DELETE FROM PERMISOS
            OUTPUT DELETED.id_permiso
            WHERE id_permiso = @id_permiso
        `);
    return resultado.recordset[0];
}

/* Días de vacaciones ya usados o comprometidos (aprobados + los que
   todavía están pendientes de revisar, para no dejar pedir de más
   mientras esperan respuesta) en un año, para un empleado — solo
   cuenta los permisos cuyo TIPO se llama "Vacaciones" (se busca por
   nombre, sin importar mayúsculas, para no depender de un id fijo). */
async function diasVacacionesComprometidos(idEmpleado, anio) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_empleado", sql.Int, idEmpleado)
        .input("anio", sql.Int, anio)
        .query(`
            SELECT ISNULL(SUM(DATEDIFF(DAY, p.desde, p.hasta) + 1), 0) AS dias
            FROM PERMISOS p
            INNER JOIN TIPO_PERMISOS t ON t.id_tipo = p.id_tipo
            WHERE p.id_empleado = @id_empleado
              AND (p.estado = 1 OR p.estado IS NULL)
              AND YEAR(p.desde) = @anio
              AND t.nombre LIKE '%vacac%'
        `);
    return resultado.recordset[0].dias;
}

async function esTipoVacaciones(idTipo) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_tipo", sql.Int, idTipo)
        .query(`SELECT nombre FROM TIPO_PERMISOS WHERE id_tipo = @id_tipo`);
    const fila = resultado.recordset[0];
    return !!fila && /vacac/i.test(fila.nombre);
}

module.exports = {
    obtenerPorEmpleado, crear, actualizarEstado, eliminar,
    diasVacacionesComprometidos, esTipoVacaciones, estadoTexto
};
