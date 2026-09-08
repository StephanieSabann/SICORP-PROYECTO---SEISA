const { sql, obtenerPool } = require("../config/database");

async function obtenerPorUsuario(usuario) {
    const pool = await obtenerPool();

    const resultado = await pool
        .request()
        .input("usuario", sql.VarChar(80), usuario)
        .query(`
            SELECT id_credencial, codigo_empleado, usuario
            FROM Credenciales
            WHERE usuario = @usuario
        `);

    return resultado.recordset[0];
}

async function obtenerPorCodigoEmpleado(codigoEmpleado) {
    const pool = await obtenerPool();

    const resultado = await pool
        .request()
        .input("codigo_empleado", sql.Int, codigoEmpleado)
        .query(`
            SELECT id_credencial, codigo_empleado, usuario
            FROM Credenciales
            WHERE codigo_empleado = @codigo_empleado
        `);

    return resultado.recordset[0];
}

async function crear(datos) {
    const pool = await obtenerPool();

    const resultadoCredencial = await pool
        .request()
        .input("codigo_empleado", sql.Int, datos.codigo_empleado)
        .input("Activo", sql.Bit, datos.Activo === undefined ? 1 : Number(datos.Activo))
        .input("usuario", sql.VarChar(80), datos.usuario)
        .input("contrasenia", sql.VarChar(255), datos.contrasenia)
        .query(`
            INSERT INTO Credenciales
            (
                codigo_empleado,
                Activo,
                usuario,
                contrasenia
            )
            OUTPUT INSERTED.id_credencial
            VALUES
            (
                @codigo_empleado,
                @Activo,
                @usuario,
                HASHBYTES('SHA2_512', @contrasenia)
            )
        `);

    const id_credencial = resultadoCredencial.recordset[0].id_credencial;

    await pool
        .request()
        .input("id_rol", sql.Int, datos.id_rol)
        .input("id_credencial", sql.Int, id_credencial)
        .query(`
            INSERT INTO Rol_credencial
            (
                id_rol,
                id_credencial
            )
            VALUES
            (
                @id_rol,
                @id_credencial
            )
        `);

    return {
        id_credencial,
        codigo_empleado: Number(datos.codigo_empleado),
        usuario: datos.usuario,
        Activo: Number(datos.Activo === undefined ? 1 : datos.Activo),
        id_rol: Number(datos.id_rol)
    };
}

module.exports = {
    obtenerPorUsuario,
    obtenerPorCodigoEmpleado,
    crear
};
