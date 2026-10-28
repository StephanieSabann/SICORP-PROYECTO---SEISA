const { obtenerPool } = require("./conexion");

/* ============================================================
   Esquema del módulo de INVENTARIO
   ------------------------------------------------------------
   Se ejecuta solo al arrancar el servidor (ver server.js). Cada
   paso revisa primero si ya existe, así que correrlo muchas veces
   no daña nada ni duplica datos.

   Crea (si faltan):
     - Categoria_recurso   (con imagen y color)
     - Recurso             (con imagen)
     - Movimiento_inventario
     - Conteo_inventario / Conteo_detalle
   y siembra las 4 categorías base (Herramientas, EPP, Equipos,
   Uniformes) con su imagen por defecto.

   OJO: la base "Seisa" original traía una tabla vieja
   Movimiento_inventario ligada a Inventario_herramienta (sin la
   columna id_recurso). Si se encuentra esa versión vieja, NO se
   borra: se renombra a Movimiento_inventario_anterior (con todos
   sus datos) y se crea la nueva.

   El mismo SQL está en basededatos/inventario.sql por si se
   prefiere correrlo a mano en SQL Server Management Studio.
   ============================================================ */

const PASOS = [
    // ---------- Categoria_recurso ----------
    `IF OBJECT_ID('dbo.Categoria_recurso', 'U') IS NULL
     CREATE TABLE dbo.Categoria_recurso (
         id_categoria INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
         nombre       VARCHAR(50)  NOT NULL UNIQUE,
         color        VARCHAR(7)   NULL,
         imagen       VARCHAR(255) NULL
     )`,
    `IF COL_LENGTH('dbo.Categoria_recurso', 'imagen') IS NULL
     ALTER TABLE dbo.Categoria_recurso ADD imagen VARCHAR(255) NULL`,
    `IF COL_LENGTH('dbo.Categoria_recurso', 'color') IS NULL
     ALTER TABLE dbo.Categoria_recurso ADD color VARCHAR(7) NULL`,

    // ---------- Recurso ----------
    `IF OBJECT_ID('dbo.Recurso', 'U') IS NULL
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
     )`,
    `IF COL_LENGTH('dbo.Recurso', 'imagen') IS NULL
     ALTER TABLE dbo.Recurso ADD imagen VARCHAR(255) NULL`,

    // ---------- Movimiento_inventario (renombra la versión vieja) ----------
    `IF OBJECT_ID('dbo.Movimiento_inventario', 'U') IS NOT NULL
        AND COL_LENGTH('dbo.Movimiento_inventario', 'id_recurso') IS NULL
        AND OBJECT_ID('dbo.Movimiento_inventario_anterior', 'U') IS NULL
     EXEC sp_rename 'dbo.Movimiento_inventario', 'Movimiento_inventario_anterior'`,
    `IF OBJECT_ID('dbo.Movimiento_inventario', 'U') IS NULL
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
     )`,

    // ---------- Conteos físicos ----------
    `IF OBJECT_ID('dbo.Conteo_inventario', 'U') IS NULL
     CREATE TABLE dbo.Conteo_inventario (
         id_conteo      INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
         codigo         VARCHAR(10) NOT NULL,
         fecha          DATE        NOT NULL,
         id_credencial  INT         NOT NULL,
         estado         VARCHAR(20) NOT NULL DEFAULT 'En curso',
         fecha_registro DATETIME    NOT NULL DEFAULT GETDATE()
     )`,
    `IF OBJECT_ID('dbo.Conteo_detalle', 'U') IS NULL
     CREATE TABLE dbo.Conteo_detalle (
         id_detalle       INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
         id_conteo        INT NOT NULL REFERENCES dbo.Conteo_inventario(id_conteo),
         id_recurso       INT NOT NULL REFERENCES dbo.Recurso(id_recurso),
         cantidad_sistema INT NOT NULL,
         cantidad_fisica  INT NULL,
         revisado         BIT NOT NULL DEFAULT 0
     )`,

    // ---------- Categorías base (solo si no existen) ----------
    `IF NOT EXISTS (SELECT 1 FROM dbo.Categoria_recurso WHERE nombre = 'Herramientas')
     INSERT INTO dbo.Categoria_recurso (nombre, color, imagen) VALUES ('Herramientas', '#4F7DF3', 'img/categorias/herramientas.svg')`,
    `IF NOT EXISTS (SELECT 1 FROM dbo.Categoria_recurso WHERE nombre = 'EPP')
     INSERT INTO dbo.Categoria_recurso (nombre, color, imagen) VALUES ('EPP', '#22C2B5', 'img/categorias/epp.svg')`,
    `IF NOT EXISTS (SELECT 1 FROM dbo.Categoria_recurso WHERE nombre = 'Equipos')
     INSERT INTO dbo.Categoria_recurso (nombre, color, imagen) VALUES ('Equipos', '#E3453F', 'img/categorias/equipos.svg')`,
    `IF NOT EXISTS (SELECT 1 FROM dbo.Categoria_recurso WHERE nombre = 'Uniformes')
     INSERT INTO dbo.Categoria_recurso (nombre, color, imagen) VALUES ('Uniformes', '#A855F7', 'img/categorias/uniformes.svg')`,

    // Si las categorías ya existían sin color/imagen, se les pone el de por defecto
    `UPDATE dbo.Categoria_recurso SET color = '#4F7DF3' WHERE nombre = 'Herramientas' AND color IS NULL`,
    `UPDATE dbo.Categoria_recurso SET color = '#22C2B5' WHERE nombre = 'EPP' AND color IS NULL`,
    `UPDATE dbo.Categoria_recurso SET color = '#E3453F' WHERE nombre = 'Equipos' AND color IS NULL`,
    `UPDATE dbo.Categoria_recurso SET color = '#A855F7' WHERE nombre = 'Uniformes' AND color IS NULL`,
    `UPDATE dbo.Categoria_recurso SET imagen = 'img/categorias/herramientas.svg' WHERE nombre = 'Herramientas' AND imagen IS NULL`,
    `UPDATE dbo.Categoria_recurso SET imagen = 'img/categorias/epp.svg' WHERE nombre = 'EPP' AND imagen IS NULL`,
    `UPDATE dbo.Categoria_recurso SET imagen = 'img/categorias/equipos.svg' WHERE nombre = 'Equipos' AND imagen IS NULL`,
    `UPDATE dbo.Categoria_recurso SET imagen = 'img/categorias/uniformes.svg' WHERE nombre = 'Uniformes' AND imagen IS NULL`,

    // El acceso "Inventario" debe existir para que requiereAcceso('Inventario') funcione
    `IF OBJECT_ID('dbo.Catalogo_acceso', 'U') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM dbo.Catalogo_acceso WHERE nombre = 'Inventario')
     INSERT INTO dbo.Catalogo_acceso (nombre) VALUES ('Inventario')`
];

