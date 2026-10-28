const { sql, obtenerPool } = require("../basededatos/conexion");

/* ============================================================
   Catálogo de recursos (Inventario)
   ------------------------------------------------------------
   Tablas: Categoria_recurso, Recurso. Las crea solas
   basededatos/esquemaInventario.js al arrancar el servidor,
   incluidas las columnas "imagen" (ruta del archivo subido, ej.
   "img/recursos/REC-001-123.jpg") y "color" de la categoría.
   ============================================================ */

/* ======================= CATEGORÍAS ======================= */

async function obtenerCategorias() {
    const pool = await obtenerPool();
    const resultado = await pool.request().query(`
        SELECT
            c.id_categoria, c.nombre, c.color, c.imagen,
            COUNT(r.id_recurso) AS total_tipos,
            ISNULL(SUM(r.cantidad_total), 0) AS total_unidades
        FROM Categoria_recurso c
        LEFT JOIN Recurso r ON r.id_categoria = c.id_categoria AND r.activo = 1
        GROUP BY c.id_categoria, c.nombre, c.color, c.imagen
        ORDER BY c.id_categoria
    `);
    return resultado.recordset;
}

/* Cuenta cuántos recursos (y cuántas unidades disponibles/totales) hay
   por categoría — se usa en las tarjetas de "Resumen" y "Recursos". */
async function obtenerResumenPorCategoria() {
    const pool = await obtenerPool();
    const resultado = await pool.request().query(`
        SELECT
            c.id_categoria, c.nombre, c.color, c.imagen,
            COUNT(r.id_recurso) AS total_tipos,
            ISNULL(SUM(r.cantidad_total), 0) AS total_unidades,
            ISNULL(SUM(r.cantidad_disponible), 0) AS total_disponibles
        FROM Categoria_recurso c
        LEFT JOIN Recurso r ON r.id_categoria = c.id_categoria AND r.activo = 1
        GROUP BY c.id_categoria, c.nombre, c.color, c.imagen
        ORDER BY c.id_categoria
    `);
    return resultado.recordset;
}

async function obtenerCategoriaPorId(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_categoria", sql.Int, id)
        .query(`SELECT id_categoria, nombre, color, imagen FROM Categoria_recurso WHERE id_categoria = @id_categoria`);
    return resultado.recordset[0] || null;
}

async function crearCategoria({ nombre, color, imagen }) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("nombre", sql.VarChar(50), nombre)
        .input("color", sql.VarChar(7), color || null)
        .input("imagen", sql.VarChar(255), imagen || null)
        .query(`
            INSERT INTO Categoria_recurso (nombre, color, imagen)
            OUTPUT INSERTED.id_categoria
            VALUES (@nombre, @color, @imagen)
        `);
    return obtenerCategoriaPorId(resultado.recordset[0].id_categoria);
}

/* Cambia nombre/color, y la imagen solo si llega una nueva. */
async function actualizarCategoria(id, { nombre, color, imagen }) {
    const pool = await obtenerPool();
    const request = pool.request()
        .input("id_categoria", sql.Int, id)
        .input("nombre", sql.VarChar(50), nombre)
        .input("color", sql.VarChar(7), color || null);
    let cambioImagen = "";
    if (imagen) {
        request.input("imagen", sql.VarChar(255), imagen);
        cambioImagen = ", imagen = @imagen";
    }
    await request.query(`
        UPDATE Categoria_recurso
        SET nombre = @nombre, color = @color${cambioImagen}
        WHERE id_categoria = @id_categoria
    `);
    return obtenerCategoriaPorId(id);
}

async function actualizarImagenCategoria(id, rutaImagen) {
    const pool = await obtenerPool();
    await pool.request()
        .input("id_categoria", sql.Int, id)
        .input("imagen", sql.VarChar(255), rutaImagen)
        .query(`UPDATE Categoria_recurso SET imagen = @imagen WHERE id_categoria = @id_categoria`);
    return obtenerCategoriaPorId(id);
}

