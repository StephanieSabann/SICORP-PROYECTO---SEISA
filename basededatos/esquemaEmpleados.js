const { obtenerPool } = require("./conexion");

/* ============================================================
   Esquema del módulo de EMPLEADOS
   ------------------------------------------------------------
   Igual que Inventario, Nóminas y Reportes: se aplica solo al
   arrancar el servidor y cada paso revisa si ya existe, así que
   se puede correr las veces que sea sin duplicar nada. No toca
   ni borra datos que ya estén guardados.
   Copia para correr a mano: basededatos/empleados.sql

   Crea (si faltan):
     - Empleado_historial  (quién cambió qué dato y cuándo)
     - Índice por empleado y fecha para que el expediente cargue
       el historial rápido aunque haya muchos movimientos.
   ============================================================ */

const PASOS = [
    `IF OBJECT_ID('dbo.Empleado_historial', 'U') IS NULL
     CREATE TABLE dbo.Empleado_historial (
         id_historial    INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
         codigo_empleado INT           NOT NULL,
         accion          VARCHAR(20)   NOT NULL,
         campo           NVARCHAR(60)  NULL,
         valor_anterior  NVARCHAR(400) NULL,
         valor_nuevo     NVARCHAR(400) NULL,
         id_credencial   INT           NULL,
         usuario         NVARCHAR(100) NULL,
         fecha           DATETIME2     NOT NULL DEFAULT SYSDATETIME()
     )`,

    `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Empleado_historial_empleado')
     CREATE INDEX IX_Empleado_historial_empleado
         ON dbo.Empleado_historial (codigo_empleado, fecha DESC)`,

    /* La llave foránea va aparte y al final: si por algún dato viejo
       no se pudiera crear, el historial igual queda funcionando. */
    `IF OBJECT_ID('dbo.Empleado', 'U') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Empleado_historial_Empleado')
     ALTER TABLE dbo.Empleado_historial
         ADD CONSTRAINT FK_Empleado_historial_Empleado
         FOREIGN KEY (codigo_empleado) REFERENCES dbo.Empleado (codigo_empleado)`
];

let promesa;

function prepararEsquemaEmpleados() {
    if (!promesa) {
        promesa = (async () => {
            const pool = await obtenerPool();
            let fallaron = 0;

            for (const paso of PASOS) {
                try {
                    await pool.request().query(paso);
                } catch (error) {
                    fallaron++;
                    console.error("[Empleados] No se pudo aplicar un paso del esquema:\n", paso.split("\n")[0], "\n→", error.message);
                }
            }

            /* Antes aquí se decía "listas" aunque hubieran fallado todos
               los pasos, y eso escondía el problema real (por ejemplo que
               el usuario de SQL no tenga permiso de CREATE TABLE). Ahora
               el mensaje dice la verdad. */
            if (fallaron === 0) {
                console.log("[Empleados] Tablas de empleados listas.");
            } else {
                console.error(`[Empleados] ATENCIÓN: ${fallaron} de ${PASOS.length} pasos del esquema fallaron. ` +
                    `El historial de empleados puede no funcionar. Corre a mano basededatos/empleados.sql en la base Seisa.`);
            }
        })().catch(error => {
            promesa = undefined;
            console.error("[Empleados] No se pudo preparar el esquema:", error.message);
            throw error;
        });
    }

    return promesa;
}

async function esquemaEmpleadosListo(req, res, next) {
    try {
        await prepararEsquemaEmpleados();
        next();
    } catch (error) {
        res.status(500).json({ exito: false, mensaje: "No se pudieron preparar las tablas de empleados: " + error.message });
    }
}

module.exports = { prepararEsquemaEmpleados, esquemaEmpleadosListo, PASOS };
