const { obtenerPool } = require("./conexion");

/* ============================================================
   Esquema del módulo de REPORTES
   ------------------------------------------------------------
   Igual que Inventario y Nóminas: se aplica solo al arrancar el
   servidor y cada paso revisa si ya existe (se puede correr las
   veces que sea sin duplicar nada). No modifica datos existentes.
   Copia para correr a mano: basededatos/reportes.sql

   Crea (si faltan):
     - Reporte_parametro   (umbrales y opciones editables)
     - Reporte_visibilidad (qué reportes se muestran u ocultan)
     - Reporte_bitacora    (quién exportó qué y cuándo)
     - Reporte_programado  (envíos automáticos por correo)
     - Recurso.costo_unitario (para "Inversión documentada")
     - Acceso "Reportes" en el catálogo (asignado a Administrador
       solo la primera vez que se crea)
   ============================================================ */

const PASOS = [
    `IF OBJECT_ID('dbo.Reporte_parametro', 'U') IS NULL
     CREATE TABLE dbo.Reporte_parametro (
         clave           VARCHAR(60)   NOT NULL PRIMARY KEY,
         valor           NVARCHAR(200) NOT NULL,
         actualizado_por INT           NULL,
         fecha           DATETIME2     NOT NULL DEFAULT SYSDATETIME()
     )`,

    `IF OBJECT_ID('dbo.Reporte_visibilidad', 'U') IS NULL
     CREATE TABLE dbo.Reporte_visibilidad (
         clave           VARCHAR(60) NOT NULL PRIMARY KEY,
         activo          BIT         NOT NULL DEFAULT 1,
         actualizado_por INT         NULL,
         fecha           DATETIME2   NOT NULL DEFAULT SYSDATETIME()
     )`,

    `IF OBJECT_ID('dbo.Reporte_bitacora', 'U') IS NULL
     CREATE TABLE dbo.Reporte_bitacora (
         id_bitacora   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
         accion        VARCHAR(20)   NOT NULL,
         reporte       VARCHAR(60)   NOT NULL,
         formato       VARCHAR(10)   NULL,
         periodo       CHAR(7)       NULL,
         filtros       NVARCHAR(400) NULL,
         filas         INT           NULL,
         id_credencial INT           NULL,
         usuario       NVARCHAR(100) NULL,
         duracion_ms   INT           NULL,
         fecha         DATETIME2     NOT NULL DEFAULT SYSDATETIME()
     )`,
    `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reporte_bitacora_fecha')
     CREATE INDEX IX_Reporte_bitacora_fecha ON dbo.Reporte_bitacora (fecha DESC)`,

    `IF OBJECT_ID('dbo.Reporte_programado', 'U') IS NULL
     CREATE TABLE dbo.Reporte_programado (
         id_programado    INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
         nombre           NVARCHAR(100) NOT NULL,
         reporte          VARCHAR(60)   NOT NULL,
         formato          VARCHAR(10)   NOT NULL DEFAULT 'xlsx',
         frecuencia       VARCHAR(10)   NOT NULL,
         dia              INT           NULL,
         hora             CHAR(5)       NOT NULL DEFAULT '07:00',
         destinatarios    NVARCHAR(400) NOT NULL,
         activo           BIT           NOT NULL DEFAULT 1,
         ultima_ejecucion DATETIME2     NULL,
         ultimo_estado    NVARCHAR(250) NULL,
         creado_por       INT           NULL,
         fecha_creacion   DATETIME2     NOT NULL DEFAULT SYSDATETIME()
     )`,

    // Costo por unidad de cada recurso (opcional). Alimenta "Inversión documentada".
    `IF OBJECT_ID('dbo.Recurso', 'U') IS NOT NULL AND COL_LENGTH('dbo.Recurso', 'costo_unitario') IS NULL
     ALTER TABLE dbo.Recurso ADD costo_unitario DECIMAL(12,2) NULL`,

    // Acceso "Reportes": si se crea por primera vez, se le da al rol Administrador.
    `IF OBJECT_ID('dbo.Catalogo_acceso', 'U') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM dbo.Catalogo_acceso WHERE nombre IN ('Reportes', 'Reporte'))
     BEGIN
         INSERT INTO dbo.Catalogo_acceso (nombre) VALUES ('Reportes');
         DECLARE @id_acceso INT = SCOPE_IDENTITY();
         IF OBJECT_ID('dbo.Rol_acceso', 'U') IS NOT NULL AND OBJECT_ID('dbo.Rol', 'U') IS NOT NULL
             INSERT INTO dbo.Rol_acceso (id_rol, id_acceso)
             SELECT id_rol, @id_acceso FROM dbo.Rol WHERE nombre = 'Administrador';
     END`
];

let promesa;

function prepararEsquemaReportes() {
    if (!promesa) {
        promesa = (async () => {
            const pool = await obtenerPool();
            for (const paso of PASOS) {
                try {
                    await pool.request().query(paso);
                } catch (error) {
                    console.error("[Reportes] No se pudo aplicar un paso del esquema:\n", paso.split("\n")[0], "\n→", error.message);
                }
            }
            console.log("[Reportes] Tablas de reportes listas.");
        })().catch(error => {
            promesa = undefined;
            console.error("[Reportes] No se pudo preparar el esquema:", error.message);
            throw error;
        });
    }
    return promesa;
}

async function esquemaReportesListo(req, res, next) {
    try {
        await prepararEsquemaReportes();
        next();
    } catch (error) {
        res.status(500).json({ exito: false, mensaje: "No se pudieron preparar las tablas de reportes: " + error.message });
    }
}

module.exports = { prepararEsquemaReportes, esquemaReportesListo, PASOS };
