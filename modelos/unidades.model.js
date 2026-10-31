const { sql, obtenerPool } = require("../basededatos/conexion");

/* Estructura real de Unidad (confirmada): id_unidad, fecha_creacion,
   es_activa. La columna "codigo" es NUEVA — corre esto en Seisa:

   ALTER TABLE Unidad ADD codigo VARCHAR(10) NULL;

   Mientras no exista, este archivo la detecta solo y sigue
   funcionando (guarda todo menos el código), igual que ya hacen
   LimitePermiso, Mensaje.archivado y Catalogo_acceso.descripcion. */

async function obtenerTodos() {
    const pool = await obtenerPool();

    let unidades;
    try {
        const resultado = await pool.request().query(`
            SELECT id_unidad, codigo, fecha_creacion, es_activa
            FROM Unidad
            ORDER BY id_unidad DESC
        `);
        unidades = resultado.recordset;
    } catch (error) {
        console.warn('Unidad.codigo: la columna todavía no existe.', error.message);
        const resultado = await pool.request().query(`
            SELECT id_unidad, fecha_creacion, es_activa
            FROM Unidad
            ORDER BY id_unidad DESC
        `);
        unidades = resultado.recordset.map(u => ({ ...u, codigo: null }));
    }

    /* A cada unidad se le agregan los empleados que tiene asignados
       ahora mismo, para no tener que hacer una llamada aparte por
       cada fila en la pantalla. */
    for (const u of unidades) {
        u.empleados = await obtenerEmpleadosDeUnidad(u.id_unidad);
    }
    return unidades;
}

async function crear(datos) {
    const pool = await obtenerPool();
    let creada;

    try {
        const resultado = await pool.request()
            .input("codigo", sql.VarChar(10), datos.codigo)
            .input("fecha_creacion", sql.DateTime, datos.fecha_creacion)
            .input("es_activa", sql.Bit, true)
            .query(`
                INSERT INTO Unidad (codigo, fecha_creacion, es_activa)
                OUTPUT INSERTED.id_unidad, INSERTED.codigo, INSERTED.fecha_creacion, INSERTED.es_activa
                VALUES (@codigo, @fecha_creacion, @es_activa)
            `);
        creada = resultado.recordset[0];
    } catch (error) {
        if (!/invalid column name/i.test(error.message || '')) throw error;
        const resultado = await pool.request()
            .input("fecha_creacion", sql.DateTime, datos.fecha_creacion)
            .input("es_activa", sql.Bit, true)
            .query(`
                INSERT INTO Unidad (fecha_creacion, es_activa)
                OUTPUT INSERTED.id_unidad, INSERTED.fecha_creacion, INSERTED.es_activa
                VALUES (@fecha_creacion, @es_activa)
            `);
        creada = { ...resultado.recordset[0], codigo: null };
    }

    if (datos.id_empleado) {
        await asignarEmpleado(creada.id_unidad, datos.id_empleado);
    }
    creada.empleados = await obtenerEmpleadosDeUnidad(creada.id_unidad);
    return creada;
}

async function actualizarEstado(id, esActiva) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_unidad", sql.Int, id)
        .input("es_activa", sql.Bit, esActiva)
        .query(`
            UPDATE Unidad
            SET es_activa = @es_activa
            OUTPUT INSERTED.id_unidad, INSERTED.es_activa
            WHERE id_unidad = @id_unidad
        `);
    return resultado.recordset[0];
}

async function obtenerEmpleadosDeUnidad(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_unidad", sql.Int, id)
        .query(`
            SELECT ue.id_unidad_empleado, e.codigo_empleado, e.nombre, e.apellido
            FROM Unidad_empleado ue
            INNER JOIN Empleado e ON e.codigo_empleado = ue.id_empleado
            WHERE ue.id_unidad = @id_unidad
        `);
    return resultado.recordset;
}

async function asignarEmpleado(idUnidad, idEmpleado) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_unidad", sql.Int, idUnidad)
        .input("id_empleado", sql.Int, idEmpleado)
        .query(`
            INSERT INTO Unidad_empleado (id_unidad, id_empleado)
            OUTPUT INSERTED.id_unidad_empleado
            VALUES (@id_unidad, @id_empleado)
        `);
    return resultado.recordset[0];
}

/* Cambia el código de una unidad. El código viejo se queda en el
   historial de los empleados que la tuvieron, así que renombrarla
   no borra el pasado. */
async function actualizarCodigo(idUnidad, codigo) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_unidad", sql.Int, idUnidad)
        .input("codigo", sql.VarChar(10), codigo)
        .query(`
            UPDATE Unidad
            SET codigo = @codigo
            OUTPUT INSERTED.id_unidad, INSERTED.codigo
            WHERE id_unidad = @id_unidad
        `);
    return resultado.recordset[0];
}

/* Cuántos empleados tiene asignados la unidad ahora mismo.
   Se usa antes de borrarla: si tiene aunque sea uno, no se permite. */
async function contarEmpleados(idUnidad) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_unidad", sql.Int, idUnidad)
        .query(`SELECT COUNT(*) AS total FROM Unidad_empleado WHERE id_unidad = @id_unidad`);
    return resultado.recordset[0].total;
}

async function eliminar(idUnidad) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_unidad", sql.Int, idUnidad)
        .query(`
            DELETE FROM Unidad
            OUTPUT DELETED.id_unidad, DELETED.codigo
            WHERE id_unidad = @id_unidad
        `);
    return resultado.recordset[0];
}

async function quitarEmpleado(idUnidadEmpleado) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_unidad_empleado", sql.Int, idUnidadEmpleado)
        .query(`
            DELETE FROM Unidad_empleado
            OUTPUT DELETED.id_unidad_empleado
            WHERE id_unidad_empleado = @id_unidad_empleado
        `);
    return resultado.recordset[0];
}

module.exports = {
    obtenerTodos, crear, actualizarEstado, actualizarCodigo, eliminar, contarEmpleados,
    obtenerEmpleadosDeUnidad, asignarEmpleado, quitarEmpleado
};