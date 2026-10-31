/* ============================================================
   SICORP - SEISA  ·  Codigo de unidad UNICO
   ------------------------------------------------------------
   La tabla Unidad NO tiene restriccion de unicidad en "codigo",
   asi que hoy se pueden crear dos unidades con el mismo codigo
   (por ejemplo dos SI-01) y el sistema no lo impide.

   El controlador YA esta preparado para avisar "Ya existe una
   unidad con ese codigo", pero ese aviso nunca sale porque
   SQL Server no manda el error: falta la restriccion.

   Este archivo la crea.

   IMPORTANTE - va en DOS pasos:
     PASO 1: revisa si ya hay codigos repetidos.
     PASO 2: crea la restriccion (solo si el paso 1 salio limpio).

   Si hay repetidos, el PASO 2 falla a proposito. Primero hay que
   decidir cual se queda y cual se corrige.

   Nota tecnica: se usa un INDICE UNICO FILTRADO y no un
   CONSTRAINT UNIQUE normal. Motivo: la columna admite NULL, y un
   UNIQUE normal en SQL Server solo deja UNA fila con NULL. Si
   hay varias unidades sin codigo, el UNIQUE normal fallaria. El
   indice filtrado ignora los NULL y solo exige que los codigos
   escritos no se repitan.
   ============================================================ */

USE [Seisa];
GO

/* ============================================================
   PASO 1 - REVISAR ANTES DE CAMBIAR NADA
   Corre SOLO esta parte primero (seleccionala y presiona F5).
   ============================================================ */

-- 1.a) Codigos repetidos. Si no devuelve filas, vas bien.
SELECT
    codigo,
    COUNT(*)                        AS veces_repetido,
    STRING_AGG(CAST(id_unidad AS VARCHAR(10)), ', ') AS ids_afectados
FROM dbo.Unidad
WHERE codigo IS NOT NULL
GROUP BY codigo
HAVING COUNT(*) > 1;

-- 1.b) Resumen general.
SELECT
    COUNT(*)                                              AS total_unidades,
    SUM(CASE WHEN codigo IS NULL THEN 1 ELSE 0 END)       AS sin_codigo,
    COUNT(DISTINCT codigo)                                AS codigos_distintos
FROM dbo.Unidad;
GO


/* ============================================================
   PASO 2 - CREAR LA RESTRICCION
   Corre esta parte SOLO si el paso 1.a no devolvio ninguna fila.
   ============================================================ */

IF EXISTS (
    SELECT 1 FROM dbo.Unidad
    WHERE codigo IS NOT NULL
    GROUP BY codigo
    HAVING COUNT(*) > 1
)
BEGIN
    /* Se detiene a proposito: crear el indice con datos repetidos
       fallaria igual, pero con un error que no explica nada. */
    RAISERROR (
        'HAY CODIGOS DE UNIDAD REPETIDOS. Corre el PASO 1 para verlos, corrige los repetidos y vuelve a intentar. No se creo la restriccion.',
        16, 1
    );
END
ELSE IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Unidad_codigo')
BEGIN
    CREATE UNIQUE INDEX UQ_Unidad_codigo
        ON dbo.Unidad (codigo)
        WHERE codigo IS NOT NULL;

    PRINT 'LISTO: el codigo de unidad ya es unico. Las unidades sin codigo (NULL) siguen permitidas.';
END
ELSE
BEGIN
    PRINT 'Ya existia la restriccion UQ_Unidad_codigo. No se hizo ningun cambio.';
END
GO


/* ============================================================
   PASO 3 - COMPROBAR
   ============================================================ */
SELECT
    CASE WHEN EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Unidad_codigo')
         THEN 'OK    - El codigo de unidad ya no se puede repetir'
         ELSE 'FALTA - La restriccion no se creo'
    END AS resultado;
GO


/* ============================================================
   SI NECESITAS DESHACERLO
   ------------------------------------------------------------
   DROP INDEX UQ_Unidad_codigo ON dbo.Unidad;
   ============================================================ */
