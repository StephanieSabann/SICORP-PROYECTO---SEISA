const { sql, obtenerPool } = require("../basededatos/conexion");

async function obtenerTodosLosRoles() {
    const pool = await obtenerPool();
    const resultado = await pool.request().query(`
        SELECT id_rol, nombre, descripcion
        FROM Rol
        ORDER BY id_rol ASC
    `);
    return resultado.recordset;
}

async function obtenerRolPorId(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_rol", sql.Int, id)
        .query(`
            SELECT id_rol, nombre, descripcion
            FROM Rol
            WHERE id_rol = @id_rol
        `);
    return resultado.recordset[0];
}

async function obtenerAccesosPorRolId(idRol) {
    const pool = await obtenerPool();

    const resultado = await pool.request()
        .input("id_rol", sql.Int, idRol)
        .query(`
            SELECT DISTINCT
                c.id_acceso,
                c.nombre
            FROM Catalogo_acceso c
            INNER JOIN rol_acceso ra
                ON ra.id_acceso = c.id_acceso
            WHERE ra.id_rol = @id_rol
            ORDER BY c.nombre
        `);

    return resultado.recordset;
}

async function crearRol(datos) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("nombre", sql.VarChar(100), datos.nombre)
        .input("descripcion", sql.VarChar(sql.MAX), datos.descripcion)
        .query(`
            INSERT INTO Rol (nombre, descripcion)
            OUTPUT INSERTED.id_rol, INSERTED.nombre, INSERTED.descripcion
            VALUES (@nombre, @descripcion)
        `);
    return resultado.recordset[0];
}

async function actualizarRol(id, datos) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_rol", sql.Int, id)
        .input("nombre", sql.VarChar(100), datos.nombre)
        .input("descripcion", sql.VarChar(sql.MAX), datos.descripcion)
        .query(`
            UPDATE Rol
            SET nombre = @nombre, descripcion = @descripcion
            OUTPUT INSERTED.id_rol, INSERTED.nombre, INSERTED.descripcion
            WHERE id_rol = @id_rol
        `);
    return resultado.recordset[0];
}

async function eliminarRol(id) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_rol", sql.Int, id)
        .query(`
            DELETE FROM Rol
            OUTPUT DELETED.id_rol, DELETED.nombre, DELETED.descripcion
            WHERE id_rol = @id_rol
        `);
    return resultado.recordset[0];
}

async function establecerAccesosDeRol(idRol, idsAcceso) {
    const pool = await obtenerPool();

    /* Reemplaza TODA la lista de accesos del rol de una vez: borra lo
       que tenía y mete lo nuevo que se marcó en el checklist. Más
       simple y predecible que ir comparando qué se agregó o se quitó. */
    await pool.request()
        .input("id_rol", sql.Int, idRol)
        .query(`DELETE FROM rol_acceso WHERE id_rol = @id_rol`);

    for (const idAcceso of idsAcceso) {
        await pool.request()
            .input("id_rol", sql.Int, idRol)
            .input("id_acceso", sql.Int, idAcceso)
            .query(`INSERT INTO rol_acceso (id_rol, id_acceso) VALUES (@id_rol, @id_acceso)`);
    }

    return obtenerAccesosPorRolId(idRol);
}

module.exports = {
    obtenerTodosLosRoles,
    obtenerRolPorId,
    obtenerAccesosPorRolId,
    establecerAccesosDeRol,
    crearRol,
    actualizarRol,
    eliminarRol
};