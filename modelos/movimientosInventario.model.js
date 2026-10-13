const { sql, obtenerPool } = require("../basededatos/conexion");
const recursosModel = require("./recursos.model");

/* ============================================================
   Movimientos de inventario: Entrada, Entrega, Devolución y Ajuste
   (estos últimos los genera un Conteo al finalizar).
   Tabla: Movimiento_inventario (ver script SQL entregado).

   Reglas de negocio:
   - Entrada: suma a cantidad_total Y a cantidad_disponible.
   - Entrega: resta de cantidad_disponible (nunca de cantidad_total).
   - Devolución:
       "Buen estado"            -> vuelve a cantidad_disponible.
       "Dañado" / "Incompleto"  -> se queda fuera de servicio (se suma
                                    a cantidad_total si ya se había
                                    restado de ahí al entregarlo... en
                                    este diseño cantidad_total NO baja
                                    al entregar, así que aquí no se
                                    toca cantidad_total, solo no se
                                    libera a disponible).
       "Perdido"                -> se da de baja: resta de
                                    cantidad_total (ya no existe).
   - "Guardar borrador" (borrador = true): se inserta la fila con
     estado = 'Pendiente' y NO se tocan las cantidades del recurso
     todavía — queda para revisarlo y confirmarlo después.
   ============================================================ */

async function registrarEntrada(datos) {
    const pool = await obtenerPool();
    const esBorrador = !!datos.borrador;

    const resultado = await pool.request()
        .input("id_recurso", sql.Int, datos.id_recurso)
        .input("tipo", sql.VarChar(20), "Entrada")
        .input("cantidad", sql.Int, datos.cantidad)
        .input("fecha", sql.Date, datos.fecha)
        .input("id_credencial", sql.Int, datos.id_credencial)
        .input("origen", sql.VarChar(10), datos.origen || null)
        .input("observacion", sql.VarChar(300), datos.observacion || null)
        .input("estado", sql.VarChar(20), esBorrador ? "Pendiente" : "Registrado")
        .query(`
            INSERT INTO Movimiento_inventario
                (id_recurso, tipo, cantidad, fecha, id_credencial, origen, observacion, estado, fecha_registro)
            OUTPUT INSERTED.id_movimiento
            VALUES
                (@id_recurso, @tipo, @cantidad, @fecha, @id_credencial, @origen, @observacion, @estado, GETDATE())
        `);

    if (!esBorrador) {
        await recursosModel.ajustarCantidades(datos.id_recurso, { deltaTotal: datos.cantidad, deltaDisponible: datos.cantidad });
    }

    return obtenerPorId(resultado.recordset[0].id_movimiento);
}

async function registrarEntrega(datos) {
    const pool = await obtenerPool();
    const esBorrador = !!datos.borrador;

    if (!esBorrador) {
        const recurso = await recursosModel.obtenerPorId(datos.id_recurso);
        if (!recurso) throw new Error("El recurso seleccionado no existe.");
        if (recurso.cantidad_disponible < datos.cantidad) {
            throw new Error(`Solo hay ${recurso.cantidad_disponible} unidades disponibles de "${recurso.nombre}".`);
        }
    }

    const resultado = await pool.request()
        .input("id_recurso", sql.Int, datos.id_recurso)
        .input("tipo", sql.VarChar(20), "Entrega")
        .input("cantidad", sql.Int, datos.cantidad)
        .input("fecha", sql.Date, datos.fecha)
        .input("id_empleado", sql.Int, datos.id_empleado)
        .input("id_credencial", sql.Int, datos.id_credencial)
        .input("origen", sql.VarChar(10), datos.origen || null)
        .input("condicion", sql.VarChar(20), datos.condicion || null)
        .input("observacion", sql.VarChar(300), datos.observacion || null)
        .input("estado", sql.VarChar(20), esBorrador ? "Pendiente" : "Registrado")
        .input("fecha_devolucion_prevista", sql.Date, datos.fecha_devolucion_prevista || null)
        .query(`
            INSERT INTO Movimiento_inventario
                (id_recurso, tipo, cantidad, fecha, id_empleado, id_credencial, origen, condicion, observacion, estado, fecha_devolucion_prevista, fecha_registro)
            OUTPUT INSERTED.id_movimiento
            VALUES
                (@id_recurso, @tipo, @cantidad, @fecha, @id_empleado, @id_credencial, @origen, @condicion, @observacion, @estado, @fecha_devolucion_prevista, GETDATE())
        `);

    if (!esBorrador) {
        await recursosModel.ajustarCantidades(datos.id_recurso, { deltaDisponible: -datos.cantidad });
    }

    return obtenerPorId(resultado.recordset[0].id_movimiento);
}