/* Solo se puede borrar una categoría que no tenga recursos (ni
   siquiera recursos ya eliminados, porque esos siguen en el
   historial de movimientos). */
async function eliminarCategoria(id) {
    const pool = await obtenerPool();
    const uso = await pool.request()
        .input("id_categoria", sql.Int, id)
        .query(`SELECT COUNT(*) AS total FROM Recurso WHERE id_categoria = @id_categoria`);
    if (uso.recordset[0].total > 0) {
        throw new Error("Esta categoría tiene recursos registrados; muévelos a otra categoría antes de eliminarla.");
    }
    await pool.request()
        .input("id_categoria", sql.Int, id)
        .query(`DELETE FROM Categoria_recurso WHERE id_categoria = @id_categoria`);
}

/* ======================= RECURSOS ======================= */

async function obtenerResumenGeneral() {
    const pool = await obtenerPool();
    const resultado = await pool.request().query(`
        SELECT
            ISNULL(SUM(cantidad_total), 0) AS total_unidades,
            ISNULL(SUM(cantidad_disponible), 0) AS total_disponibles,
            ISNULL(SUM(cantidad_total - cantidad_disponible), 0) AS total_asignadas,
            COUNT(*) AS total_recursos
        FROM Recurso
        WHERE activo = 1
    `);
    return resultado.recordset[0];
}

const COLUMNAS_RECURSO = `
    r.id_recurso, r.codigo, r.nombre, r.id_categoria,
    c.nombre AS categoria, c.color AS categoria_color,
    r.cantidad_total, r.cantidad_disponible, r.cantidad_minima,
    r.estado_fisico, r.activo, r.fecha_creacion, r.imagen
`;

/* Filtros: texto (código o nombre), categoría, disponibilidad
   ("disponible" | "bajo" | "agotado"), página y tamaño de página. */
async function obtenerTodos(filtros = {}) {
    const pool = await obtenerPool();
    const condiciones = ["r.activo = 1"];

    if (filtros.texto) condiciones.push("(r.nombre LIKE @texto OR r.codigo LIKE @texto)");
    if (filtros.id_categoria) condiciones.push("r.id_categoria = @id_categoria");
    if (filtros.disponibilidad === "disponible") {
        condiciones.push("r.cantidad_disponible > r.cantidad_minima");
    } else if (filtros.disponibilidad === "bajo") {
        condiciones.push("r.cantidad_disponible > 0 AND r.cantidad_disponible <= r.cantidad_minima");
    } else if (filtros.disponibilidad === "agotado") {
        condiciones.push("r.cantidad_disponible <= 0");
    }
    const where = `WHERE ${condiciones.join(" AND ")}`;

    const pagina = Math.max(1, Number(filtros.pagina) || 1);
    const porPagina = Math.max(1, Math.min(100, Number(filtros.porPagina) || 10));
    const inicio = (pagina - 1) * porPagina;

    const nuevoRequest = () => {
        const r = pool.request();
        if (filtros.texto) r.input("texto", sql.VarChar(100), `%${filtros.texto}%`);
        if (filtros.id_categoria) r.input("id_categoria", sql.Int, filtros.id_categoria);
        return r;
    };

    const totalResultado = await nuevoRequest().query(`SELECT COUNT(*) AS total FROM Recurso r ${where}`);
    const total = totalResultado.recordset[0].total;

    const resultado = await nuevoRequest()
        .input("inicio", sql.Int, inicio)
        .input("tamano", sql.Int, porPagina)
        .query(`
            SELECT ${COLUMNAS_RECURSO}
            FROM Recurso r
            INNER JOIN Categoria_recurso c ON c.id_categoria = r.id_categoria
            ${where}
            ORDER BY r.codigo
            OFFSET @inicio ROWS FETCH NEXT @tamano ROWS ONLY
        `);

    return { datos: resultado.recordset, total, pagina, porPagina };
}

