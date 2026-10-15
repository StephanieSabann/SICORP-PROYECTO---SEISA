const { sql, obtenerPool } = require("../basededatos/conexion");

/* TABLA NUEVA — todavía no existe en tu base de datos. Antes de que
   esto funcione hay que correr esto en SQL Server:

   CREATE TABLE LimitePermiso (
       id_limite      INT IDENTITY(1,1) PRIMARY KEY,
       id_empleado    INT NOT NULL,
       anio           INT NOT NULL,
       dias_asignados INT NOT NULL DEFAULT 15,
       CONSTRAINT FK_LimitePermiso_Empleado FOREIGN KEY (id_empleado)
           REFERENCES Empleado(codigo_empleado),
       CONSTRAINT UQ_LimitePermiso_EmpAnio UNIQUE (id_empleado, anio)
   );

   Mientras esa tabla no exista, obtenerPorEmpleadoYAnio() de abajo
   captura el error y devuelve el límite por default (15 días) en vez
   de tronar — así el módulo de permisos sigue funcionando (usando el
   límite parejo para todos) hasta que la crees. En cuanto exista la
   tabla, cada empleado puede tener su propio límite. */

const DIAS_POR_DEFAULT = 15;

async function obtenerPorEmpleadoYAnio(idEmpleado, anio) {
    const pool = await obtenerPool();
    try {
        const resultado = await pool.request()
            .input("id_empleado", sql.Int, idEmpleado)
            .input("anio", sql.Int, anio)
            .query(`
                SELECT id_limite, id_empleado, anio, dias_asignados
                FROM LimitePermiso
                WHERE id_empleado = @id_empleado AND anio = @anio
            `);
        if (resultado.recordset[0]) return resultado.recordset[0];
    } catch (error) {
        console.warn('LimitePermiso: la tabla todavía no existe, se usa el límite por default.', error.message);
    }
    return { id_limite: null, id_empleado: idEmpleado, anio, dias_asignados: DIAS_POR_DEFAULT };
}

async function establecer(idEmpleado, anio, diasAsignados) {
    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input("id_empleado", sql.Int, idEmpleado)
        .input("anio", sql.Int, anio)
        .input("dias_asignados", sql.Int, diasAsignados)
        .query(`
            MERGE LimitePermiso AS destino
            USING (SELECT @id_empleado AS id_empleado, @anio AS anio) AS origen
                ON destino.id_empleado = origen.id_empleado AND destino.anio = origen.anio
            WHEN MATCHED THEN
                UPDATE SET dias_asignados = @dias_asignados
            WHEN NOT MATCHED THEN
                INSERT (id_empleado, anio, dias_asignados)
                VALUES (@id_empleado, @anio, @dias_asignados)
            OUTPUT INSERTED.id_limite, INSERTED.id_empleado, INSERTED.anio, INSERTED.dias_asignados;
        `);
    return resultado.recordset[0];
}

module.exports = { obtenerPorEmpleadoYAnio, establecer, DIAS_POR_DEFAULT };
