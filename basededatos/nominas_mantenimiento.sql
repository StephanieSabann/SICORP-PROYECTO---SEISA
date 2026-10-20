-- SICORP-SEISA · Mantenimiento de Nómina: parámetros con vigencia y cierre de períodos.
-- Copia manual; el servidor lo aplica solo. Seguro de correr varias veces.

IF OBJECT_ID('dbo.Nomina_parametro', 'U') IS NULL
     CREATE TABLE dbo.Nomina_parametro (
         id_parametro   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
         tipo           VARCHAR(20)   NOT NULL,
         clave          NVARCHAR(150) NOT NULL,
         valor          BIGINT        NOT NULL,
         vigente_desde  CHAR(7)       NOT NULL,
         motivo         NVARCHAR(200) NULL,
         creado_por     INT           NULL,
         fecha          DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
         CONSTRAINT UQ_Nomina_parametro UNIQUE (tipo, clave, vigente_desde)
     )
GO

IF OBJECT_ID('dbo.Nomina_parametro_bitacora', 'U') IS NULL
     CREATE TABLE dbo.Nomina_parametro_bitacora (
         id_bitacora    INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
         tipo           VARCHAR(20)   NOT NULL,
         clave          NVARCHAR(150) NOT NULL,
         accion         VARCHAR(20)   NOT NULL,
         valor_anterior BIGINT        NULL,
         valor_nuevo    BIGINT        NULL,
         vigente_desde  CHAR(7)       NULL,
         motivo         NVARCHAR(200) NULL,
         id_credencial  INT           NULL,
         usuario        NVARCHAR(100) NULL,
         fecha          DATETIME2     NOT NULL DEFAULT SYSDATETIME()
     )
GO

IF OBJECT_ID('dbo.Nomina_periodo', 'U') IS NULL
     CREATE TABLE dbo.Nomina_periodo (
         periodo        CHAR(7)       NOT NULL PRIMARY KEY,
         estado         VARCHAR(10)   NOT NULL DEFAULT 'CERRADO',
         motivo         NVARCHAR(200) NULL,
         id_credencial  INT           NULL,
         usuario        NVARCHAR(100) NULL,
         fecha          DATETIME2     NOT NULL DEFAULT SYSDATETIME()
     )
GO
