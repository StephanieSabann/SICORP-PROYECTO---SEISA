const { sql, obtenerPool } = require("../basededatos/conexion");

/* ============================================================
   Conteo físico de inventario (reconciliación).
   Tablas: Conteo_inventario, Conteo_detalle.
   ============================================================ */

async function generarCodigo() {
    const pool = await obtenerPool();
    const resultado = await pool.request().query(`
        SELECT TOP 1 codigo FROM Conteo_inventario ORDER BY id_conteo DESC
    `);
    const ultimo = resultado.recordset[0]?.codigo;
    const numero = ultimo ? (parseInt(ultimo.replace(/\D/g, ""), 10) || 0) + 1 : 1;
    return "CONT-" + String(numero).padStart(3, "0");
}

/* Crea un conteo nuevo y lo llena con una "fotografía" de todas las
   existencias activas en ese momento (cantidad_sistema = lo que hay
   registrado ahora; cantidad_fisica queda NULL hasta que se capture). */
async function crear(idCredencial, fecha) {
    const pool = await obtenerPool();
    const codigo = await generarCodigo();

    const transaccion = new sql.Transaction(pool);
    await transaccion.begin();
    try {
        const encabezado = await new sql.Request(transaccion)
            .input("codigo", sql.VarChar(10), codigo)
            .input("fecha", sql.Date, fecha)
            .input("id_credencial", sql.Int, idCredencial)
            .query(`
                INSERT INTO Conteo_inventario (codigo, fecha, id_credencial, estado, fecha_registro)
                OUTPUT INSERTED.id_conteo
                VALUES (@codigo, @fecha, @id_credencial, 'En curso', GETDATE())
            `);
        const idConteo = encabezado.recordset[0].id_conteo;

        await new sql.Request(transaccion)
            .input("id_conteo", sql.Int, idConteo)
            .query(`
                INSERT INTO Conteo_detalle (id_conteo, id_recurso, cantidad_sistema, cantidad_fisica, revisado)
                SELECT @id_conteo, id_recurso, cantidad_total, NULL, 0
                FROM Recurso WHERE activo = 1
            `);

        await transaccion.commit();
        return obtenerPorId(idConteo);
    } catch (error) {
        await transaccion.rollback();
        throw error;
    }
}

async function obtenerActual() {
    const pool = await obtenerPool();
    const resultado = await pool.request().query(`
        SELECT TOP 1 id_conteo FROM Conteo_inventario WHERE estado = 'En curso' ORDER BY id_conteo DESC
    `);
    if (!resultado.recordset[0]) return null;
    return obtenerPorId(resultado.recordset[0].id_conteo);
}

async function obtenerPorId(id) {
    const pool = await obtenerPool();

    const encabezado = await pool.request()
        .input("id_conteo", sql.Int, id)
        .query(`
            SELECT c.id_conteo, c.codigo, c.fecha, c.estado, c.fecha_registro,
                   cr.id_credencial, e.nombre AS responsable_nombre, e.apellido AS responsable_apellido
            FROM Conteo_inventario c
            INNER JOIN credenciales cr ON cr.id_credencial = c.id_credencial
            INNER JOIN Empleado e ON e.codigo_empleado = cr.codigo_empleado
            WHERE c.id_conteo = @id_conteo
        `);
    const conteo = encabezado.recordset[0];
    if (!conteo) return null;

    const detalle = await pool.request()
        .input("id_conteo", sql.Int, id)
        .query(`
            SELECT d.id_detalle, d.id_recurso, r.codigo, r.nombre AS recurso,
                   d.cantidad_sistema, d.cantidad_fisica, d.revisado,
                   (ISNULL(d.cantidad_fisica, d.cantidad_sistema) - d.cantidad_sistema) AS diferencia
            FROM Conteo_detalle d
            INNER JOIN Recurso r ON r.id_recurso = d.id_recurso
            WHERE d.id_conteo = @id_conteo
            ORDER BY r.nombre
        `);

    conteo.detalle = detalle.recordset;
    conteo.total_recursos = detalle.recordset.length;
    conteo.contabilizados = detalle.recordset.filter(d => d.cantidad_fisica !== null).length;
    conteo.sin_diferencias = detalle.recordset.filter(d => d.cantidad_fisica !== null && d.diferencia === 0).length;
    conteo.con_diferencias = detalle.recordset.filter(d => d.cantidad_fisica !== null && d.diferencia !== 0).length;
    conteo.pendientes = detalle.recordset.filter(d => d.cantidad_fisica === null).length;

    return conteo;
}

async function registrarFisico(idDetalle, cantidadFisica) {
    const pool = await obtenerPool();
    await pool.request()
        .input("id_detalle", sql.Int, idDetalle)
        .input("cantidad_fisica", sql.Int, cantidadFisica)
        .query(`
            UPDATE Conteo_detalle
            SET cantidad_fisica = @cantidad_fisica, revisado = 1
            WHERE id_detalle = @id_detalle
        `);
}

/* Cierra el conteo: por cada diferencia pendiente genera un
   movimiento de Ajuste y deja la cantidad_total del recurso igual a
   lo contado físicamente (cantidad_disponible nunca queda arriba del
   nuevo total). Los recursos que no se llegaron a contar se dejan
   tal cual (no se asume nada sobre ellos). */
async function finalizar(id, idCredencial) {
    const pool = await obtenerPool();
    const conteo = await obtenerPorId(id);
    if (!conteo) throw new Error("No se encontró ese conteo.");
    if (conteo.estado !== "En curso") throw new Error("Este conteo ya fue finalizado.");

    const transaccion = new sql.Transaction(pool);
    await transaccion.begin();
    try {
        for (const fila of conteo.detalle) {
            if (fila.cantidad_fisica === null || fila.diferencia === 0) continue;

            await new sql.Request(transaccion)
                .input("id_recurso", sql.Int, fila.id_recurso)
                .input("tipo", sql.VarChar(20), "Ajuste")
                .input("cantidad", sql.Int, fila.diferencia)
                .input("id_credencial", sql.Int, idCredencial)
                .input("observacion", sql.VarChar(300), `Ajuste por conteo físico ${conteo.codigo}.`)
                .query(`
                    INSERT INTO Movimiento_inventario
                        (id_recurso, tipo, cantidad, fecha, id_credencial, observacion, estado, fecha_registro)
                    VALUES
                        (@id_recurso, @tipo, @cantidad, CAST(GETDATE() AS DATE), @id_credencial, @observacion, 'Realizado', GETDATE())
                `);

            await new sql.Request(transaccion)
                .input("id_recurso", sql.Int, fila.id_recurso)
                .input("cantidad_total", sql.Int, fila.cantidad_fisica)
                .query(`
                    UPDATE Recurso
                    SET cantidad_total = @cantidad_total,
                        cantidad_disponible = CASE WHEN cantidad_disponible > @cantidad_total THEN @cantidad_total ELSE cantidad_disponible END
                    WHERE id_recurso = @id_recurso
                `);
        }

        await new sql.Request(transaccion)
            .input("id_conteo", sql.Int, id)
            .query(`UPDATE Conteo_inventario SET estado = 'Finalizado' WHERE id_conteo = @id_conteo`);

        await transaccion.commit();
    } catch (error) {
        await transaccion.rollback();
        throw error;
    }

    return obtenerPorId(id);
}

module.exports = { crear, obtenerActual, obtenerPorId, registrarFisico, finalizar };
