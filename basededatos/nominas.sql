/* ============================================================
   SICORP — SEISA · Tablas del módulo de NÓMINAS
   No es obligatorio correrlo: server.js lo aplica solo al arrancar.
   Se puede correr varias veces sin duplicar nada.
   ============================================================ */
USE Seisa;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.Nomina_proceso', 'U') IS NULL
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
 );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Nomina_tipo_empleado_periodo')
 CREATE UNIQUE INDEX UX_Nomina_tipo_empleado_periodo
     ON dbo.Nomina_proceso (tipo, codigo_empleado, periodo)
     WHERE codigo_empleado IS NOT NULL AND estado <> 'CANCELADA';
GO

IF OBJECT_ID('dbo.Nomina_comprobante', 'U') IS NULL
 CREATE TABLE dbo.Nomina_comprobante (
     numero_recibo    INT IDENTITY(1000,1) NOT NULL PRIMARY KEY,
     id_nomina        INT       NOT NULL UNIQUE REFERENCES dbo.Nomina_proceso(id_nomina),
     total_centavos   BIGINT    NOT NULL,
     fecha_generacion DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
     generado_por     INT       NULL
 );
GO

IF OBJECT_ID('dbo.Nomina_archivo', 'U') IS NULL
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
 );
GO

IF OBJECT_ID('dbo.Nomina_historial', 'U') IS NULL
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
 );
GO

IF OBJECT_ID('dbo.Nomina_actividad_precio', 'U') IS NULL
 CREATE TABLE dbo.Nomina_actividad_precio (
     id_precio         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
     tipo              VARCHAR(20)   NOT NULL,
     actividad         NVARCHAR(150) NOT NULL,
     precio_produccion BIGINT        NULL,
     precio_bono       BIGINT        NULL,
     actualizado_por   INT           NULL,
     fecha             DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
     CONSTRAINT UQ_Nomina_actividad UNIQUE (tipo, actividad)
 );
GO

IF OBJECT_ID('dbo.Nomina_perfil_pago', 'U') IS NULL
 CREATE TABLE dbo.Nomina_perfil_pago (
     codigo_empleado INT           NOT NULL PRIMARY KEY,
     salario_base    BIGINT        NULL,
     bonificacion    BIGINT        NULL,
     forma_pago      NVARCHAR(40)  NULL,
     banco           NVARCHAR(60)  NULL,
     cuenta          NVARCHAR(30)  NULL,
     actualizado_por INT           NULL,
     fecha           DATETIME2     NOT NULL DEFAULT SYSDATETIME()
 );
GO

IF OBJECT_ID('dbo.Catalogo_acceso', 'U') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM dbo.Catalogo_acceso WHERE nombre IN ('Nóminas', 'Nominas', 'Nómina', 'Nomina'))
 BEGIN
     INSERT INTO dbo.Catalogo_acceso (nombre) VALUES ('Nóminas');
     DECLARE @id_acceso INT = SCOPE_IDENTITY();
     IF OBJECT_ID('dbo.Rol_acceso', 'U') IS NOT NULL AND OBJECT_ID('dbo.Rol', 'U') IS NOT NULL
         INSERT INTO dbo.Rol_acceso (id_rol, id_acceso)
         SELECT id_rol, @id_acceso FROM dbo.Rol WHERE nombre = 'Administrador';
 END;
GO


-- Tipo de empleado (Técnico socio / no socio / Auxiliar / Administrativo) y sueldo base
IF COL_LENGTH('dbo.Empleado', 'tipo_empleado') IS NULL
    ALTER TABLE dbo.Empleado ADD tipo_empleado VARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.Empleado', 'salario_base') IS NULL
    ALTER TABLE dbo.Empleado ADD salario_base DECIMAL(12,2) NULL;
GO
UPDATE dbo.Empleado SET tipo_empleado = CASE id_puesto WHEN 1 THEN 'ADMINISTRATIVO' WHEN 3 THEN 'AUXILIAR' END
WHERE tipo_empleado IS NULL AND id_puesto IN (1, 3);
GO
