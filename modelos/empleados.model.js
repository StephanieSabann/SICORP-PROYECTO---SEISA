const { sql, obtenerPool } = require("../basededatos/conexion");

/* ============================================================
   SELECT compartido
   ------------------------------------------------------------
   Antes cada consulta traía columnas distintas: obtenerTodos sí
   devolvía tipo_empleado y salario_base, pero obtenerPorCodigo
   no, y ninguna de las dos devolvía el puesto ni la unidad. Por
   eso en la pantalla el puesto y la unidad salían siempre
   vacíos. Ahora las dos usan exactamente estas columnas.

     - puesto : nombre del puesto (tabla Puesto) además del
                id_puesto, para poder mostrarlo sin otra consulta.
     - unidad : código de la unidad (cuadrilla) a la que está
                asignado el empleado, más su id_unidad.

   La unidad se saca con OUTER APPLY porque Unidad_empleado
   admite varios renglones por empleado: nos quedamos con la
   asignación más reciente (el id_unidad_empleado más alto).
   Se usa OUTER (no CROSS) para que el empleado salga en la
   lista aunque no tenga ninguna unidad asignada.
   ============================================================ */
const COLUMNAS = `
    e.codigo_empleado,
    e.id_puesto,
    p.nombre AS puesto,
    e.nombre,
    e.apellido,
    e.dpi,
    e.nit,
    e.direccion,
    e.telefono,
    e.email,
    e.fecha_contratacion,
    e.activo,
    e.fecha_nacimiento,
    e.tipo_empleado,
    e.salario_base,
    u.id_unidad,
    u.codigo AS unidad
`;

const ORIGEN = `
    FROM Empleado e
    LEFT JOIN Puesto p ON p.id_puesto = e.id_puesto
    OUTER APPLY (
        SELECT TOP 1 un.id_unidad, un.codigo
        FROM Unidad_empleado ue
        INNER JOIN Unidad un ON un.id_unidad = ue.id_unidad
        WHERE ue.id_empleado = e.codigo_empleado
        ORDER BY ue.id_unidad_empleado DESC
    ) u
`;

async function obtenerTodos() {
    const pool = await obtenerPool();

    const resultado = await pool.request().query(`
        SELECT ${COLUMNAS}
        ${ORIGEN}
        ORDER BY e.nombre, e.apellido, e.codigo_empleado
    `);

    return resultado.recordset;
}

async function obtenerPorCodigo(codigoEmpleado) {
    const pool = await obtenerPool();

    const resultado = await pool
        .request()
        .input("codigo_empleado", sql.Int, codigoEmpleado)
        .query(`
            SELECT ${COLUMNAS}
            ${ORIGEN}
            WHERE e.codigo_empleado = @codigo_empleado
        `);

    return resultado.recordset[0];
}

async function crear(datos) {
    const pool = await obtenerPool();

    const resultado = await pool
        .request()
        .input("id_puesto", sql.Int, datos.id_puesto)
        .input("nombre", sql.VarChar(50), datos.nombre)
        .input("apellido", sql.VarChar(50), datos.apellido)
        .input("dpi", sql.VarChar(13), datos.dpi)
        .input("nit", sql.Int, datos.nit)
        .input("direccion", sql.VarChar(100), datos.direccion)
        .input("telefono", sql.VarChar(20), datos.telefono)
        .input("email", sql.VarChar(60), datos.email)
        .input("fecha_contratacion", sql.Date, datos.fecha_contratacion)
        .input("activo", sql.Bit, datos.activo)
        .input("fecha_nacimiento", sql.Date, datos.fecha_nacimiento)
        .input("tipo_empleado", sql.VarChar(20), datos.tipo_empleado ?? null)
        .input("salario_base", sql.Decimal(12, 2), datos.salario_base ?? null)
        .query(`
            INSERT INTO Empleado
            (
                id_puesto,
                nombre,
                apellido,
                dpi,
                nit,
                direccion,
                telefono,
                email,
                fecha_contratacion,
                activo,
                fecha_nacimiento,
                tipo_empleado,
                salario_base
            )
            OUTPUT INSERTED.codigo_empleado
            VALUES
            (
                @id_puesto,
                @nombre,
                @apellido,
                @dpi,
                @nit,
                @direccion,
                @telefono,
                @email,
                @fecha_contratacion,
                @activo,
                @fecha_nacimiento,
                @tipo_empleado,
                @salario_base
            )
        `);

    const creado = resultado.recordset[0];

    return creado ? creado.codigo_empleado : undefined;
}

/* Campos que SÍ son columnas de la tabla Empleado. La unidad no
   está aquí a propósito: vive en Unidad_empleado y se guarda con
   asignarUnidad(). */
const DEFINICIONES = {
    id_puesto: sql.Int,
    nombre: sql.VarChar(50),
    apellido: sql.VarChar(50),
    dpi: sql.VarChar(13),
    nit: sql.Int,
    direccion: sql.VarChar(100),
    telefono: sql.VarChar(20),
    email: sql.VarChar(60),
    fecha_contratacion: sql.Date,
    activo: sql.Bit,
    fecha_nacimiento: sql.Date,
    tipo_empleado: sql.VarChar(20),
    salario_base: sql.Decimal(12, 2)
};

