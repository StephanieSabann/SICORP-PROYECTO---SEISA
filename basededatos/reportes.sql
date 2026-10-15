-- SICORP-SEISA · Módulo de Reportes (copia manual; el servidor lo aplica solo al arrancar).
-- Es seguro correrlo varias veces.

IF OBJECT_ID('dbo.Reporte_parametro', 'U') IS NULL
CREATE TABLE dbo.Reporte_parametro (
    clave           VARCHAR(60)   NOT NULL PRIMARY KEY,
    valor           NVARCHAR(200) NOT NULL,
    actualizado_por INT           NULL,
    fecha           DATETIME2     NOT NULL DEFAULT SYSDATETIME()
)
GO

IF OBJECT_ID('dbo.Reporte_visibilidad', 'U') IS NULL
CREATE TABLE dbo.Reporte_visibilidad (
    clave           VARCHAR(60) NOT NULL PRIMARY KEY,
    activo          BIT         NOT NULL DEFAULT 1,
    actualizado_por INT         NULL,
    fecha           DATETIME2   NOT NULL DEFAULT SYSDATETIME()
)
GO

IF OBJECT_ID('dbo.Reporte_bitacora', 'U') IS NULL
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
)
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reporte_bitacora_fecha')
CREATE INDEX IX_Reporte_bitacora_fecha ON dbo.Reporte_bitacora (fecha DESC)
GO

IF OBJECT_ID('dbo.Reporte_programado', 'U') IS NULL
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
)
GO

IF OBJECT_ID('dbo.Recurso', 'U') IS NOT NULL AND COL_LENGTH('dbo.Recurso', 'costo_unitario') IS NULL
ALTER TABLE dbo.Recurso ADD costo_unitario DECIMAL(12,2) NULL
GO

IF OBJECT_ID('dbo.Catalogo_acceso', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.Catalogo_acceso WHERE nombre IN ('Reportes', 'Reporte'))
BEGIN
    INSERT INTO dbo.Catalogo_acceso (nombre) VALUES ('Reportes');
    DECLARE @id_acceso INT = SCOPE_IDENTITY();
    IF OBJECT_ID('dbo.Rol_acceso', 'U') IS NOT NULL AND OBJECT_ID('dbo.Rol', 'U') IS NOT NULL
        INSERT INTO dbo.Rol_acceso (id_rol, id_acceso)
        SELECT id_rol, @id_acceso FROM dbo.Rol WHERE nombre = 'Administrador';
END
GO