async function obtenerRecientes(limite = 5) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("limite", sql.Int, limite)
        .query(`
            SELECT TOP (@limite) ${COLUMNAS_RECURSO}
            FROM Recurso r
            INNER JOIN Categoria_recurso c ON c.id_categoria = r.id_categoria
            WHERE r.activo = 1
            ORDER BY r.fecha_creacion DESC, r.id_recurso DESC
        `);
    return resultado.recordset;
}

async function obtenerPorId(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_recurso", sql.Int, id)
        .query(`
            SELECT ${COLUMNAS_RECURSO}
            FROM Recurso r
            INNER JOIN Categoria_recurso c ON c.id_categoria = r.id_categoria
            WHERE r.id_recurso = @id_recurso
        `);
    return resultado.recordset[0] || null;
}

/* Lista corta usada para llenar los <select> de Entrada/Entrega. */
async function obtenerParaSelect() {
    const pool = await obtenerPool();
    const resultado = await pool.request().query(`
        SELECT ${COLUMNAS_RECURSO}
        FROM Recurso r
        INNER JOIN Categoria_recurso c ON c.id_categoria = r.id_categoria
        WHERE r.activo = 1
        ORDER BY r.nombre
    `);
    return resultado.recordset;
}

/* Sugerencia de código para un recurso nuevo: REC-001, REC-002... */
async function siguienteCodigo() {
    const pool = await obtenerPool();
    const resultado = await pool.request().query(`
        SELECT codigo FROM Recurso WHERE codigo LIKE 'REC-%'
    `);
    const mayor = resultado.recordset.reduce((max, f) => {
        const n = parseInt(String(f.codigo).replace(/\D/g, ""), 10) || 0;
        return n > max ? n : max;
    }, 0);
    return "REC-" + String(mayor + 1).padStart(3, "0");
}

async function crear(datos) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("codigo", sql.VarChar(10), datos.codigo)
        .input("nombre", sql.VarChar(100), datos.nombre)
        .input("id_categoria", sql.Int, datos.id_categoria)
        .input("cantidad_total", sql.Int, datos.cantidad_total)
        .input("cantidad_disponible", sql.Int, datos.cantidad_total)
        .input("cantidad_minima", sql.Int, datos.cantidad_minima)
        .input("estado_fisico", sql.VarChar(20), datos.estado_fisico)
        .input("imagen", sql.VarChar(255), datos.imagen || null)
        .query(`
            INSERT INTO Recurso
                (codigo, nombre, id_categoria, cantidad_total, cantidad_disponible, cantidad_minima, estado_fisico, imagen, activo, fecha_creacion)
            OUTPUT INSERTED.id_recurso
            VALUES
                (@codigo, @nombre, @id_categoria, @cantidad_total, @cantidad_disponible, @cantidad_minima, @estado_fisico, @imagen, 1, GETDATE())
        `);
    return obtenerPorId(resultado.recordset[0].id_recurso);
}

/* Sube o cambia la imagen de un recurso que ya existe. */
async function actualizarImagen(id, rutaImagen) {
    const pool = await obtenerPool();
    await pool.request()
        .input("id_recurso", sql.Int, id)
        .input("imagen", sql.VarChar(255), rutaImagen)
        .query(`UPDATE Recurso SET imagen = @imagen WHERE id_recurso = @id_recurso`);
    return obtenerPorId(id);
}

/* Edita los datos del catálogo (no las cantidades: esas solo cambian
   con Entrada/Entrega/Devolución/Conteo). La imagen solo se cambia si
   llega una nueva; "quitarImagen" la deja vacía. */