async function actualizar(codigoEmpleado, datos) {
    const campos = Object.keys(datos).filter(campo => DEFINICIONES[campo]);

    /* Puede venir solo la unidad para cambiar (que no es columna de
       Empleado). En ese caso no hay nada que actualizar aquí y se
       evita armar un "SET" vacío, que sería un error de SQL. */
    if (campos.length === 0) {
        return obtenerPorCodigo(codigoEmpleado);
    }

    const pool = await obtenerPool();
    const request = pool.request().input("codigo_empleado", sql.Int, codigoEmpleado);

    for (const campo of campos) {
        request.input(campo, DEFINICIONES[campo], datos[campo]);
    }

    const resultado = await request.query(`
        UPDATE Empleado
        SET ${campos.map(campo => `${campo} = @${campo}`).join(", ")}
        WHERE codigo_empleado = @codigo_empleado;

        SELECT @@ROWCOUNT AS filas;
    `);

    const filas = resultado.recordset && resultado.recordset[0]
        ? resultado.recordset[0].filas
        : 0;

    if (!filas) {
        return undefined;
    }

    return obtenerPorCodigo(codigoEmpleado);
}

/* ============================================================
   Unidad (cuadrilla) del empleado
   ------------------------------------------------------------
   Un empleado pertenece a una sola unidad a la vez, así que al
   reasignarlo se borran sus renglones anteriores de
   Unidad_empleado y se inserta el nuevo. Si idUnidad viene null
   (por ejemplo un administrativo, que no lleva unidad) solo se
   le quita la que tenía.
   ============================================================ */
async function asignarUnidad(codigoEmpleado, idUnidad) {
    const pool = await obtenerPool();

    await pool
        .request()
        .input("id_empleado", sql.Int, codigoEmpleado)
        .query(`DELETE FROM Unidad_empleado WHERE id_empleado = @id_empleado`);

    if (idUnidad === null || idUnidad === undefined) {
        return;
    }

    await pool
        .request()
        .input("id_unidad", sql.Int, idUnidad)
        .input("id_empleado", sql.Int, codigoEmpleado)
        .query(`
            INSERT INTO Unidad_empleado (id_unidad, id_empleado)
            VALUES (@id_unidad, @id_empleado)
        `);
}

/* ============================================================
   Buscar una unidad por su código, y crearla si no existe
   ------------------------------------------------------------
   El campo Unidad del formulario es una caja de texto con
   sugerencias: se puede escoger una de las que ya existen o
   escribir una nueva. Si se escribe una que no está, se crea
   aquí mismo para no obligar a salir a Mantenimiento.

   La búsqueda NO distingue mayúsculas ni espacios de sobra
   (ya viene recortado y en mayúsculas desde el controlador),
   así que escribir "s1" se conecta con la unidad "S1" que ya
   existe en vez de crear una repetida.
   ============================================================ */
async function resolverUnidadPorCodigo(codigo) {
    const pool = await obtenerPool();

    const existente = await pool
        .request()
        .input("codigo", sql.VarChar(10), codigo)
        .query(`
            SELECT TOP 1 id_unidad
            FROM Unidad
            WHERE codigo = @codigo
            ORDER BY es_activa DESC, id_unidad ASC
        `);

    if (existente.recordset[0]) {
        return existente.recordset[0].id_unidad;
    }

    const creada = await pool
        .request()
        .input("codigo", sql.VarChar(10), codigo)
        .query(`
            INSERT INTO Unidad (codigo, fecha_creacion, es_activa)
            OUTPUT INSERTED.id_unidad
            VALUES (@codigo, GETDATE(), 1)
        `);

    return creada.recordset[0].id_unidad;
}

/* ============================================================
   Historial
   ------------------------------------------------------------
   registrarHistorial recibe una lista de movimientos y los
   inserta todos en una sola consulta (un INSERT con varios
   VALUES) para no hacer un viaje a la base por cada campo.
   ============================================================ */
async function registrarHistorial(movimientos) {
    if (!Array.isArray(movimientos) || movimientos.length === 0) {
        return;
    }

    const pool = await obtenerPool();
    const request = pool.request();
    const renglones = [];

    movimientos.forEach((movimiento, i) => {
        request.input(`emp${i}`, sql.Int, movimiento.codigo_empleado);
        request.input(`acc${i}`, sql.VarChar(20), movimiento.accion);
        request.input(`cam${i}`, sql.NVarChar(60), movimiento.campo ?? null);
        request.input(`ant${i}`, sql.NVarChar(400), movimiento.valor_anterior ?? null);
        request.input(`nue${i}`, sql.NVarChar(400), movimiento.valor_nuevo ?? null);
        request.input(`cre${i}`, sql.Int, movimiento.id_credencial ?? null);
        request.input(`usu${i}`, sql.NVarChar(100), movimiento.usuario ?? null);

        renglones.push(`(@emp${i}, @acc${i}, @cam${i}, @ant${i}, @nue${i}, @cre${i}, @usu${i})`);
    });

    await request.query(`
        INSERT INTO Empleado_historial
            (codigo_empleado, accion, campo, valor_anterior, valor_nuevo, id_credencial, usuario)
        VALUES ${renglones.join(", ")}
    `);
}

async function obtenerHistorial(codigoEmpleado, limite = 200) {
    const pool = await obtenerPool();

    const resultado = await pool
        .request()
        .input("codigo_empleado", sql.Int, codigoEmpleado)
        .input("limite", sql.Int, limite)
        .query(`
            SELECT TOP (@limite)
                id_historial,
                codigo_empleado,
                accion,
                campo,
                valor_anterior,
                valor_nuevo,
                id_credencial,
                usuario,
                fecha
            FROM Empleado_historial
            WHERE codigo_empleado = @codigo_empleado
            ORDER BY fecha DESC, id_historial DESC
        `);

    return resultado.recordset;
}

module.exports = {
    obtenerTodos,
    obtenerPorCodigo,
    crear,
    actualizar,
    asignarUnidad,
    resolverUnidadPorCodigo,
    registrarHistorial,
    obtenerHistorial
};
