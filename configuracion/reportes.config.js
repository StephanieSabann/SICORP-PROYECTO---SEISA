/* ============================================================
   SICORP — SEISA · Configuración del módulo de REPORTES
   ------------------------------------------------------------
   Valores por defecto de los parámetros. Cada uno se puede cambiar
   desde "Soporte y Mantenimiento → Reportes" sin tocar código: lo
   que se guarda en la tabla Reporte_parametro tiene prioridad sobre
   lo de este archivo.

   Para AGREGAR un reporte nuevo al sistema no se toca este archivo:
   se agrega una definición en servicios/reportes/definiciones.js
   (ver GUIA-REPORTES.md).
   ============================================================ */

const PARAMETROS = [
    {
        clave: "dias_sin_conteo",
        grupo: "Alertas de inventario",
        nombre: "Días máximos sin conteo físico",
        ayuda: "Si pasan más días que estos desde el último conteo físico, el inventario muestra una alerta.",
        tipo: "entero", minimo: 7, maximo: 730, defecto: 90, unidad: "días"
    },
    {
        clave: "disponibilidad_minima_pct",
        grupo: "Alertas de inventario",
        nombre: "Disponibilidad mínima del inventario",
        ayuda: "Si el porcentaje de unidades disponibles baja de este valor, se muestra una alerta.",
        tipo: "entero", minimo: 0, maximo: 100, defecto: 30, unidad: "%"
    },
    {
        clave: "dias_gracia_devolucion",
        grupo: "Alertas de inventario",
        nombre: "Días de gracia para devoluciones",
        ayuda: "Una entrega se considera vencida cuando pasan estos días después de la fecha de devolución prevista.",
        tipo: "entero", minimo: 0, maximo: 60, defecto: 0, unidad: "días"
    },
    {
        clave: "antiguedad_cortes",
        grupo: "Reporte de empleados",
        nombre: "Rangos de antigüedad (años)",
        ayuda: "Años donde empieza cada rango, separados por coma. Con 1,4,7 se muestran: menos de 1 año, 1-3, 4-6 y más de 6.",
        tipo: "lista_enteros", defecto: "1,4,7"
    },
    {
        clave: "meses_historial",
        grupo: "Gráficas",
        nombre: "Meses de historial en las gráficas",
        ayuda: "Cuántos meses hacia atrás muestran las gráficas de tendencia.",
        tipo: "entero", minimo: 3, maximo: 24, defecto: 6, unidad: "meses"
    },
    {
        clave: "cache_segundos",
        grupo: "Rendimiento",
        nombre: "Tiempo de caché de los dashboards",
        ayuda: "Los dashboards guardan su resultado este tiempo para no consultar la base de datos en cada clic. 0 = sin caché.",
        tipo: "entero", minimo: 0, maximo: 3600, defecto: 60, unidad: "segundos"
    },
    {
        clave: "maximo_filas_exportar",
        grupo: "Rendimiento",
        nombre: "Máximo de filas por exportación",
        ayuda: "Protege al servidor de exportaciones gigantes.",
        tipo: "entero", minimo: 100, maximo: 500000, defecto: 50000, unidad: "filas"
    },
    {
        clave: "dias_conservar_bitacora",
        grupo: "Rendimiento",
        nombre: "Días que se conserva la bitácora de exportaciones",
        ayuda: "Los registros más viejos se pueden depurar desde el panel de bitácora.",
        tipo: "entero", minimo: 30, maximo: 3650, defecto: 365, unidad: "días"
    }
];

const PARAMETROS_POR_CLAVE = Object.fromEntries(PARAMETROS.map(p => [p.clave, p]));

/* Convierte y valida el valor de un parámetro. Devuelve { valor } o { error }. */
function validarParametro(clave, bruto) {
    const def = PARAMETROS_POR_CLAVE[clave];
    if (!def) return { error: "Ese parámetro no existe." };
    const texto = String(bruto ?? "").trim();
    if (def.tipo === "entero") {
        if (!/^-?\d+$/.test(texto)) return { error: `${def.nombre}: escribe un número entero.` };
        const n = Number(texto);
        if (n < def.minimo || n > def.maximo) return { error: `${def.nombre}: debe estar entre ${def.minimo} y ${def.maximo}.` };
        return { valor: String(n) };
    }
    if (def.tipo === "lista_enteros") {
        const partes = texto.split(",").map(s => s.trim()).filter(Boolean);
        if (!partes.length || partes.length > 6 || partes.some(p => !/^\d{1,2}$/.test(p))) {
            return { error: `${def.nombre}: escribe de 1 a 6 números separados por coma (ej. 1,4,7).` };
        }
        const nums = partes.map(Number);
        for (let i = 1; i < nums.length; i++) {
            if (nums[i] <= nums[i - 1]) return { error: `${def.nombre}: los números deben ir de menor a mayor.` };
        }
        if (nums[0] < 1) return { error: `${def.nombre}: el primer rango debe empezar en 1 año o más.` };
        return { valor: nums.join(",") };
    }
    return { error: "Tipo de parámetro no soportado." };
}

/* Parámetros efectivos: los guardados en la base encima de los defectos. */
function resolverParametros(guardados = {}) {
    const r = {};
    PARAMETROS.forEach(def => {
        const v = validarParametro(def.clave, guardados[def.clave] ?? def.defecto);
        const ok = v.valor !== undefined ? v.valor : String(def.defecto);
        r[def.clave] = def.tipo === "entero" ? Number(ok) : ok.split(",").map(Number);
    });
    return r;
}

const FRECUENCIAS = ["DIARIA", "SEMANAL", "MENSUAL"];
const FORMATOS = ["xlsx", "csv"];

module.exports = { PARAMETROS, PARAMETROS_POR_CLAVE, validarParametro, resolverParametros, FRECUENCIAS, FORMATOS };
