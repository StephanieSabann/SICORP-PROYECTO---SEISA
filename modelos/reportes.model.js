const { sql, obtenerPool } = require("../basededatos/conexion");

/* ============================================================
   Repositorio de REPORTES en SQL Server
   ------------------------------------------------------------
   Solo LEE los datos de los demás módulos (consultas simples) y
   guarda lo propio del módulo (parámetros, bitácora, programados).
   Toda la lógica de agregación vive en servicios/reportes/ para
   poder probarla sin base de datos (ver repositorioReportesMemoria.js,
   que implementa esta misma interfaz).
   ============================================================ */

const aNumero = v => (v === null || v === undefined ? null : Number(v));

/* ---------------------- datos de otros módulos ---------------------- */

async function empleados() {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
        SELECT e.codigo_empleado, e.id_puesto, p.nombre AS puesto, e.nombre, e.apellido, e.dpi, e.nit,
               e.direccion, e.telefono, e.email, e.fecha_contratacion, e.fecha_nacimiento, e.activo,
               e.tipo_empleado, e.salario_base
        FROM Empleado e
        LEFT JOIN Puesto p ON p.id_puesto = e.id_puesto
        ORDER BY e.nombre, e.apellido, e.codigo_empleado`);
    return r.recordset.map(f => ({ ...f, activo: !!f.activo, salario_base: aNumero(f.salario_base) }));
}

async function permisos() {
    const pool = await obtenerPool();
    try {
        const r = await pool.request().query(`
            SELECT p.id_permiso, p.id_empleado, p.desde, p.hasta, p.motivo, p.estado, t.nombre AS tipo_nombre
            FROM PERMISOS p
            LEFT JOIN TIPO_PERMISOS t ON t.id_tipo = p.id_tipo
            ORDER BY p.desde DESC`);
        return r.recordset;
    } catch (_) {
        return []; // la tabla de permisos es opcional para los reportes
    }
}

async function recursos() {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
        SELECT r.id_recurso, r.codigo, r.nombre, r.id_categoria, c.nombre AS categoria, c.color AS categoria_color,
               r.cantidad_total, r.cantidad_disponible, r.cantidad_minima, r.estado_fisico, r.activo,
               r.fecha_creacion, r.costo_unitario
        FROM Recurso r
        INNER JOIN Categoria_recurso c ON c.id_categoria = r.id_categoria
        WHERE r.activo = 1
        ORDER BY r.codigo`);
    return r.recordset.map(f => ({ ...f, costo_unitario: aNumero(f.costo_unitario) }));
}

async function categorias() {
    const pool = await obtenerPool();
    const r = await pool.request().query(`SELECT id_categoria, nombre, color FROM Categoria_recurso ORDER BY id_categoria`);
    return r.recordset;
}

/* Movimientos confirmados (estado 'Registrado') cuya fecha cae entre desde y hasta (AAAA-MM-DD). */
async function movimientos({ desde, hasta }) {
    const pool = await obtenerPool();
    const r = await pool.request()
        .input("desde", sql.Date, desde)
        .input("hasta", sql.Date, hasta)
        .query(`
            SELECT m.id_movimiento, m.tipo, m.cantidad, m.fecha, m.origen, m.condicion, m.observacion,
                   m.fecha_devolucion_prevista, m.id_empleado,
                   r.id_recurso, r.codigo AS recurso_codigo, r.nombre AS recurso_nombre, c.nombre AS categoria,
                   e.nombre AS empleado_nombre, e.apellido AS empleado_apellido,
                   re.nombre AS responsable_nombre, re.apellido AS responsable_apellido
            FROM Movimiento_inventario m
            INNER JOIN Recurso r ON r.id_recurso = m.id_recurso
            INNER JOIN Categoria_recurso c ON c.id_categoria = r.id_categoria
            LEFT JOIN Empleado e ON e.codigo_empleado = m.id_empleado
            LEFT JOIN credenciales cr ON cr.id_credencial = m.id_credencial
            LEFT JOIN Empleado re ON re.codigo_empleado = cr.codigo_empleado
            WHERE m.estado = 'Registrado' AND m.fecha >= @desde AND m.fecha <= @hasta
            ORDER BY m.fecha DESC, m.id_movimiento DESC`);
    return r.recordset;
}