let promesa;

/* Devuelve siempre la misma promesa: así, si una petición llega
   mientras todavía se está preparando el esquema, espera a que
   termine en vez de fallar. */
function prepararEsquemaInventario() {
    if (!promesa) {
        promesa = (async () => {
            const pool = await obtenerPool();
            for (const paso of PASOS) {
                try {
                    await pool.request().query(paso);
                } catch (error) {
                    console.error("[Inventario] No se pudo aplicar un paso del esquema:\n", paso.split("\n")[0], "\n→", error.message);
                }
            }
            console.log("[Inventario] Tablas de inventario listas.");
        })().catch(error => {
            promesa = undefined; // se reintenta en la siguiente petición
            console.error("[Inventario] No se pudo preparar el esquema:", error.message);
            throw error;
        });
    }
    return promesa;
}

/* Middleware: garantiza que el esquema esté listo antes de atender
   cualquier ruta /api/inventario/*. */
async function esquemaInventarioListo(req, res, next) {
    try {
        await prepararEsquemaInventario();
        next();
    } catch (error) {
        res.status(500).json({
            exito: false,
            mensaje: "No se pudieron preparar las tablas de inventario en la base de datos: " + error.message
        });
    }
}

module.exports = { prepararEsquemaInventario, esquemaInventarioListo };
