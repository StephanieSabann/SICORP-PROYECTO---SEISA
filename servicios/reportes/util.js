/* ============================================================
   Utilidades compartidas del módulo de Reportes
   (fechas, períodos AAAA-MM, dinero y textos). Sin dependencias.
   Las fechas de SQL Server llegan como Date en UTC; todo se
   formatea con componentes UTC para que "2026-06-30" siga siendo
   30 de junio sin importar la zona horaria del servidor.
   ============================================================ */

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const dos = n => String(n).padStart(2, "0");

/* Date | "AAAA-MM-DD..." → "AAAA-MM-DD" (o null). */
function aISO(valor) {
    if (!valor) return null;
    if (valor instanceof Date) {
        if (Number.isNaN(valor.getTime())) return null;
        return `${valor.getUTCFullYear()}-${dos(valor.getUTCMonth() + 1)}-${dos(valor.getUTCDate())}`;
    }
    const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/* Date | texto → "AAAA-MM-DD HH:MM" (o null). */
function aISOHora(valor) {
    if (!valor) return null;
    if (valor instanceof Date) {
        if (Number.isNaN(valor.getTime())) return null;
        return `${aISO(valor)} ${dos(valor.getUTCHours())}:${dos(valor.getUTCMinutes())}`;
    }
    const m = String(valor).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
    return m ? `${m[1]} ${m[2]}:${m[3]}` : aISO(valor);
}

const msDe = iso => { const [a, m, d] = iso.split("-").map(Number); return Date.UTC(a, m - 1, d); };
const diasEntre = (desdeISO, hastaISO) => Math.round((msDe(hastaISO) - msDe(desdeISO)) / 86400000);

/* Años cumplidos entre dos fechas ISO. */
function aniosCumplidos(desdeISO, hastaISO) {
    if (!desdeISO || !hastaISO) return null;
    const [a1, m1, d1] = desdeISO.split("-").map(Number);
    const [a2, m2, d2] = hastaISO.split("-").map(Number);
    let anios = a2 - a1;
    if (m2 < m1 || (m2 === m1 && d2 < d1)) anios--;
    return anios;
}

const periodoValido = p => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(p || ""));
const periodoDeFecha = iso => iso ? iso.slice(0, 7) : null;

function sumarMeses(periodo, n) {
    const [a, m] = periodo.split("-").map(Number);
    const total = a * 12 + (m - 1) + n;
    return `${Math.floor(total / 12)}-${dos((total % 12) + 1)}`;
}

function rangoPeriodo(periodo) {
    const [a, m] = periodo.split("-").map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return { desde: `${periodo}-01`, hasta: `${periodo}-${dos(ultimo)}` };
}

/* Los últimos n períodos que terminan en "periodo", del más viejo al más nuevo. */
function ultimosPeriodos(periodo, n) {
    const lista = [];
    for (let i = n - 1; i >= 0; i--) lista.push(sumarMeses(periodo, -i));
    return lista;
}

const nombrePeriodo = p => periodoValido(p) ? `${MESES[Number(p.slice(5)) - 1]} ${p.slice(0, 4)}` : "—";
const mesCorto = p => MESES_CORTOS[Number(p.slice(5)) - 1];
const nombreMes = p => MESES[Number(p.slice(5)) - 1];

function periodoActual(ahora = new Date()) {
    return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}`;
}
function hoyISO(ahora = new Date()) {
    return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
}

/* Quita acentos y pasa a minúsculas (comparaciones tolerantes). */
const normalizar = t => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const aQuetzales = centavos => centavos === null || centavos === undefined ? null : Math.round(Number(centavos)) / 100;
const redondear2 = n => Math.round((Number(n) || 0) * 100) / 100;
const porcentaje = (parte, total) => total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;

function formatoQ(valor) {
    const n = Number(valor) || 0;
    return "Q" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const nombreCompleto = e => `${e.nombre || ""} ${e.apellido || ""}`.trim();

/* Variación contra el período anterior: { valor, pct, sentido }. */
function variacion(actual, anterior) {
    const a = Number(actual) || 0, b = Number(anterior) || 0;
    const diferencia = a - b;
    return {
        diferencia,
        pct: b === 0 ? (a === 0 ? 0 : null) : Math.round((diferencia / Math.abs(b)) * 1000) / 10,
        sentido: diferencia > 0 ? "sube" : diferencia < 0 ? "baja" : "igual"
    };
}

module.exports = {
    MESES, MESES_CORTOS, aISO, aISOHora, diasEntre, aniosCumplidos, periodoValido, periodoDeFecha, sumarMeses, rangoPeriodo,
    ultimosPeriodos, nombrePeriodo, mesCorto, nombreMes, periodoActual, hoyISO, normalizar, aQuetzales, redondear2,
    porcentaje, formatoQ, nombreCompleto, variacion
};