/* Entregas que todavía no tienen una devolución asociada — para el
   <select> de "Recurso asignado" en la pantalla de Devolución. */
async function obtenerEntregasAbiertas(idEmpleado = null) {
    const pool = await obtenerPool();
    const request = pool.request();
    let filtroEmpleado = "";
    if (idEmpleado) {
        request.input("id_empleado", sql.Int, idEmpleado);
        filtroEmpleado = "AND m.id_empleado = @id_empleado";
    }

    const resultado = await request.query(`
        SELECT
            m.id_movimiento, m.id_recurso, r.codigo, r.nombre AS recurso,
            m.cantidad AS cantidad_entregada, m.fecha AS fecha_entrega,
            m.fecha_devolucion_prevista, m.id_empleado,
            e.nombre AS empleado_nombre, e.apellido AS empleado_apellido
        FROM Movimiento_inventario m
        INNER JOIN Recurso r ON r.id_recurso = m.id_recurso
        INNER JOIN Empleado e ON e.codigo_empleado = m.id_empleado
        WHERE m.tipo = 'Entrega' AND m.estado = 'Registrado'
          AND NOT EXISTS (
              SELECT 1 FROM Movimiento_inventario d
              WHERE d.tipo = 'Devolución' AND d.id_movimiento_relacionado = m.id_movimiento
                AND d.estado = 'Registrado'
          )
          ${filtroEmpleado}
        ORDER BY m.fecha DESC
    `);
    return resultado.recordset;
}

async function registrarDevolucion(datos) {
    const pool = await obtenerPool();
    const esBorrador = !!datos.borrador;

    const resultado = await pool.request()
        .input("id_recurso", sql.Int, datos.id_recurso)
        .input("tipo", sql.VarChar(20), "Devolución")
        .input("cantidad", sql.Int, datos.cantidad)
        .input("fecha", sql.Date, datos.fecha)
        .input("id_empleado", sql.Int, datos.id_empleado)
        .input("id_credencial", sql.Int, datos.id_credencial)
        .input("condicion", sql.VarChar(20), datos.condicion || "Buen estado")
        .input("observacion", sql.VarChar(300), datos.observacion || null)
        .input("estado", sql.VarChar(20), esBorrador ? "Pendiente" : "Registrado")
        .input("id_movimiento_relacionado", sql.Int, datos.id_movimiento_relacionado || null)
        .query(`
            INSERT INTO Movimiento_inventario
                (id_recurso, tipo, cantidad, fecha, id_empleado, id_credencial, condicion, observacion, estado, id_movimiento_relacionado, fecha_registro)
            OUTPUT INSERTED.id_movimiento
            VALUES
                (@id_recurso, @tipo, @cantidad, @fecha, @id_empleado, @id_credencial, @condicion, @observacion, @estado, @id_movimiento_relacionado, GETDATE())
        `);

    if (!esBorrador) {
        if (datos.condicion === "Perdido") {
            await recursosModel.ajustarCantidades(datos.id_recurso, { deltaTotal: -datos.cantidad });
        } else if (datos.condicion === "Buen estado" || !datos.condicion) {
            await recursosModel.ajustarCantidades(datos.id_recurso, { deltaDisponible: datos.cantidad });
        }
        /* "Dañado" / "Incompleto": no se libera a disponible ni se
           da de baja — queda registrado para revisión manual
           (se ve reflejado en el historial, no en las existencias). */
    }

    return obtenerPorId(resultado.recordset[0].id_movimiento);
}