/* Última entrada de inventario confirmada (para "Datos del control"). */
async function ultimaEntrada() {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
        SELECT TOP 1 m.fecha, m.origen, re.nombre AS responsable_nombre, re.apellido AS responsable_apellido
        FROM Movimiento_inventario m
        LEFT JOIN credenciales cr ON cr.id_credencial = m.id_credencial
        LEFT JOIN Empleado re ON re.codigo_empleado = cr.codigo_empleado
        WHERE m.tipo = 'Entrada' AND m.estado = 'Registrado'
        ORDER BY m.fecha DESC, m.id_movimiento DESC`);
    return r.recordset[0] || null;
}

/* Entregas que todavía no tienen devolución. */
async function entregasPendientes() {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
        SELECT m.id_movimiento, m.cantidad, m.fecha AS fecha_entrega, m.fecha_devolucion_prevista, m.id_empleado,
               r.codigo AS recurso_codigo, r.nombre AS recurso_nombre,
               e.nombre AS empleado_nombre, e.apellido AS empleado_apellido
        FROM Movimiento_inventario m
        INNER JOIN Recurso r ON r.id_recurso = m.id_recurso
        LEFT JOIN Empleado e ON e.codigo_empleado = m.id_empleado
        WHERE m.tipo = 'Entrega' AND m.estado = 'Registrado'
          AND NOT EXISTS (
              SELECT 1 FROM Movimiento_inventario d
              WHERE d.tipo = 'Devolución' AND d.id_movimiento_relacionado = m.id_movimiento AND d.estado = 'Registrado'
          )
        ORDER BY m.fecha DESC`);
    return r.recordset;
}

async function ultimoConteo() {
    const pool = await obtenerPool();
    try {
        const r = await pool.request().query(`
            SELECT TOP 1 codigo, fecha, estado FROM Conteo_inventario
            WHERE estado <> 'En curso'
            ORDER BY fecha DESC, id_conteo DESC`);
        return r.recordset[0] || null;
    } catch (_) {
        return null;
    }
}

/* Nóminas no canceladas entre dos períodos (AAAA-MM, inclusive), con su fotografía aprobada. */
async function nominas({ desdePeriodo, hastaPeriodo }) {
    const pool = await obtenerPool();
    const r = await pool.request()
        .input("desde", sql.Char(7), desdePeriodo)
        .input("hasta", sql.Char(7), hastaPeriodo)
        .query(`
            SELECT id_nomina, tipo, periodo, codigo_empleado, empleado_nombre, estado, numero_recibo,
                   total_centavos, fecha_aprobacion, fecha_actualizacion, fecha_creacion, snapshot
            FROM Nomina_proceso
            WHERE estado <> 'CANCELADA' AND periodo >= @desde AND periodo <= @hasta
            ORDER BY periodo DESC, id_nomina DESC`);
    return r.recordset.map(f => {
        let snapshot = null;
        try { snapshot = f.snapshot ? JSON.parse(f.snapshot) : null; } catch (_) { snapshot = null; }
        return { ...f, total_centavos: aNumero(f.total_centavos), snapshot };
    });
}

async function periodosNominaCerrados() {
    const pool = await obtenerPool();
    try {
        const r = await pool.request().query(`SELECT periodo FROM Nomina_periodo WHERE estado = 'CERRADO'`);
        return r.recordset.map(f => f.periodo);
    } catch (_) {
        return [];
    }
}

/* Valores reales para armar los filtros de los dashboards (puestos, tipos, orígenes...). */
async function catalogos() {
    const pool = await obtenerPool();
    const lista = async consulta => { try { return (await pool.request().query(consulta)).recordset.map(f => f.v).filter(v => v !== null && v !== ""); } catch (_) { return []; } };
    return {
        puestos: await lista(`SELECT nombre AS v FROM Puesto ORDER BY nombre`),
        tiposNomina: await lista(`SELECT DISTINCT tipo AS v FROM Nomina_proceso WHERE estado <> 'CANCELADA' ORDER BY tipo`),
        origenes: await lista(`SELECT DISTINCT origen AS v FROM Movimiento_inventario WHERE origen IS NOT NULL ORDER BY origen`),
        tiposPermiso: await lista(`SELECT nombre AS v FROM TIPO_PERMISOS ORDER BY nombre`)
    };
}

/* ---------------------- propio del módulo ---------------------- */

async function parametros() {
    const pool = await obtenerPool();
    const r = await pool.request().query(`SELECT clave, valor FROM Reporte_parametro`);
    return Object.fromEntries(r.recordset.map(f => [f.clave, f.valor]));
}

