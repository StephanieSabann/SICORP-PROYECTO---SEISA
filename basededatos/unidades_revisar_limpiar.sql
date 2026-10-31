/* ============================================================
   SICORP - SEISA  ·  Revisar y limpiar las UNIDADES
   ------------------------------------------------------------
   El codigo de unidad ahora tiene formato obligatorio:

        SI-01 , SI-02 , ... , SI-99

   En la base pueden quedar unidades viejas con otro formato
   (por ejemplo "S1" o "Unidad 1"). Este archivo sirve para
   verlas y decidir que hacer con cada una.

   >>> EL PASO 1 NO CAMBIA NADA. Solo muestra. Correlo primero.
   >>> Los pasos 2 y 3 SI cambian datos y estan comentados a
       proposito: hay que quitarles los /* */ para que corran.

   Antes de correr el paso 2 o 3: saca un respaldo de la base.
   ============================================================ */

USE [Seisa];
GO

/* ============================================================
   PASO 1 - VER QUE HAY  (no cambia nada, es seguro)
   ============================================================ */

SELECT
    u.id_unidad,
    u.codigo,
    CASE
        WHEN u.codigo IS NULL                      THEN '3. SIN CODIGO'
        WHEN u.codigo LIKE 'SI-[0-9][0-9]'         THEN '1. YA ESTA BIEN'
        WHEN REPLACE(REPLACE(u.codigo,' ',''),'-','') LIKE 'SI[0-9]%'
          OR REPLACE(REPLACE(u.codigo,' ',''),'-','') LIKE 'S[0-9]%'
                                                   THEN '2. SE PUEDE CONVERTIR'
        ELSE                                            '4. NO SE PARECE A NADA'
    END                                            AS estado,
    CASE WHEN u.es_activa = 1 THEN 'Activa' ELSE 'Inactiva' END AS activa,
    (SELECT COUNT(*) FROM dbo.Unidad_empleado ue
      WHERE ue.id_unidad = u.id_unidad)            AS empleados_asignados
FROM dbo.Unidad u
ORDER BY estado, u.codigo;
GO

/* Quienes estan asignados a cada unidad. Sirve para saber a quien
   afecta si decides borrar alguna. */
SELECT
    u.codigo                                   AS unidad,
    e.codigo_empleado,
    e.nombre + ' ' + e.apellido                AS empleado
FROM dbo.Unidad_empleado ue
INNER JOIN dbo.Unidad   u ON u.id_unidad       = ue.id_unidad
INNER JOIN dbo.Empleado e ON e.codigo_empleado = ue.id_empleado
ORDER BY u.codigo, e.nombre;
GO


/* ============================================================
   PASO 2 - CONVERTIR LAS QUE SE PUEDAN AL FORMATO SI-NN
   ------------------------------------------------------------
   Convierte "S1" -> "SI-01", "si 7" -> "SI-07", etc.
   NO toca las que ya estan bien, ni las que no se parecen a
   nada, ni las que chocarian con un codigo que ya existe.

   Para usarlo: borra la linea de abajo que dice  /*  y la que
   dice  */  al final del bloque, y presiona F5.
   ============================================================ */
/*
UPDATE u
SET codigo = v.codigo_nuevo
FROM dbo.Unidad u
CROSS APPLY (
    SELECT 'SI-' + RIGHT('0' + CAST(
        TRY_CAST(
            RIGHT(REPLACE(REPLACE(u.codigo,' ',''),'-',''),
                  LEN(REPLACE(REPLACE(u.codigo,' ',''),'-','')) -
                  CASE WHEN REPLACE(REPLACE(u.codigo,' ',''),'-','') LIKE 'SI%' THEN 2 ELSE 1 END)
        AS INT) AS VARCHAR(2)), 2) AS codigo_nuevo
) v
WHERE u.codigo IS NOT NULL
  AND u.codigo NOT LIKE 'SI-[0-9][0-9]'
  AND v.codigo_nuevo IS NOT NULL
  AND v.codigo_nuevo NOT LIKE '%NULL%'
  -- que el codigo nuevo no choque con uno que ya exista
  AND NOT EXISTS (SELECT 1 FROM dbo.Unidad o
                   WHERE o.codigo = v.codigo_nuevo AND o.id_unidad <> u.id_unidad);

SELECT id_unidad, codigo FROM dbo.Unidad ORDER BY codigo;
*/
GO


/* ============================================================
   PASO 3 - BORRAR LAS QUE NO SIRVEN Y NO TIENEN GENTE
   ------------------------------------------------------------
   Borra unicamente las unidades que:
       - no cumplen el formato SI-NN, Y
       - no tienen NINGUN empleado asignado.

   Las que si tienen empleados NO se tocan, para no dejar a
   nadie sin cuadrilla sin darte cuenta.

   Para usarlo: quita el  /*  y el  */  del bloque.
   ============================================================ */
/*
DELETE FROM dbo.Unidad
WHERE (codigo IS NULL OR codigo NOT LIKE 'SI-[0-9][0-9]')
  AND NOT EXISTS (SELECT 1 FROM dbo.Unidad_empleado ue
                   WHERE ue.id_unidad = dbo.Unidad.id_unidad);

SELECT id_unidad, codigo, es_activa FROM dbo.Unidad ORDER BY codigo;
*/
GO


/* ============================================================
   PASO 4 - COMPROBAR COMO QUEDO
   ============================================================ */
SELECT
    COUNT(*)                                                          AS total_unidades,
    SUM(CASE WHEN codigo LIKE 'SI-[0-9][0-9]' THEN 1 ELSE 0 END)      AS con_formato_correcto,
    SUM(CASE WHEN codigo IS NULL
               OR codigo NOT LIKE 'SI-[0-9][0-9]' THEN 1 ELSE 0 END)  AS pendientes
FROM dbo.Unidad;
GO
