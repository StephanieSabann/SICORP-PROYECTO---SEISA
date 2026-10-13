const { sql, obtenerPool } = require("../basededatos/conexion");

/* ============================================================
   Repositorio de NÓMINAS en SQL Server
   (misma interfaz que servicios/repositorioMemoria.js)
   Tablas: ver basededatos/esquemaNominas.js
   ============================================================ */

function conflicto(mensaje) {
    const e = new Error(mensaje);
    e.status = 409;
    return e;
}
const esDuplicado = error => /UX_Nomina_tipo_empleado_periodo|duplicate key|unique index/i.test(error.message || "");

function deFila(f) {
    if (!f) return null;
    return {
        ...f,
        total_centavos: f.total_centavos === null || f.total_centavos === undefined ? null : Number(f.total_centavos),
        datos: f.datos ? JSON.parse(f.datos) : {},
        snapshot: f.snapshot ? JSON.parse(f.snapshot) : null
    };
}

const COLUMNAS = `
    id_nomina, tipo, periodo, codigo_empleado, empleado_nombre, estado, paso_actual, paso_completado,
    datos, version, creado_por, fecha_creacion, actualizado_por, fecha_actualizacion,
    aprobado_por, fecha_aprobacion, numero_recibo, total_centavos, snapshot`;

async function crear(n) {
    const pool = await obtenerPool();
    try {
        const r = await pool.request()
            .input("tipo", sql.VarChar(20), n.tipo)
            .input("periodo", sql.Char(7), n.periodo)
            .input("codigo_empleado", sql.Int, n.codigo_empleado || null)
            .input("estado", sql.VarChar(25), n.estado)
            .input("paso_actual", sql.Int, n.paso_actual)
            .input("paso_completado", sql.Int, n.paso_completado)
            .input("datos", sql.NVarChar(sql.MAX), JSON.stringify(n.datos || {}))
            .input("creado_por", sql.Int, n.creado_por || null)
            .query(`
                INSERT INTO Nomina_proceso (tipo, periodo, codigo_empleado, estado, paso_actual, paso_completado, datos, version, creado_por, fecha_creacion)
                OUTPUT INSERTED.id_nomina
                VALUES (@tipo, @periodo, @codigo_empleado, @estado, @paso_actual, @paso_completado, @datos, 1, @creado_por, SYSDATETIME())
            `);
        return obtener(r.recordset[0].id_nomina);
    } catch (error) {
        if (esDuplicado(error)) throw conflicto("Ya existe una nómina para ese empleado, tipo y período.");
        throw error;
    }
}

async function obtener(id) {
    const pool = await obtenerPool();
    const r = await pool.request().input("id", sql.Int, id).query(`SELECT ${COLUMNAS} FROM Nomina_proceso WHERE id_nomina = @id`);
    return deFila(r.recordset[0]);
}

/* Guarda con control de versión: si otra persona guardó antes, falla
   en vez de pisar sus cambios. Nunca modifica una nómina aprobada. */
async function guardar(n) {
    const pool = await obtenerPool();
    let r;
    try {
        r = await pool.request()
            .input("id", sql.Int, n.id_nomina)
            .input("version", sql.Int, n.version)
            .input("codigo_empleado", sql.Int, n.codigo_empleado || null)
            .input("empleado_nombre", sql.NVarChar(150), n.empleado_nombre || null)
            .input("estado", sql.VarChar(25), n.estado)
            .input("paso_actual", sql.Int, n.paso_actual)
            .input("paso_completado", sql.Int, n.paso_completado)
            .input("datos", sql.NVarChar(sql.MAX), JSON.stringify(n.datos || {}))
            .input("actualizado_por", sql.Int, n.actualizado_por || null)
            .query(`
                UPDATE Nomina_proceso
                SET codigo_empleado = @codigo_empleado, empleado_nombre = @empleado_nombre, estado = @estado,
                    paso_actual = @paso_actual, paso_completado = @paso_completado, datos = @datos,
                    version = version + 1, actualizado_por = @actualizado_por, fecha_actualizacion = SYSDATETIME()
                WHERE id_nomina = @id AND version = @version AND estado <> 'APROBADA'
            `);
    } catch (error) {
        if (esDuplicado(error)) throw conflicto("Ya existe una nómina para ese empleado, tipo y período.");
        throw error;
    }
    if (!r.rowsAffected[0]) throw conflicto("La nómina fue modificada por otra persona o ya fue aprobada. Recarga la página para ver los cambios.");
    n.version += 1;
    return n;
}