async function guardarParametro({ clave, valor, id_credencial }) {
    const pool = await obtenerPool();
    await pool.request()
        .input("clave", sql.VarChar(60), clave)
        .input("valor", sql.NVarChar(200), valor)
        .input("por", sql.Int, id_credencial || null)
        .query(`
            IF EXISTS (SELECT 1 FROM Reporte_parametro WHERE clave = @clave)
                UPDATE Reporte_parametro SET valor = @valor, actualizado_por = @por, fecha = SYSDATETIME() WHERE clave = @clave
            ELSE
                INSERT INTO Reporte_parametro (clave, valor, actualizado_por) VALUES (@clave, @valor, @por)`);
}

async function visibilidad() {
    const pool = await obtenerPool();
    const r = await pool.request().query(`SELECT clave, activo FROM Reporte_visibilidad`);
    return Object.fromEntries(r.recordset.map(f => [f.clave, !!f.activo]));
}

async function guardarVisibilidad({ clave, activo, id_credencial }) {
    const pool = await obtenerPool();
    await pool.request()
        .input("clave", sql.VarChar(60), clave)
        .input("activo", sql.Bit, activo ? 1 : 0)
        .input("por", sql.Int, id_credencial || null)
        .query(`
            IF EXISTS (SELECT 1 FROM Reporte_visibilidad WHERE clave = @clave)
                UPDATE Reporte_visibilidad SET activo = @activo, actualizado_por = @por, fecha = SYSDATETIME() WHERE clave = @clave
            ELSE
                INSERT INTO Reporte_visibilidad (clave, activo, actualizado_por) VALUES (@clave, @activo, @por)`);
}

async function registrarBitacora(b) {
    const pool = await obtenerPool();
    await pool.request()
        .input("accion", sql.VarChar(20), b.accion)
        .input("reporte", sql.VarChar(60), b.reporte)
        .input("formato", sql.VarChar(10), b.formato || null)
        .input("periodo", sql.Char(7), b.periodo || null)
        .input("filtros", sql.NVarChar(400), b.filtros ? String(b.filtros).slice(0, 400) : null)
        .input("filas", sql.Int, b.filas ?? null)
        .input("id_credencial", sql.Int, b.id_credencial || null)
        .input("usuario", sql.NVarChar(100), b.usuario || null)
        .input("duracion_ms", sql.Int, b.duracion_ms ?? null)
        .query(`INSERT INTO Reporte_bitacora (accion, reporte, formato, periodo, filtros, filas, id_credencial, usuario, duracion_ms)
                VALUES (@accion, @reporte, @formato, @periodo, @filtros, @filas, @id_credencial, @usuario, @duracion_ms)`);
}

async function listarBitacora({ reporte, usuario, pagina = 1, porPagina = 15 }) {
    const pool = await obtenerPool();
    const cond = [];
    const filtros = req => {
        if (reporte) { req.input("reporte", sql.VarChar(60), reporte); }
        if (usuario) { req.input("usuario", sql.NVarChar(100), `%${usuario}%`); }
        return req;
    };
    if (reporte) cond.push("reporte = @reporte");
    if (usuario) cond.push("usuario LIKE @usuario");
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    const total = (await filtros(pool.request()).query(`SELECT COUNT(*) AS total FROM Reporte_bitacora ${where}`)).recordset[0].total;
    const inicio = (Math.max(1, pagina) - 1) * porPagina;
    const r = await filtros(pool.request())
        .input("inicio", sql.Int, inicio)
        .input("tamano", sql.Int, porPagina)
        .query(`SELECT id_bitacora, accion, reporte, formato, periodo, filtros, filas, usuario, duracion_ms, fecha
                FROM Reporte_bitacora ${where}
                ORDER BY id_bitacora DESC
                OFFSET @inicio ROWS FETCH NEXT @tamano ROWS ONLY`);
    return { filas: r.recordset, total };
}

async function depurarBitacora(diasConservar) {
    const pool = await obtenerPool();
    const r = await pool.request()
        .input("dias", sql.Int, diasConservar)
        .query(`DELETE FROM Reporte_bitacora WHERE fecha < DATEADD(DAY, -@dias, SYSDATETIME())`);
    return r.rowsAffected[0] || 0;
}

