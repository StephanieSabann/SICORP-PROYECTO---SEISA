/* ============================================================
   SICORP — SEISA · Formato del código de unidad (cuadrilla)
   ------------------------------------------------------------
   UN SOLO lugar donde vive la regla. La usan el módulo de
   Empleados (al asignar la unidad de una persona) y el de
   Mantenimiento (al crear o editar una unidad). Así no hay dos
   copias que se puedan desincronizar.

   La regla: el prefijo "SI-" es obligatorio y el número va
   siempre con DOS dígitos, del 01 al 99.

   Se acepta cualquiera de estas formas al escribir, y todas
   terminan guardadas igual:
       21  ·  si21  ·  SI 21  ·  si-21  ·  SI-21   →   SI-21
       1   ·  SI-1                                 →   SI-01

   Vacío significa "sin unidad", que es lo normal en los
   empleados administrativos.
   ============================================================ */

const FORMATO = /^SI-?(\d{1,2})$/;

const MENSAJE_FORMATO =
    'El código de unidad debe ser "SI-" seguido de un número del 1 al 99. Por ejemplo: SI-01, SI-21.';

/* Devuelve el código ya con formato (SI-NN), o null si viene
   vacío. Lanza un error con mensaje claro si no cumple. */
function normalizarCodigoUnidad(valor) {
    if (valor === undefined || valor === null) {
        return null;
    }

    if (typeof valor !== "string") {
        throw new Error("El código de unidad debe ser texto.");
    }

    // Se quitan los espacios (incluidos los de en medio: "SI - 21")
    const limpio = valor.replace(/\s+/g, "").toUpperCase();

    if (limpio.length === 0) {
        return null;
    }

    // Puede venir solo el número, porque la pantalla muestra el "SI-" aparte.
    const soloNumero = /^\d{1,2}$/.test(limpio);
    const partes = soloNumero ? [null, limpio] : limpio.match(FORMATO);

    if (!partes) {
        throw new Error(MENSAJE_FORMATO);
    }

    const numero = Number(partes[1]);

    if (numero < 1) {
        throw new Error("El número de la unidad debe ser del 1 al 99.");
    }

    return "SI-" + String(numero).padStart(2, "0");
}

module.exports = { normalizarCodigoUnidad, FORMATO, MENSAJE_FORMATO };