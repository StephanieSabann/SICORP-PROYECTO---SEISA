/* ============================================================
   SICORP - SEISA  ·  Modulo de EMPLEADOS
   ------------------------------------------------------------
   Copia para correr A MANO en SQL Server (SSMS) sobre la base
   Seisa. Es lo mismo que basededatos/esquemaEmpleados.js aplica
   al arrancar el servidor.

   Se puede correr las veces que sea: cada paso revisa si la cosa
   ya existe antes de crearla. NO borra ni modifica datos.

   Como correrlo:
     1. Abre SSMS y conectate al servidor donde esta la base.
     2. Arriba a la izquierda escoge la base  Seisa.
     3. Abre este archivo y presiona Ejecutar (F5).
   ============================================================ */

USE [Seisa];
GO

/* ------------------------------------------------------------
   1. Historial de empleados
   Guarda un renglon por cada dato que cambie: que campo era,
   que valor tenia antes, que valor tiene ahora, quien lo cambio
   y a que hora. Es el mismo patron que ya usa Nomina_historial.
   ------------------------------------------------------------ */
IF OBJECT_ID('dbo.Empleado_historial', 'U') IS NULL
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
    );
GO

/* Para que el expediente cargue rapido el historial de una persona */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Empleado_historial_empleado')
    CREATE INDEX IX_Empleado_historial_empleado
        ON dbo.Empleado_historial (codigo_empleado, fecha DESC);
GO

/* Llave foranea hacia Empleado */
IF OBJECT_ID('dbo.Empleado', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Empleado_historial_Empleado')
    ALTER TABLE dbo.Empleado_historial
        ADD CONSTRAINT FK_Empleado_historial_Empleado
        FOREIGN KEY (codigo_empleado) REFERENCES dbo.Empleado (codigo_empleado);
GO


/* ============================================================
   2. OPCIONAL - Puestos para la lista desplegable
   ------------------------------------------------------------
   El campo "Puesto" del formulario ahora es una lista que se
   llena desde la tabla Puesto. Hoy esa tabla solo trae
   Administrativo, Tecnico y Auxiliar, que es justo lo mismo que
   ya dice el "Tipo de empleado", asi que la lista se veria
   repetida y sin utilidad.

   Este bloque agrega puestos reales de SEISA para que la lista
   sirva. Solo inserta el que no exista, asi que no duplica nada.

   >>> SI NO QUIERES ESTOS PUESTOS, BORRA ESTE BLOQUE ANTES DE
       EJECUTAR EL ARCHIVO. Tambien los puedes agregar, cambiar
       o quitar despues desde el sistema:
       Mantenimiento -> pestana Empleados -> Puestos.

   Nota: Puesto.nombre es VARCHAR(24), por eso los nombres son
   cortos. Si agregas otros, que no pasen de 24 caracteres.
   ============================================================ */
IF OBJECT_ID('dbo.Puesto', 'U') IS NOT NULL
BEGIN
    INSERT INTO dbo.Puesto (nombre, descripcion)
    SELECT v.nombre, v.descripcion
    FROM (VALUES
        ('Inspector',              'Inspeccion de contadores electricos en campo'),
        ('Auxiliar de inspeccion', 'Apoya al inspector en el trabajo de campo'),
        ('Supervisor de unidad',   'Supervisa el trabajo de una o varias cuadrillas'),
        ('Encargado de bodega',    'Resguardo y entrega de recursos del inventario'),
        ('Lector de contadores',   'Toma de lecturas de contadores electricos'),
        ('Asistente admin.',       'Apoyo administrativo en oficina')
    ) AS v (nombre, descripcion)
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.Puesto p WHERE p.nombre = v.nombre
    );
END
GO


/* ------------------------------------------------------------
   3. Comprobacion
   Corre esto para confirmar que todo quedo bien.
   ------------------------------------------------------------ */
SELECT
    CASE WHEN OBJECT_ID('dbo.Empleado_historial', 'U') IS NULL
         THEN 'FALTA  - Empleado_historial NO se creo'
         ELSE 'OK     - Empleado_historial existe'
    END AS historial,
    (SELECT COUNT(*) FROM dbo.Puesto)           AS puestos_disponibles,
    (SELECT COUNT(*) FROM dbo.Unidad
      WHERE es_activa = 1)                      AS unidades_activas;
GO
