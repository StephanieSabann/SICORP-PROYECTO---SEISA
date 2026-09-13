const { sql, obtenerPool } = require("../basededatos/conexion");

async function obtenerTodos() {
    const pool = await obtenerPool();

    const resultado = await pool.request().query(`
        SELECT
            codigo_empleado,
            id_puesto,
            nombre,
            apellido,
            dpi,
            direccion,
            telefono,
            email,
            fecha_contratacion,
            activo
        FROM Empleado
        ORDER BY nombre, apellido, codigo_empleado
    `);

    return resultado.recordset;
}

async function obtenerPorCodigo(codigoEmpleado) {
    const pool = await obtenerPool();

    const resultado = await pool
        .request()
        .input("codigo_empleado", sql.Int, codigoEmpleado)
        .query(`
            SELECT
                codigo_empleado,
                id_puesto,
                nombre,
                apellido,
                dpi,
                direccion,
                telefono,
                email,
                fecha_contratacion,
                activo
            FROM Empleado
            WHERE codigo_empleado = @codigo_empleado
        `);

    return resultado.recordset[0];
}

async function crear(datos) {
    const pool = await obtenerPool();

    const resultado = await pool
        .request()
        .input("id_puesto", sql.Int, datos.id_puesto)
        .input("nombre", sql.VarChar(16), datos.nombre)
        .input("apellido", sql.VarChar(16), datos.apellido)
        .input("dpi", sql.VarChar(13), datos.dpi)
        .input("direccion", sql.VarChar(24), datos.direccion)
        .input("telefono", sql.VarChar(16), datos.telefono)
        .input("email", sql.VarChar(32), datos.email)
        .input("fecha_contratacion", sql.Date, datos.fecha_contratacion)
        .input("activo", sql.Bit, datos.activo)
        .query(`
            INSERT INTO Empleado
            (
                id_puesto,
                nombre,
                apellido,
                dpi,
                direccion,
                telefono,
                email,
                fecha_contratacion,
                activo
            )
            OUTPUT
                INSERTED.codigo_empleado,
                INSERTED.id_puesto,
                INSERTED.nombre,
                INSERTED.apellido,
                INSERTED.dpi,
                INSERTED.direccion,
                INSERTED.telefono,
                INSERTED.email,
                INSERTED.fecha_contratacion,
                INSERTED.activo
            VALUES
            (
                @id_puesto,
                @nombre,
                @apellido,
                @dpi,
                @direccion,
                @telefono,
                @email,
                @fecha_contratacion,
                @activo
            )
        `);

    return resultado.recordset[0];
}

async function actualizar(codigoEmpleado, datos) {
    const pool = await obtenerPool();
    const request = pool
        .request()
        .input("codigo_empleado", sql.Int, codigoEmpleado);

    const definiciones = {
        id_puesto: [sql.Int, datos.id_puesto],
        nombre: [sql.VarChar(16), datos.nombre],
        apellido: [sql.VarChar(16), datos.apellido],
        dpi: [sql.VarChar(13), datos.dpi],
        direccion: [sql.VarChar(24), datos.direccion],
        telefono: [sql.VarChar(16), datos.telefono],
        email: [sql.VarChar(32), datos.email],
        fecha_contratacion: [sql.Date, datos.fecha_contratacion],
        activo: [sql.Bit, datos.activo]
    };

    const campos = Object.keys(datos).map(campo => {
        const [tipo, valor] = definiciones[campo];
        request.input(campo, tipo, valor);
        return `${campo} = @${campo}`;
    });

    const resultado = await request.query(`
        UPDATE Empleado
        SET ${campos.join(", ")}
        OUTPUT
            INSERTED.codigo_empleado,
            INSERTED.id_puesto,
            INSERTED.nombre,
            INSERTED.apellido,
            INSERTED.dpi,
            INSERTED.direccion,
            INSERTED.telefono,
            INSERTED.email,
            INSERTED.fecha_contratacion,
            INSERTED.activo
        WHERE codigo_empleado = @codigo_empleado
    `);

    return resultado.recordset[0];
}

module.exports = {
    obtenerTodos,
    obtenerPorCodigo,
    crear,
    actualizar
};