async function obtenerPorId(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_movimiento", sql.Int, id)
        .query(`${SELECT_BASE} WHERE m.id_movimiento = @id_movimiento`);
    return resultado.recordset[0];
}

const SELECT_BASE = `
    SELECT
        m.id_movimiento, m.tipo, m.cantidad, m.fecha, m.origen, m.condicion,
        m.observacion, m.estado, m.fecha_devolucion_prevista, m.fecha_registro,
        r.id_recurso, r.codigo AS recurso_codigo, r.nombre AS recurso_nombre,
        e.codigo_empleado AS id_empleado, e.nombre AS empleado_nombre, e.apellido AS empleado_apellido,
        cr.id_credencial, re.nombre AS responsable_nombre, re.apellido AS responsable_apellido
    FROM Movimiento_inventario m
    INNER JOIN Recurso r ON r.id_recurso = m.id_recurso
    LEFT JOIN Empleado e ON e.codigo_empleado = m.id_empleado
    INNER JOIN credenciales cr ON cr.id_credencial = m.id_credencial
    INNER JOIN Empleado re ON re.codigo_empleado = cr.codigo_empleado
`;

/* Historial con filtros (tipo, rango de fechas, texto) + paginación. */
async function obtenerHistorial(filtros = {}) {
    const pool = await obtenerPool();
    const condiciones = [];
    const request = pool.request();

    if (filtros.tipo) {
        request.input("tipo", sql.VarChar(20), filtros.tipo);
        condiciones.push("m.tipo = @tipo");
    }
    if (filtros.desde) {
        request.input("desde", sql.Date, filtros.desde);
        condiciones.push("m.fecha >= @desde");
    }
    if (filtros.hasta) {
        request.input("hasta", sql.Date, filtros.hasta);
        condiciones.push("m.fecha <= @hasta");
    }
    if (filtros.texto) {
        request.input("texto", sql.VarChar(100), `%${filtros.texto}%`);
        condiciones.push("(r.nombre LIKE @texto OR r.codigo LIKE @texto OR e.nombre LIKE @texto OR e.apellido LIKE @texto)");
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

    const totalResultado = await request.query(`
        SELECT COUNT(*) AS total
        FROM Movimiento_inventario m
        INNER JOIN Recurso r ON r.id_recurso = m.id_recurso
        LEFT JOIN Empleado e ON e.codigo_empleado = m.id_empleado
        ${where}
    `);
    const total = totalResultado.recordset[0].total;

    const pagina = Math.max(1, Number(filtros.pagina) || 1);
    const porPagina = Math.max(1, Number(filtros.porPagina) || 10);
    const inicio = (pagina - 1) * porPagina;

    const requestDatos = pool.request();
    if (filtros.tipo) requestDatos.input("tipo", sql.VarChar(20), filtros.tipo);
    if (filtros.desde) requestDatos.input("desde", sql.Date, filtros.desde);
    if (filtros.hasta) requestDatos.input("hasta", sql.Date, filtros.hasta);
    if (filtros.texto) requestDatos.input("texto", sql.VarChar(100), `%${filtros.texto}%`);
    requestDatos.input("inicio", sql.Int, inicio);
    requestDatos.input("tamano", sql.Int, porPagina);

    const resultado = await requestDatos.query(`
        ${SELECT_BASE}
        ${where}
        ORDER BY m.fecha_registro DESC
        OFFSET @inicio ROWS FETCH NEXT @tamano ROWS ONLY
    `);

    return { datos: resultado.recordset, total, pagina, porPagina };
}

module.exports = {
    registrarEntrada,
    registrarEntrega,
    registrarDevolucion,
    obtenerEntregasAbiertas,
    obtenerPorId,
    obtenerHistorial
};
