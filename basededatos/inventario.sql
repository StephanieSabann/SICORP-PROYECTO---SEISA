/* ============================================================
   SICORP — SEISA · Tablas del módulo de INVENTARIO
   ------------------------------------------------------------
   No es obligatorio correrlo: server.js ya lo aplica solo al
   arrancar. Sirve si prefieres hacerlo a mano en SSMS.
   Se puede correr varias veces sin duplicar nada.
   ============================================================ */
USE Seisa;
GO

IF OBJECT_ID('dbo.Categoria_recurso', 'U') IS NULL
 CREATE TABLE dbo.Categoria_recurso (
     id_categoria INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
     nombre       VARCHAR(50)  NOT NULL UNIQUE,
     color        VARCHAR(7)   NULL,
     imagen       VARCHAR(255) NULL
 );
GO

IF COL_LENGTH('dbo.Categoria_recurso', 'imagen') IS NULL
 ALTER TABLE dbo.Categoria_recurso ADD imagen VARCHAR(255) NULL;
GO

IF COL_LENGTH('dbo.Categoria_recurso', 'color') IS NULL
 ALTER TABLE dbo.Categoria_recurso ADD color VARCHAR(7) NULL;
GO

IF OBJECT_ID('dbo.Recurso', 'U') IS NULL
 CREATE TABLE dbo.Recurso (
     id_recurso          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
     codigo              VARCHAR(10)  NOT NULL UNIQUE,
     nombre              VARCHAR(100) NOT NULL,
     id_categoria        INT          NOT NULL
                         REFERENCES dbo.Categoria_recurso(id_categoria),
     cantidad_total      INT          NOT NULL DEFAULT 0,
     cantidad_disponible INT          NOT NULL DEFAULT 0,
     cantidad_minima     INT          NOT NULL DEFAULT 0,
     estado_fisico       VARCHAR(20)  NOT NULL DEFAULT 'Nuevo',
     imagen              VARCHAR(255) NULL,
     activo              BIT          NOT NULL DEFAULT 1,
     fecha_creacion      DATETIME     NOT NULL DEFAULT GETDATE()
 );
GO

IF COL_LENGTH('dbo.Recurso', 'imagen') IS NULL
 ALTER TABLE dbo.Recurso ADD imagen VARCHAR(255) NULL;
GO

IF OBJECT_ID('dbo.Movimiento_inventario', 'U') IS NOT NULL
    AND COL_LENGTH('dbo.Movimiento_inventario', 'id_recurso') IS NULL
    AND OBJECT_ID('dbo.Movimiento_inventario_anterior', 'U') IS NULL
 EXEC sp_rename 'dbo.Movimiento_inventario', 'Movimiento_inventario_anterior';
GO

IF OBJECT_ID('dbo.Movimiento_inventario', 'U') IS NULL
 CREATE TABLE dbo.Movimiento_inventario (
     id_movimiento             INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
     id_recurso                INT          NOT NULL
                               REFERENCES dbo.Recurso(id_recurso),
     tipo                      VARCHAR(20)  NOT NULL,
     cantidad                  INT          NOT NULL,
     fecha                     DATE         NOT NULL,
     id_empleado               INT          NULL,
     id_credencial             INT          NOT NULL,
     origen                    VARCHAR(10)  NULL,
     condicion                 VARCHAR(20)  NULL,
     observacion               VARCHAR(300) NULL,
     estado                    VARCHAR(20)  NOT NULL DEFAULT 'Registrado',
     fecha_devolucion_prevista DATE         NULL,
     id_movimiento_relacionado INT          NULL,
     fecha_registro            DATETIME     NOT NULL DEFAULT GETDATE()
 );
GO

IF OBJECT_ID('dbo.Conteo_inventario', 'U') IS NULL
 CREATE TABLE dbo.Conteo_inventario (
     id_conteo      INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
     codigo         VARCHAR(10) NOT NULL,
     fecha          DATE        NOT NULL,
     id_credencial  INT         NOT NULL,
     estado         VARCHAR(20) NOT NULL DEFAULT 'En curso',
     fecha_registro DATETIME    NOT NULL DEFAULT GETDATE()
 );
GO

IF OBJECT_ID('dbo.Conteo_detalle', 'U') IS NULL
 CREATE TABLE dbo.Conteo_detalle (
     id_detalle       INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
     id_conteo        INT NOT NULL REFERENCES dbo.Conteo_inventario(id_conteo),
     id_recurso       INT NOT NULL REFERENCES dbo.Recurso(id_recurso),
     cantidad_sistema INT NOT NULL,
     cantidad_fisica  INT NULL,
     revisado         BIT NOT NULL DEFAULT 0
 );
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Categoria_recurso WHERE nombre = 'Herramientas')
 INSERT INTO dbo.Categoria_recurso (nombre, color, imagen) VALUES ('Herramientas', '#4F7DF3', 'img/categorias/herramientas.svg');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Categoria_recurso WHERE nombre = 'EPP')
 INSERT INTO dbo.Categoria_recurso (nombre, color, imagen) VALUES ('EPP', '#22C2B5', 'img/categorias/epp.svg');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Categoria_recurso WHERE nombre = 'Equipos')
 INSERT INTO dbo.Categoria_recurso (nombre, color, imagen) VALUES ('Equipos', '#E3453F', 'img/categorias/equipos.svg');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Categoria_recurso WHERE nombre = 'Uniformes')
 INSERT INTO dbo.Categoria_recurso (nombre, color, imagen) VALUES ('Uniformes', '#A855F7', 'img/categorias/uniformes.svg');
GO

UPDATE dbo.Categoria_recurso SET color = '#4F7DF3' WHERE nombre = 'Herramientas' AND color IS NULL;
GO

UPDATE dbo.Categoria_recurso SET color = '#22C2B5' WHERE nombre = 'EPP' AND color IS NULL;
GO

UPDATE dbo.Categoria_recurso SET color = '#E3453F' WHERE nombre = 'Equipos' AND color IS NULL;
GO

UPDATE dbo.Categoria_recurso SET color = '#A855F7' WHERE nombre = 'Uniformes' AND color IS NULL;
GO

UPDATE dbo.Categoria_recurso SET imagen = 'img/categorias/herramientas.svg' WHERE nombre = 'Herramientas' AND imagen IS NULL;
GO

UPDATE dbo.Categoria_recurso SET imagen = 'img/categorias/epp.svg' WHERE nombre = 'EPP' AND imagen IS NULL;
GO

UPDATE dbo.Categoria_recurso SET imagen = 'img/categorias/equipos.svg' WHERE nombre = 'Equipos' AND imagen IS NULL;
GO

UPDATE dbo.Categoria_recurso SET imagen = 'img/categorias/uniformes.svg' WHERE nombre = 'Uniformes' AND imagen IS NULL;
GO

IF OBJECT_ID('dbo.Catalogo_acceso', 'U') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM dbo.Catalogo_acceso WHERE nombre = 'Inventario')
 INSERT INTO dbo.Catalogo_acceso (nombre) VALUES ('Inventario');
GO