async function actualizar(id, datos) {
    const pool = await obtenerPool();
    const request = pool.request()
        .input("id_recurso", sql.Int, id)
        .input("nombre", sql.VarChar(100), datos.nombre)
        .input("id_categoria", sql.Int, datos.id_categoria)
        .input("cantidad_minima", sql.Int, datos.cantidad_minima)
        .input("estado_fisico", sql.VarChar(20), datos.estado_fisico);

    let cambioImagen = "";
    if (datos.imagen) {
        request.input("imagen", sql.VarChar(255), datos.imagen);
        cambioImagen = ", imagen = @imagen";
    } else if (datos.quitarImagen) {
        cambioImagen = ", imagen = NULL";
    }

    await request.query(`
        UPDATE Recurso
        SET nombre = @nombre, id_categoria = @id_categoria,
            cantidad_minima = @cantidad_minima, estado_fisico = @estado_fisico${cambioImagen}
        WHERE id_recurso = @id_recurso
    `);
    return obtenerPorId(id);
}

async function eliminar(id) {
    const pool = await obtenerPool();
    await pool.request()
        .input("id_recurso", sql.Int, id)
        .query(`UPDATE Recurso SET activo = 0 WHERE id_recurso = @id_recurso`);
}

/* Ajusta cantidad_total y/o cantidad_disponible de forma atómica.
   Se usa desde movimientos.model.js al confirmar Entrada/Entrega/
   Devolución/Ajuste — por eso recibe la transacción como parámetro
   cuando se le pasa (si no, usa el pool normal). */
async function ajustarCantidades(id, { deltaTotal = 0, deltaDisponible = 0 }, transaccion = null) {
    const ejecutor = transaccion ? new sql.Request(transaccion) : (await obtenerPool()).request();
    const resultado = await ejecutor
        .input("id_recurso", sql.Int, id)
        .input("deltaTotal", sql.Int, deltaTotal)
        .input("deltaDisponible", sql.Int, deltaDisponible)
        .query(`
            UPDATE Recurso
            SET cantidad_total = cantidad_total + @deltaTotal,
                cantidad_disponible = cantidad_disponible + @deltaDisponible
            OUTPUT INSERTED.id_recurso, INSERTED.cantidad_total, INSERTED.cantidad_disponible
            WHERE id_recurso = @id_recurso
        `);
    return resultado.recordset[0];
}

async function fijarCantidadTotal(id, cantidadTotal, transaccion = null) {
    const ejecutor = transaccion ? new sql.Request(transaccion) : (await obtenerPool()).request();
    const resultado = await ejecutor
        .input("id_recurso", sql.Int, id)
        .input("cantidad_total", sql.Int, cantidadTotal)
        .query(`
            UPDATE Recurso
            SET cantidad_total = @cantidad_total,
                cantidad_disponible = CASE
                    WHEN cantidad_disponible > @cantidad_total THEN @cantidad_total
                    ELSE cantidad_disponible
                END
            OUTPUT INSERTED.id_recurso, INSERTED.cantidad_total, INSERTED.cantidad_disponible
            WHERE id_recurso = @id_recurso
        `);
    return resultado.recordset[0];
}

/* Lista simple de empleados activos, para el <select> de "Trabajador"
   en Entrega/Devolución. Se pone aquí (y no se depende de /api/empleados)
   para que el módulo de Inventario no necesite el acceso de Empleados. */
async function obtenerEmpleadosActivos() {
    const pool = await obtenerPool();
    const resultado = await pool.request().query(`
        SELECT codigo_empleado, nombre, apellido
        FROM Empleado
        WHERE activo = 1
        ORDER BY nombre, apellido
    `);
    return resultado.recordset;
}

module.exports = {
    obtenerCategorias,
    obtenerResumenPorCategoria,
    obtenerCategoriaPorId,
    crearCategoria,
    actualizarCategoria,
    actualizarImagenCategoria,
    eliminarCategoria,
    obtenerResumenGeneral,
    obtenerTodos,
    obtenerRecientes,
    obtenerPorId,
    obtenerParaSelect,
    siguienteCodigo,
    crear,
    actualizar,
    actualizarImagen,
    eliminar,
    ajustarCantidades,
    fijarCantidadTotal,
    obtenerEmpleadosActivos
};