async function buscar({ tipo, periodo, codigo_empleado }) {
    const pool = await obtenerPool();
    const r = await pool.request()
        .input("tipo", sql.VarChar(20), tipo)
        .input("periodo", sql.Char(7), periodo)
        .input("codigo_empleado", sql.Int, codigo_empleado)
        .query(`SELECT ${COLUMNAS} FROM Nomina_proceso WHERE tipo = @tipo AND periodo = @periodo AND codigo_empleado = @codigo_empleado`);
    return r.recordset.map(deFila);
}

async function listar(f = {}) {
    const pool = await obtenerPool();
    const req = pool.request();
    const cond = ["estado <> 'CANCELADA'"];
    if (f.estados && f.estados.length) {
        cond.push(`estado IN (${f.estados.map((e, i) => { req.input("e" + i, sql.VarChar(25), e); return "@e" + i; }).join(",")})`);
    }
    if (f.estado) { req.input("estado", sql.VarChar(25), f.estado); cond.push("estado = @estado"); }
    if (f.tipo) { req.input("tipo", sql.VarChar(20), f.tipo); cond.push("tipo = @tipo"); }
    if (f.periodo) { req.input("periodo", sql.Char(7), f.periodo); cond.push("periodo = @periodo"); }
    if (f.codigo_empleado) { req.input("codigo_empleado", sql.Int, Number(f.codigo_empleado)); cond.push("codigo_empleado = @codigo_empleado"); }
    if (f.texto) {
        req.input("texto", sql.NVarChar(120), `%${f.texto}%`);
        cond.push("(empleado_nombre LIKE @texto OR CAST(numero_recibo AS VARCHAR(12)) LIKE @texto)");
    }
    const r = await req.query(`
        SELECT TOP 500 id_nomina, tipo, periodo, codigo_empleado, empleado_nombre, estado, paso_actual,
               numero_recibo, total_centavos, fecha_aprobacion, fecha_actualizacion, fecha_creacion
        FROM Nomina_proceso
        WHERE ${cond.join(" AND ")}
        ORDER BY COALESCE(fecha_aprobacion, fecha_actualizacion, fecha_creacion) DESC
    `);
    return r.recordset.map(f => ({ ...f, total_centavos: f.total_centavos === null ? null : Number(f.total_centavos) }));
}

/* Comprobante aprobado eliminado del historial. No se borra la fila:
   se marca CANCELADA (deja de verse y el empleado puede volver a hacer
   su nómina de ese período); el snapshot, el número de recibo y el
   historial de acciones quedan guardados para auditoría. */
async function eliminarAprobada(id_nomina, id_credencial) {
    const pool = await obtenerPool();
    const r = await pool.request()
        .input("id", sql.Int, id_nomina)
        .input("por", sql.Int, id_credencial || null)
        .query(`UPDATE Nomina_proceso
                SET estado = 'CANCELADA', version = version + 1, actualizado_por = @por, fecha_actualizacion = SYSDATETIME()
                WHERE id_nomina = @id AND estado = 'APROBADA'`);
    if (!r.rowsAffected[0]) throw conflicto("Ese comprobante ya no está en el historial.");
}

async function registrarHistorial(entradas) {
    const pool = await obtenerPool();
    for (const e of entradas) {
        await pool.request()
            .input("id_nomina", sql.Int, e.id_nomina)
            .input("accion", sql.NVarChar(60), e.accion)
            .input("campo", sql.NVarChar(150), e.campo || null)
            .input("anterior", sql.NVarChar(400), e.valor_anterior)
            .input("nuevo", sql.NVarChar(400), e.valor_nuevo)
            .input("id_credencial", sql.Int, e.id_credencial || null)
            .input("usuario", sql.NVarChar(100), e.usuario || null)
            .query(`INSERT INTO Nomina_historial (id_nomina, accion, campo, valor_anterior, valor_nuevo, id_credencial, usuario, fecha)
                    VALUES (@id_nomina, @accion, @campo, @anterior, @nuevo, @id_credencial, @usuario, SYSDATETIME())`);
    }
}

async function historial(id) {
    const pool = await obtenerPool();
    const r = await pool.request().input("id", sql.Int, id).query(`
        SELECT id_historial, accion, campo, valor_anterior, valor_nuevo, usuario, fecha
        FROM Nomina_historial WHERE id_nomina = @id ORDER BY id_historial DESC`);
    return r.recordset;
}

