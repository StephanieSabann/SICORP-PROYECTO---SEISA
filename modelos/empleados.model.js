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
            nit,
            direccion,
            telefono,
            email,
            fecha_contratacion,
            activo,
            fecha_nacimiento
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
                nit,
                direccion,
                telefono,
                email,
                fecha_contratacion,
                activo,
                fecha_nacimiento
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
                fecha_nacimiento
            )
            OUTPUT
                INSERTED.codigo_empleado,
                INSERTED.id_puesto,
                INSERTED.nombre,
                INSERTED.apellido,
                INSERTED.dpi,
                INSERTED.nit,
                INSERTED.direccion,
                INSERTED.telefono,
                INSERTED.email,
                INSERTED.fecha_contratacion,
                INSERTED.activo,
                INSERTED.fecha_nacimiento
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
                @fecha_nacimiento
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
        nombre: [sql.VarChar(50), datos.nombre],
        apellido: [sql.VarChar(50), datos.apellido],
        dpi: [sql.VarChar(13), datos.dpi],
        nit: [sql.Int, datos.nit],
        direccion: [sql.VarChar(100), datos.direccion],
        telefono: [sql.VarChar(20), datos.telefono],
        email: [sql.VarChar(60), datos.email],
        fecha_contratacion: [sql.Date, datos.fecha_contratacion],
        activo: [sql.Bit, datos.activo],
        fecha_nacimiento: [sql.Date, datos.fecha_nacimiento],
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
            INSERTED.nit,
            INSERTED.direccion,
            INSERTED.telefono,
            INSERTED.email,
            INSERTED.fecha_contratacion,
            INSERTED.activo,
            INSERTED.fecha_nacimiento
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