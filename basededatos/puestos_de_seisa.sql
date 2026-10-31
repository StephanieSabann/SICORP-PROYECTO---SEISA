/* ============================================================
   SICORP - SEISA  ·  Puestos reales de la empresa
   ------------------------------------------------------------
   Deja en el catalogo de puestos unicamente los que SEISA usa:

        Tecnico
        Auxiliar
        Seguridad Industrial
        Gerente general

   y quita los de ejemplo que se habian metido antes.

   >>> EL PASO 1 NO CAMBIA NADA. Solo muestra. Correlo primero.
   >>> Los pasos 2 y 3 si cambian datos.

   Ningun puesto que tenga empleados asignados se borra: esos
   empleados quedarian apuntando a un puesto inexistente. Si
   alguno esta en uso, el paso 3 lo deja y te lo reporta.

   Como correrlo:
     1. Abre SSMS y escoge arriba a la izquierda la base  Seisa.
     2. Abre este archivo (Ctrl+O) y presiona F5.
   ============================================================ */

USE [Seisa];
GO

/* ============================================================
   PASO 1 - VER COMO ESTA EL CATALOGO AHORA  (seguro)
   ============================================================ */
SELECT
    p.id_puesto,
    p.nombre,
    p.descripcion,
    (SELECT COUNT(*) FROM dbo.Empleado e WHERE e.id_puesto = p.id_puesto) AS empleados_asignados
FROM dbo.Puesto p
ORDER BY empleados_asignados DESC, p.nombre;
GO


/* ============================================================
   PASO 2 - AGREGAR LOS 4 PUESTOS DE SEISA
   Solo inserta el que no exista. No duplica nada.
   ============================================================ */
INSERT INTO dbo.Puesto (nombre, descripcion)
SELECT v.nombre, v.descripcion
FROM (VALUES
    ('Tecnico',              'Instalacion y mantenimiento de contadores electricos'),
    ('Auxiliar',             'Apoya al tecnico en el trabajo de campo'),
    ('Seguridad Industrial', 'Supervisa la seguridad del personal en campo'),
    ('Gerente general',      'Direccion general de la empresa')
) AS v (nombre, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Puesto p WHERE p.nombre = v.nombre);
GO


/* ============================================================
   PASO 3 - QUITAR LOS PUESTOS DE EJEMPLO
   ------------------------------------------------------------
   Borra solo los 6 que se habian insertado como ejemplo, y
   unicamente si NO tienen empleados asignados.
   ============================================================ */

-- Primero avisa cuales no se van a poder borrar porque estan en uso
SELECT
    p.nombre                                                              AS no_se_borra_porque_esta_en_uso,
    (SELECT COUNT(*) FROM dbo.Empleado e WHERE e.id_puesto = p.id_puesto) AS empleados
FROM dbo.Puesto p
WHERE p.nombre IN ('Inspector', 'Auxiliar de inspeccion', 'Supervisor de unidad',
                   'Encargado de bodega', 'Lector de contadores', 'Asistente admin.')
  AND EXISTS (SELECT 1 FROM dbo.Empleado e WHERE e.id_puesto = p.id_puesto);
GO

DELETE FROM dbo.Puesto
WHERE nombre IN ('Inspector', 'Auxiliar de inspeccion', 'Supervisor de unidad',
                 'Encargado de bodega', 'Lector de contadores', 'Asistente admin.')
  AND NOT EXISTS (SELECT 1 FROM dbo.Empleado e WHERE e.id_puesto = dbo.Puesto.id_puesto);
GO


/* ============================================================
   PASO 4 - COMO QUEDO EL CATALOGO
   ============================================================ */
SELECT
    p.id_puesto,
    p.nombre,
    (SELECT COUNT(*) FROM dbo.Empleado e WHERE e.id_puesto = p.id_puesto) AS empleados_asignados
FROM dbo.Puesto p
ORDER BY p.nombre;
GO


/* ============================================================
   OJO CON LOS PUESTOS QUE YA TENIAN
   ------------------------------------------------------------
   En la base tambien aparecian estos, que NO son de los 6 de
   ejemplo y por eso este archivo no los toca:

        administrador
        Administrador inventario
        Supervisor puesto

   Si tampoco los quieren, se borran desde el sistema:
   Mantenimiento -> Empleados -> boton Borrar de cada puesto.
   El sistema no deja borrar uno que tenga empleados asignados.
   ============================================================ */
