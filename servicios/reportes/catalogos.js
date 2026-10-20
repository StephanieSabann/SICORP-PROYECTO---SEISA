const U = require("./util");
const A = require("./agregadores");

/* ============================================================
   CATÁLOGOS PARA LOS FILTROS (leídos de la base de datos)
   ------------------------------------------------------------
   Las opciones de puesto, tipo de nómina, origen y tipo de
   permiso salen de lo que realmente existe en la base. Si en el
   futuro se agrega un puesto, un tipo o un origen nuevo, aparece
   solo en los filtros, sin tocar código.
   ============================================================ */

const op = (valor, etiqueta) => ({ valor, etiqueta });
const ORDEN_GRUPOS = ["Técnicos", "Auxiliares", "Administrativos"];
const NOMBRE_TIPO_NOMINA = { TECNICO_SOCIO: "Técnico socio", TECNICO_NO_SOCIO: "Técnico no socio", ADMINISTRATIVA: "Planilla administrativa" };

/* "TECNICO_SOCIO" → "Tecnico socio" para tipos que aún no tienen nombre propio. */
function legible(codigo) {
    const t = String(codigo || "").replace(/_/g, " ").toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
}
const nombreTipoNomina = t => NOMBRE_TIPO_NOMINA[t] || legible(t);

async function cargar(repo) {
    try { return (repo.catalogos && await repo.catalogos()) || {}; } catch (_) { return {}; }
}

/* Grupos de personal que existen en la base (los 3 oficiales primero, luego los demás). */
async function opcionesGrupo(repo, textoTodos = "Todos los puestos") {
    const emps = await repo.empleados();
    const hay = new Set(emps.map(e => A.grupoPersonal(e)));
    const ordenados = [...ORDEN_GRUPOS.filter(g => hay.has(g)), ...[...hay].filter(g => !ORDEN_GRUPOS.includes(g)).sort((a, b) => a.localeCompare(b))];
    return [op("", textoTodos), ...ordenados.map(g => op(g, g))];
}

async function opcionesTipoNomina(repo) {
    const cat = await cargar(repo);
    const tipos = (cat.tiposNomina || []).filter(Boolean);
    return [op("", "Todos los tipos"), ...tipos.map(t => op(t, nombreTipoNomina(t)))];
}

async function opcionesOrigen(repo) {
    const cat = await cargar(repo);
    const origenes = (cat.origenes || []).filter(Boolean);
    return [op("", "Cualquier origen"), ...origenes.map(o => op(o, o))];
}

async function opcionesTipoPermiso(repo) {
    const cat = await cargar(repo);
    const tipos = (cat.tiposPermiso || []).filter(Boolean);
    return [op("", "Todos los tipos"), ...tipos.map(t => op(t, t))];
}

module.exports = { opcionesGrupo, opcionesTipoNomina, opcionesOrigen, opcionesTipoPermiso, nombreTipoNomina };
