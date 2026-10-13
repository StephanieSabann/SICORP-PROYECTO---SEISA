const { obtenerPool } = require("./conexion");

/* ============================================================
   Esquema del módulo de NÓMINAS
   ------------------------------------------------------------
   Igual que el de Inventario: se aplica solo al arrancar el
   servidor y cada paso revisa si ya existe (se puede correr las
   veces que sea sin duplicar nada). No toca las tablas viejas
   Planilla / DetallePlanilla / Descuento de la base original.
   Copia para correr a mano: basededatos/nominas.sql
   ============================================================ */

const PASOS = [
    // Proceso de nómina (borrador → aprobada). "datos" guarda el borrador
    // completo (importación, validación, ajustes, descuentos) en JSON y
    // "snapshot" la fotografía inmutable que se aprueba.
    `IF OBJECT_ID('dbo.Nomina_proceso', 'U') IS NULL
     CREATE TABLE dbo.Nomina_proceso (
         id_nomina           INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
         tipo                VARCHAR(20)   NOT NULL,
         periodo             CHAR(7)       NOT NULL,
         codigo_empleado     INT           NULL,
         empleado_nombre     NVARCHAR(150) NULL,
         estado              VARCHAR(25)   NOT NULL DEFAULT 'EN_PREPARACION',
         paso_actual         INT           NOT NULL DEFAULT 1,
         paso_completado     INT           NOT NULL DEFAULT 0,
         datos               NVARCHAR(MAX) NULL,
         version             INT           NOT NULL DEFAULT 1,
         creado_por          INT           NULL,
         fecha_creacion      DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
         actualizado_por     INT           NULL,
         fecha_actualizacion DATETIME2     NULL,
         aprobado_por        INT           NULL,
         fecha_aprobacion    DATETIME2     NULL,
         numero_recibo       INT           NULL,
         total_centavos      BIGINT        NULL,
         snapshot            NVARCHAR(MAX) NULL
     )`,
    // Un solo registro activo por tipo + empleado + período (evita duplicados)
    `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Nomina_tipo_empleado_periodo')
     CREATE UNIQUE INDEX UX_Nomina_tipo_empleado_periodo
         ON dbo.Nomina_proceso (tipo, codigo_empleado, periodo)
         WHERE codigo_empleado IS NOT NULL AND estado <> 'CANCELADA'`,

    `IF OBJECT_ID('dbo.Nomina_comprobante', 'U') IS NULL
     CREATE TABLE dbo.Nomina_comprobante (
         numero_recibo    INT IDENTITY(1000,1) NOT NULL PRIMARY KEY,
         id_nomina        INT       NOT NULL UNIQUE REFERENCES dbo.Nomina_proceso(id_nomina),
         total_centavos   BIGINT    NOT NULL,
         fecha_generacion DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
         generado_por     INT       NULL
     )`,

    `IF OBJECT_ID('dbo.Nomina_archivo', 'U') IS NULL
     CREATE TABLE dbo.Nomina_archivo (
         id_archivo      INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
         id_nomina       INT           NOT NULL REFERENCES dbo.Nomina_proceso(id_nomina),
         nombre_original NVARCHAR(200) NOT NULL,
         nombre_guardado NVARCHAR(200) NOT NULL,
         tamano          INT           NOT NULL,
         registros       INT           NOT NULL,
         subido_por      INT           NULL,
         fecha_subida    DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
         eliminado       BIT           NOT NULL DEFAULT 0
     )`,

    `IF OBJECT_ID('dbo.Nomina_historial', 'U') IS NULL
     CREATE TABLE dbo.Nomina_historial (
         id_historial   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
         id_nomina      INT           NOT NULL REFERENCES dbo.Nomina_proceso(id_nomina),
         accion         NVARCHAR(60)  NOT NULL,
         campo          NVARCHAR(150) NULL,
         valor_anterior NVARCHAR(400) NULL,
         valor_nuevo    NVARCHAR(400) NULL,
         id_credencial  INT           NULL,
         usuario        NVARCHAR(100) NULL,
         fecha          DATETIME2     NOT NULL DEFAULT SYSDATETIME()
     )`,

    // Precios de actividades nuevas (las oficiales están en configuracion/nominas.config.js)
    `IF OBJECT_ID('dbo.Nomina_actividad_precio', 'U') IS NULL
     CREATE TABLE dbo.Nomina_actividad_precio (
         id_precio         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
         tipo              VARCHAR(20)   NOT NULL,
         actividad         NVARCHAR(150) NOT NULL,
         precio_produccion BIGINT        NULL,
         precio_bono       BIGINT        NULL,
         actualizado_por   INT           NULL,
         fecha             DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
         CONSTRAINT UQ_Nomina_actividad UNIQUE (tipo, actividad)
     )`,

    // Datos de pago habituales del empleado (salario, bonificación, banco)
    `IF OBJECT_ID('dbo.Nomina_perfil_pago', 'U') IS NULL
     CREATE TABLE dbo.Nomina_perfil_pago (
         codigo_empleado INT           NOT NULL PRIMARY KEY,
         salario_base    BIGINT        NULL,
         bonificacion    BIGINT        NULL,
         forma_pago      NVARCHAR(40)  NULL,
         banco           NVARCHAR(60)  NULL,
         cuenta          NVARCHAR(30)  NULL,
         actualizado_por INT           NULL,
         fecha           DATETIME2     NOT NULL DEFAULT SYSDATETIME()
     )`,

    // Tipo de empleado (Técnico socio / no socio / Auxiliar / Administrativo)
    // y sueldo base del formulario de Empleados. Los técnicos que ya existían
    // quedan "sin clasificar" hasta que se les escoja socio o no socio.
    `IF COL_LENGTH('dbo.Empleado', 'tipo_empleado') IS NULL
     ALTER TABLE dbo.Empleado ADD tipo_empleado VARCHAR(20) NULL`,
    `IF COL_LENGTH('dbo.Empleado', 'salario_base') IS NULL
     ALTER TABLE dbo.Empleado ADD salario_base DECIMAL(12,2) NULL`,
    `UPDATE dbo.Empleado SET tipo_empleado = CASE id_puesto WHEN 1 THEN 'ADMINISTRATIVO' WHEN 3 THEN 'AUXILIAR' END
     WHERE tipo_empleado IS NULL AND id_puesto IN (1, 3)`,

    // Acceso "Nóminas" en el catálogo; si se crea por primera vez se le
    // asigna al rol Administrador para que el módulo no quede bloqueado.
    `IF OBJECT_ID('dbo.Catalogo_acceso', 'U') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM dbo.Catalogo_acceso WHERE nombre IN ('Nóminas', 'Nominas', 'Nómina', 'Nomina'))
     BEGIN
         INSERT INTO dbo.Catalogo_acceso (nombre) VALUES ('Nóminas');
         DECLARE @id_acceso INT = SCOPE_IDENTITY();
         IF OBJECT_ID('dbo.Rol_acceso', 'U') IS NOT NULL AND OBJECT_ID('dbo.Rol', 'U') IS NOT NULL
             INSERT INTO dbo.Rol_acceso (id_rol, id_acceso)
             SELECT id_rol, @id_acceso FROM dbo.Rol WHERE nombre = 'Administrador';
     END`
];

let promesa;

function prepararEsquemaNominas() {
    if (!promesa) {
        promesa = (async () => {
            const pool = await obtenerPool();
            for (const paso of PASOS) {
                try {
                    await pool.request().query(paso);
                } catch (error) {
                    console.error("[Nóminas] No se pudo aplicar un paso del esquema:\n", paso.split("\n")[0], "\n→", error.message);
                }
            }
            console.log("[Nóminas] Tablas de nóminas listas.");
        })().catch(error => {
            promesa = undefined;
            console.error("[Nóminas] No se pudo preparar el esquema:", error.message);
            throw error;
        });
    }
    return promesa;
}

async function esquemaNominasListo(req, res, next) {
    try {
        await prepararEsquemaNominas();
        next();
    } catch (error) {
        res.status(500).json({ exito: false, mensaje: "No se pudieron preparar las tablas de nóminas: " + error.message });
    }
}

module.exports = { prepararEsquemaNominas, esquemaNominasListo, PASOS };