const COLUMNAS_PROGRAMADO = `id_programado, nombre, reporte, formato, frecuencia, dia, hora, destinatarios, activo,
    ultima_ejecucion, ultimo_estado, creado_por, fecha_creacion`;

async function listarProgramados() {
    const pool = await obtenerPool();
    const r = await pool.request().query(`SELECT ${COLUMNAS_PROGRAMADO} FROM Reporte_programado ORDER BY id_programado`);
    return r.recordset.map(f => ({ ...f, activo: !!f.activo }));
}

async function obtenerProgramado(id) {
    const pool = await obtenerPool();
    const r = await pool.request().input("id", sql.Int, id)
        .query(`SELECT ${COLUMNAS_PROGRAMADO} FROM Reporte_programado WHERE id_programado = @id`);
    const f = r.recordset[0];
    return f ? { ...f, activo: !!f.activo } : null;
}

async function crearProgramado(p) {
    const pool = await obtenerPool();
    const r = await pool.request()
        .input("nombre", sql.NVarChar(100), p.nombre)
        .input("reporte", sql.VarChar(60), p.reporte)
        .input("formato", sql.VarChar(10), p.formato)
        .input("frecuencia", sql.VarChar(10), p.frecuencia)
        .input("dia", sql.Int, p.dia ?? null)
        .input("hora", sql.Char(5), p.hora)
        .input("destinatarios", sql.NVarChar(400), p.destinatarios)
        .input("por", sql.Int, p.id_credencial || null)
        .query(`INSERT INTO Reporte_programado (nombre, reporte, formato, frecuencia, dia, hora, destinatarios, creado_por)
                OUTPUT INSERTED.id_programado
                VALUES (@nombre, @reporte, @formato, @frecuencia, @dia, @hora, @destinatarios, @por)`);
    return obtenerProgramado(r.recordset[0].id_programado);
}

async function actualizarProgramado(id, p) {
    const pool = await obtenerPool();
    await pool.request()
        .input("id", sql.Int, id)
        .input("nombre", sql.NVarChar(100), p.nombre)
        .input("reporte", sql.VarChar(60), p.reporte)
        .input("formato", sql.VarChar(10), p.formato)
        .input("frecuencia", sql.VarChar(10), p.frecuencia)
        .input("dia", sql.Int, p.dia ?? null)
        .input("hora", sql.Char(5), p.hora)
        .input("destinatarios", sql.NVarChar(400), p.destinatarios)
        .input("activo", sql.Bit, p.activo ? 1 : 0)
        .query(`UPDATE Reporte_programado
                SET nombre = @nombre, reporte = @reporte, formato = @formato, frecuencia = @frecuencia,
                    dia = @dia, hora = @hora, destinatarios = @destinatarios, activo = @activo
                WHERE id_programado = @id`);
    return obtenerProgramado(id);
}

async function eliminarProgramado(id) {
    const pool = await obtenerPool();
    await pool.request().input("id", sql.Int, id).query(`DELETE FROM Reporte_programado WHERE id_programado = @id`);
}

async function marcarEjecucion(id, { fecha, estado }) {
    const pool = await obtenerPool();
    await pool.request()
        .input("id", sql.Int, id)
        .input("fecha", sql.DateTime2, fecha)
        .input("estado", sql.NVarChar(250), String(estado || "").slice(0, 250))
        .query(`UPDATE Reporte_programado SET ultima_ejecucion = @fecha, ultimo_estado = @estado WHERE id_programado = @id`);
}

/* Costo unitario de un recurso (Mantenimiento → Reportes → Costos). */
async function guardarCostoRecurso({ id_recurso, costo_unitario }) {
    const pool = await obtenerPool();
    const r = await pool.request()
        .input("id", sql.Int, id_recurso)
        .input("costo", sql.Decimal(12, 2), costo_unitario)
        .query(`UPDATE Recurso SET costo_unitario = @costo WHERE id_recurso = @id AND activo = 1`);
    return (r.rowsAffected[0] || 0) > 0;
}

module.exports = {
    empleados, permisos, recursos, categorias, movimientos, ultimaEntrada, entregasPendientes, ultimoConteo,
    nominas, periodosNominaCerrados, catalogos,
    parametros, guardarParametro, visibilidad, guardarVisibilidad,
    registrarBitacora, listarBitacora, depurarBitacora,
    listarProgramados, obtenerProgramado, crearProgramado, actualizarProgramado, eliminarProgramado, marcarEjecucion,
    guardarCostoRecurso
};