async function registrarArchivo(a) {
    const pool = await obtenerPool();
    await pool.request()
        .input("id_nomina", sql.Int, a.id_nomina)
        .input("nombre_original", sql.NVarChar(200), a.nombre)
        .input("nombre_guardado", sql.NVarChar(200), a.nombre_guardado)
        .input("tamano", sql.Int, a.tamano)
        .input("registros", sql.Int, a.registros)
        .input("subido_por", sql.Int, a.id_credencial || null)
        .query(`INSERT INTO Nomina_archivo (id_nomina, nombre_original, nombre_guardado, tamano, registros, subido_por)
                VALUES (@id_nomina, @nombre_original, @nombre_guardado, @tamano, @registros, @subido_por)`);
}

async function marcarArchivoEliminado(id, nombreGuardado) {
    const pool = await obtenerPool();
    await pool.request().input("id", sql.Int, id).input("nombre", sql.NVarChar(200), nombreGuardado)
        .query(`UPDATE Nomina_archivo SET eliminado = 1 WHERE id_nomina = @id AND nombre_guardado = @nombre`);
}

/* Empleados: se leen del módulo de Empleados (no hay catálogo aparte). */
async function empleadosActivos() {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
        SELECT e.codigo_empleado, e.nombre, e.apellido, e.activo, e.tipo_empleado, e.salario_base, p.nombre AS puesto
        FROM Empleado e
        LEFT JOIN Puesto p ON p.id_puesto = e.id_puesto
        WHERE e.activo = 1
        ORDER BY e.nombre, e.apellido`);
    return r.recordset;
}

async function empleado(codigo) {
    const pool = await obtenerPool();
    const r = await pool.request().input("codigo", sql.Int, codigo).query(`
        SELECT e.codigo_empleado, e.nombre, e.apellido, e.activo, e.tipo_empleado, e.salario_base, p.nombre AS puesto
        FROM Empleado e
        LEFT JOIN Puesto p ON p.id_puesto = e.id_puesto
        WHERE e.codigo_empleado = @codigo`);
    return r.recordset[0] || null;
}

async function perfilPago(codigo) {
    const pool = await obtenerPool();
    const r = await pool.request().input("codigo", sql.Int, codigo)
        .query(`SELECT codigo_empleado, salario_base, bonificacion, forma_pago, banco, cuenta FROM Nomina_perfil_pago WHERE codigo_empleado = @codigo`);
    const f = r.recordset[0];
    if (!f) return null;
    return { ...f, salario_base: f.salario_base === null ? null : Number(f.salario_base), bonificacion: f.bonificacion === null ? null : Number(f.bonificacion) };
}

async function guardarPerfilPago(p) {
    const pool = await obtenerPool();
    const req = pool.request()
        .input("codigo", sql.Int, p.codigo_empleado)
        .input("forma_pago", sql.NVarChar(40), p.forma_pago || null)
        .input("banco", sql.NVarChar(60), p.banco || null)
        .input("cuenta", sql.NVarChar(30), p.cuenta || null)
        .input("por", sql.Int, p.id_credencial || null);
    const sets = ["forma_pago = @forma_pago", "banco = @banco", "cuenta = @cuenta", "actualizado_por = @por", "fecha = SYSDATETIME()"];
    const cols = ["codigo_empleado", "forma_pago", "banco", "cuenta", "actualizado_por"];
    const vals = ["@codigo", "@forma_pago", "@banco", "@cuenta", "@por"];
    if (p.salario_base !== undefined) { req.input("salario", sql.BigInt, p.salario_base); sets.push("salario_base = @salario"); cols.push("salario_base"); vals.push("@salario"); }
    if (p.bonificacion !== undefined) { req.input("bono", sql.BigInt, p.bonificacion); sets.push("bonificacion = @bono"); cols.push("bonificacion"); vals.push("@bono"); }
    await req.query(`
        IF EXISTS (SELECT 1 FROM Nomina_perfil_pago WHERE codigo_empleado = @codigo)
            UPDATE Nomina_perfil_pago SET ${sets.join(", ")} WHERE codigo_empleado = @codigo
        ELSE
            INSERT INTO Nomina_perfil_pago (${cols.join(", ")}) VALUES (${vals.join(", ")})`);
}

async function preciosActividades(tipo) {
    const pool = await obtenerPool();
    const r = await pool.request().input("tipo", sql.VarChar(20), tipo)
        .query(`SELECT tipo, actividad, precio_produccion, precio_bono FROM Nomina_actividad_precio WHERE tipo = @tipo`);
    return r.recordset.map(p => ({
        ...p,
        precio_produccion: p.precio_produccion === null ? null : Number(p.precio_produccion),
        precio_bono: p.precio_bono === null ? null : Number(p.precio_bono)
    }));
}

async function guardarPrecioActividad(p) {
    const pool = await obtenerPool();
    await pool.request()
        .input("tipo", sql.VarChar(20), p.tipo)
        .input("actividad", sql.NVarChar(150), p.actividad)
        .input("prod", sql.BigInt, p.precio_produccion)
        .input("bono", sql.BigInt, p.precio_bono)
        .input("por", sql.Int, p.id_credencial || null)
        .query(`
            IF EXISTS (SELECT 1 FROM Nomina_actividad_precio WHERE tipo = @tipo AND actividad = @actividad)
                UPDATE Nomina_actividad_precio SET precio_produccion = @prod, precio_bono = @bono, actualizado_por = @por, fecha = SYSDATETIME()
                WHERE tipo = @tipo AND actividad = @actividad
            ELSE
                INSERT INTO Nomina_actividad_precio (tipo, actividad, precio_produccion, precio_bono, actualizado_por)
                VALUES (@tipo, @actividad, @prod, @bono, @por)`);
}

/* Aprobación TRANSACCIONAL: marca la nómina, guarda el snapshot y
   crea el comprobante con su número — todo o nada. La condición
   "estado = PENDIENTE_APROBACION AND version = @version" impide que
   un doble clic o un reintento la apruebe dos veces. */
async function aprobar({ id_nomina, version, snapshot, total, id_credencial, paso_actual, paso_completado }) {
    const pool = await obtenerPool();
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
        const marcar = await new sql.Request(tx)
            .input("id", sql.Int, id_nomina)
            .input("version", sql.Int, version)
            .input("snapshot", sql.NVarChar(sql.MAX), JSON.stringify(snapshot))
            .input("total", sql.BigInt, total)
            .input("por", sql.Int, id_credencial)
            .input("paso_actual", sql.Int, paso_actual)
            .input("paso_completado", sql.Int, paso_completado)
            .query(`
                UPDATE Nomina_proceso
                SET estado = 'APROBADA', snapshot = @snapshot, total_centavos = @total,
                    aprobado_por = @por, fecha_aprobacion = SYSDATETIME(),
                    paso_actual = @paso_actual, paso_completado = @paso_completado,
                    version = version + 1, actualizado_por = @por, fecha_actualizacion = SYSDATETIME()
                WHERE id_nomina = @id AND version = @version AND estado = 'PENDIENTE_APROBACION'
            `);
        if (!marcar.rowsAffected[0]) throw conflicto("Esta nómina ya fue aprobada o cambió mientras se aprobaba. Recarga la página.");

        const comprobante = await new sql.Request(tx)
            .input("id", sql.Int, id_nomina)
            .input("total", sql.BigInt, total)
            .input("por", sql.Int, id_credencial)
            .query(`INSERT INTO Nomina_comprobante (id_nomina, total_centavos, generado_por)
                    OUTPUT INSERTED.numero_recibo VALUES (@id, @total, @por)`);
        const numero = comprobante.recordset[0].numero_recibo;

        await new sql.Request(tx).input("id", sql.Int, id_nomina).input("numero", sql.Int, numero)
            .query(`UPDATE Nomina_proceso SET numero_recibo = @numero WHERE id_nomina = @id`);

        await tx.commit();
        return { numero_recibo: numero };
    } catch (error) {
        try { await tx.rollback(); } catch (_) { /* ya revertida */ }
        if (/UNIQUE|duplicate/i.test(error.message || "")) throw conflicto("Esta nómina ya tiene comprobante.");
        throw error;
    }
}

module.exports = {
    crear, obtener, guardar, buscar, listar, registrarHistorial, historial,
    registrarArchivo, marcarArchivoEliminado, empleadosActivos, empleado,
    perfilPago, guardarPerfilPago, preciosActividades, guardarPrecioActividad, aprobar, eliminarAprobada
};
