const XLSX = require("xlsx");
const { normalizar, MESES } = require("../public/js/nominas-calculo");
const { ACTIVIDADES_OFICIALES } = require("../configuracion/nominas.config");
const ORDEN_OFICIAL = ACTIVIDADES_OFICIALES.map(normalizar);
const posicionOficial = nombre => { const i = ORDEN_OFICIAL.indexOf(normalizar(nombre)); return i < 0 ? 999 : i; };

/* ============================================================
   Lector del reporte de EEGSA (.xlsx / .xls)
   ------------------------------------------------------------
   Entiende DOS formatos:

   1) FACTURACIÓN MENSUAL (el archivo real de EEGSA): trae a TODOS
      los técnicos. Se lee la hoja de detalle ("Efectuado"), una
      fila por orden:  INSPECTOR | AREA DE TRABAJO | REPORTE | ...
      y se cuentan las órdenes por técnico, actividad y área.
      De las otras hojas se toma:
        - "Resumen Total"   → total de órdenes por técnico (para cuadrar)
        - "Penalizaciones"  → penalizaciones por técnico
        - "Emergencias"     → emergencias atendidas por técnico
      El técnico se escoge después (o se elige solo si solo uno
      está registrado en Empleados).

   2) RESUMEN DE UN SOLO INSPECTOR (tabla dinámica):
        Inspector: ELIZANDRO HERNANDEZ
        Actividad | Áreas: 1   (o varias áreas + "Total Areas")
        ...
        Total general

   No dependemos de posiciones fijas: se buscan los ENCABEZADOS
   (sin importar mayúsculas, acentos ni espacios). Solo se leen
   valores: nunca se ejecutan macros ni fórmulas.
   ============================================================ */

const ENCABEZADOS_ACTIVIDAD = ["actividad", "actividades", "etiquetas de fila", "row labels", "tipo de actividad", "descripcion actividad", "reporte"];
const ACTIVIDAD_EMERGENCIAS = "ATENCIÓN DE EMERGENCIAS";

class ErrorArchivo extends Error {
    constructor(mensaje) { super(mensaje); this.name = "ErrorArchivo"; this.esArchivo = true; }
}

function textoCelda(v) {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v).trim();
}
const esNumero = v => typeof v === "number" && Number.isFinite(v);
const redondear2 = n => Math.round(n * 100) / 100;

/* "JUNIO 2026", "06/2026", "28.09.2026", fecha de Excel... → "2026-06" */
function detectarPeriodo(valor) {
    if (valor === null || valor === undefined || valor === "") return null;
    if (valor instanceof Date && !isNaN(valor)) {
        return `${valor.getUTCFullYear()}-${String(valor.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    const t = normalizar(valor);
    let m = t.match(/(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?/);
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2].padStart(2, "0")}`;
    m = t.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[3]}-${m[2].padStart(2, "0")}`;
    m = t.match(/\b(\d{1,2})[-/.](\d{4})\b/);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${m[2]}-${m[1].padStart(2, "0")}`;
    const mes = MESES.findIndex(n => new RegExp(`\\b${n}\\b`).test(t) || (n === "septiembre" && /\bsetiembre\b/.test(t)));
    const anio = t.match(/\b(20\d{2})\b/);
    if (mes >= 0 && anio) return `${anio[1]}-${String(mes + 1).padStart(2, "0")}`;
    return null;
}

/* Hoja → filas (arreglo de arreglos). Usa el modo "denso" de SheetJS y
   recorta filas/columnas vacías: algunas hojas reales dicen tener más
   de un millón de filas por formato, pero casi todas están vacías. */
function filasDeHoja(ws) {
    const filas = [];
    if (!Array.isArray(ws)) {
        return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    }
    ws.forEach((fila, r) => {
        if (!fila) return;
        const valores = [];
        let ultima = -1;
        fila.forEach((celda, c) => {
            if (!celda || celda.v === undefined || celda.v === null || celda.t === "z") return;
            if (celda.t === "e") return;                  // #REF!, #N/A → se ignoran
            valores[c] = celda.v;
            ultima = c;
        });
        if (ultima < 0) return;
        for (let c = 0; c <= ultima; c++) if (valores[c] === undefined) valores[c] = null;
        filas[r] = valores;
    });
    for (let r = 0; r < filas.length; r++) if (!filas[r]) filas[r] = [];
    return filas;
}

/* Busca una etiqueta ("Inspector:", "Período:") y devuelve su valor. */
function buscarEtiqueta(filas, patron) {
    for (let r = 0; r < filas.length; r++) {
        const fila = filas[r] || [];
        for (let c = 0; c < fila.length; c++) {
            const crudo = fila[c];
            if (crudo === null || crudo === undefined) continue;
            const texto = textoCelda(crudo);
            if (!patron.test(normalizar(texto))) continue;
            const dosPuntos = texto.indexOf(":");
            const resto = dosPuntos >= 0 ? texto.slice(dosPuntos + 1).trim() : "";
            if (resto) return { valor: resto, fila: r + 1 };
            for (let k = c + 1; k < fila.length; k++) {
                if (fila[k] !== null && fila[k] !== undefined && textoCelda(fila[k]) !== "") return { valor: fila[k], fila: r + 1 };
            }
            const abajo = (filas[r + 1] || [])[c];
            if (abajo !== null && abajo !== undefined && textoCelda(abajo) !== "") return { valor: abajo, fila: r + 2 };
        }
    }
    return null;
}

/* Fila de encabezados que contiene TODAS las claves pedidas (cada clave es
   una lista de nombres posibles). Devuelve la fila y la columna de cada una. */
function buscarEncabezados(filas, claves, maxFilas = 30) {
    for (let r = 0; r < Math.min(filas.length, maxFilas); r++) {
        const fila = (filas[r] || []).map(v => normalizar(textoCelda(v)));
        const cols = {};
        let todas = true;
        for (const [clave, nombres] of Object.entries(claves)) {
            const c = fila.findIndex(v => nombres.includes(v));
            if (c < 0) { todas = false; break; }
            cols[clave] = c;
        }
        if (todas) return { fila: r, cols, nombres: fila };
    }
    return null;
}

/* ============================================================
   FORMATO 1: facturación mensual con hoja de detalle
   ============================================================ */
function leerDetalle(hojas) {
    let detalle = null;
    for (const h of hojas) {
        const enc = buscarEncabezados(h.filas, {
            inspector: ["inspector", "tecnico", "técnico"],
            actividad: ["reporte", "actividad"]
        });
        if (!enc) continue;
        // si existen REPORTE y ACTIVIDAD, la específica es REPORTE
        const cReporte = enc.nombres.indexOf("reporte");
        if (cReporte >= 0) enc.cols.actividad = cReporte;
        enc.cols.area = enc.nombres.findIndex(v => /^area( de trabajo)?$/.test(v));
        enc.cols.fecha = enc.nombres.findIndex(v => /^fecha/.test(v));
        enc.cols.quincena = enc.nombres.indexOf("periodo");
        detalle = { hoja: h, enc };
        break;
    }
    if (!detalle) return null;

    const { hoja, enc } = detalle;
    const porInspector = new Map();
    const conteoMeses = new Map();
    let filasLeidas = 0, sinInspector = 0;
    for (let r = enc.fila + 1; r < hoja.filas.length; r++) {
        const f = hoja.filas[r] || [];
        const inspector = textoCelda(f[enc.cols.inspector]);
        const actividad = textoCelda(f[enc.cols.actividad]);
        if (!inspector && !actividad) continue;
        if (normalizar(inspector) === "inspector") continue;       // encabezado repetido
        if (!inspector) { sinInspector++; continue; }              // filas sueltas sin técnico
        filasLeidas++;
        const clave = normalizar(inspector);
        if (!porInspector.has(clave)) porInspector.set(clave, { nombre: inspector, actividades: new Map(), total: 0, sinActividad: 0 });
        const ins = porInspector.get(clave);
        ins.total++;
        if (!actividad) { ins.sinActividad++; continue; }
        const claveAct = normalizar(actividad);
        if (!ins.actividades.has(claveAct)) ins.actividades.set(claveAct, { nombre: actividad.toUpperCase(), cantidad: 0, areas: {} });
        const act = ins.actividades.get(claveAct);
        act.cantidad++;
        if (enc.cols.area >= 0) {
            const area = textoCelda(f[enc.cols.area]) || "—";
            act.areas[area] = (act.areas[area] || 0) + 1;
        }
        if (enc.cols.fecha >= 0) {
            const p = detectarPeriodo(f[enc.cols.fecha]);
            if (p) conteoMeses.set(p, (conteoMeses.get(p) || 0) + 1);
        }
    }

    // período = el mes que más se repite en las fechas de las órdenes
    let periodo = null, max = 0;
    conteoMeses.forEach((n, p) => { if (n > max) { max = n; periodo = p; } });

    return {
        hoja: hoja.nombre, filaEncabezado: enc.fila + 1, filasLeidas, sinInspector, periodo,
        inspectores: [...porInspector.values()].map(i => ({
            nombre: i.nombre, total: i.total, sinActividad: i.sinActividad,
            actividades: [...i.actividades.values()]
        })).sort((a, b) => b.total - a.total)
    };
}

/* "Resumen Total": total de órdenes por técnico, para cuadrar. */
function leerTotalesDeclarados(hojas) {
    const totales = {};
    for (const h of hojas) {
        const enc = buscarEncabezados(h.filas, { tecnico: ["tecnico", "técnico", "inspector"] });
        if (!enc) continue;
        // columna "Total Orden(es)" puede estar en la fila del encabezado o una arriba
        let colTotal = -1;
        for (const r of [enc.fila, enc.fila - 1, enc.fila - 2]) {
            if (r < 0) continue;
            const c = (h.filas[r] || []).findIndex(v => /^total ordene?s?$/.test(normalizar(textoCelda(v))));
            if (c >= 0) { colTotal = c; break; }
        }
        if (colTotal < 0) continue;
        for (let r = enc.fila + 1; r < h.filas.length; r++) {
            const f = h.filas[r] || [];
            const nombre = textoCelda(f[enc.cols.tecnico]);
            if (!nombre || /^total/.test(normalizar(nombre))) continue;
            if (esNumero(f[colTotal])) totales[normalizar(nombre)] = { total: f[colTotal], hoja: h.nombre, fila: r + 1 };
        }
        if (Object.keys(totales).length) break;
    }
    return totales;
}

function leerPenalizaciones(hojas) {
    const res = {};
    for (const h of hojas) {
        // la hoja de penalizaciones trae TÉCNICO, MOTIVO y MONTO (Resumen Total también
        // tiene "Monto", pero de producción: por eso se exige MOTIVO)
        const enc = buscarEncabezados(h.filas, { tecnico: ["tecnico", "técnico"], motivo: ["motivo", "concepto", "descripcion"], monto: ["monto"] });
        if (!enc) continue;
        enc.cols.fecha = enc.nombres.indexOf("fecha");
        for (let r = enc.fila + 1; r < h.filas.length; r++) {
            const f = h.filas[r] || [];
            const nombre = textoCelda(f[enc.cols.tecnico]);
            const monto = f[enc.cols.monto];
            if (!nombre || !esNumero(monto)) continue;
            const k = normalizar(nombre);
            if (!res[k]) res[k] = { total: 0, detalle: [] };
            res[k].total = redondear2(res[k].total + monto);
            res[k].detalle.push({
                fila: r + 1, monto: redondear2(monto),
                motivo: enc.cols.motivo >= 0 ? textoCelda(f[enc.cols.motivo]).slice(0, 160) : "",
                fecha: enc.cols.fecha >= 0 ? textoCelda(f[enc.cols.fecha]) : ""
            });
        }
        if (Object.keys(res).length) break;
    }
    return res;
}

function leerEmergencias(hojas) {
    const res = {};
    for (const h of hojas) {
        const enc = buscarEncabezados(h.filas, { atendio: ["atendio", "atendió"] });
        if (!enc) continue;
        for (let r = enc.fila + 1; r < h.filas.length; r++) {
            const nombre = textoCelda((h.filas[r] || [])[enc.cols.atendio]);
            if (!nombre) continue;
            const k = normalizar(nombre);
            res[k] = (res[k] || 0) + 1;
        }
        if (Object.keys(res).length) break;
    }
    return res;
}

/* Período escrito en un título, ej. "Correspondiente al mes de Septiembre 2026". */
function periodoDeTitulos(hojas) {
    for (const h of hojas) {
        for (const f of h.filas.slice(0, 12)) {
            for (const v of f || []) {
                if (typeof v !== "string") continue;
                if (!MESES.some(m => normalizar(v).includes(m))) continue;
                const p = detectarPeriodo(v);
                if (p) return p;
            }
        }
    }
    return null;
}

/* ============================================================
   FORMATO 2: resumen de un solo inspector
   ============================================================ */
function encontrarEncabezadoResumen(filas) {
    for (let r = 0; r < filas.length; r++) {
        const fila = filas[r] || [];
        const colActividad = fila.findIndex(v => ENCABEZADOS_ACTIVIDAD.includes(normalizar(textoCelda(v))));
        if (colActividad < 0) continue;

        // El nombre de cada columna puede estar en esta fila o hasta 2 arriba
        // (tablas dinámicas: "Areas" arriba y 1, 2, 4, 5 abajo).
        const etiqueta = c => {
            for (const k of [r, r - 1, r - 2]) {
                if (k < 0) continue;
                const t = textoCelda((filas[k] || [])[c]);
                if (t && !/^\d+$/.test(t)) return t;
            }
            return "";
        };
        const ancho = Math.max(...[r, r - 1, r - 2].filter(k => k >= 0).map(k => (filas[k] || []).length));
        const cols = [];
        for (let c = colActividad + 1; c < ancho; c++) cols.push({ c, etiqueta: normalizar(etiqueta(c)) });
        const prioridad = [/^total (areas?|ordene?s?)$/, /^(cantidad|ordenes|total ordenes|cuenta de|count of)/, /^areas?\b/, /^total$/];
        let colCantidad = -1;
        for (const p of prioridad) {
            const x = cols.find(k => p.test(k.etiqueta));
            if (x) { colCantidad = x.c; break; }
        }
        if (colCantidad < 0) {
            for (let c = colActividad + 1; c < ancho + 3 && colCantidad < 0; c++) {
                if (filas.slice(r + 1, r + 8).some(f => f && esNumero(f[c]))) colCantidad = c;
            }
        }
        return { filaEncabezado: r, colActividad, colCantidad, etiquetaCantidad: colCantidad >= 0 ? etiqueta(colCantidad) : null };
    }
    return null;
}

function leerResumenInspector(h) {
    const filas = h.filas;
    const enc = encontrarEncabezadoResumen(filas);
    const inspector = buscarEtiqueta(filas, /^inspector\b/);
    const etiquetaPeriodo = buscarEtiqueta(filas, /^(periodo|mes|fecha|fecha del reporte|mes reportado)\b/);
    const resultado = {
        hoja: h.nombre,
        inspector: inspector ? textoCelda(inspector.valor) : null,
        filaInspector: inspector ? inspector.fila : null,
        periodo: etiquetaPeriodo ? detectarPeriodo(etiquetaPeriodo.valor) : null,
        encabezadoEncontrado: !!enc,
        columnaCantidad: null, areas: null, actividades: [],
        totalDeclarado: null, filaTotal: null, columnasExtra: []
    };
    if (!enc) return resultado;

    const encabezados = filas[enc.filaEncabezado] || [];
    resultado.columnaCantidad = enc.colCantidad >= 0 ? (enc.etiquetaCantidad || `Columna ${enc.colCantidad + 1}`) : null;
    const areas = resultado.columnaCantidad && resultado.columnaCantidad.match(/areas?\s*:\s*(\d+)/i);
    resultado.areas = areas ? Number(areas[1]) : null;

    const extras = [];
    encabezados.forEach((v, c) => {
        if (c === enc.colActividad || c === enc.colCantidad) return;
        const t = textoCelda(v);
        if (t && !/^\d+$/.test(t)) extras.push({ col: c, nombre: t });
    });
    resultado.columnasExtra = extras.map(e => e.nombre);

    for (let r = enc.filaEncabezado + 1; r < filas.length; r++) {
        const fila = filas[r] || [];
        const actividad = textoCelda(fila[enc.colActividad]);
        const crudo = enc.colCantidad >= 0 ? fila[enc.colCantidad] : null;
        const vacia = !actividad && (crudo === null || textoCelda(crudo) === "") && extras.every(e => textoCelda(fila[e.col]) === "");
        if (vacia) continue;
        if (["total general", "grand total", "total"].includes(normalizar(actividad))) {
            resultado.totalDeclarado = crudo;
            resultado.filaTotal = r + 1;
            break;
        }
        const extrasFila = {};
        extras.forEach(e => { if (textoCelda(fila[e.col]) !== "") extrasFila[e.nombre] = fila[e.col]; });
        resultado.actividades.push({
            fila: r + 1, nombre: actividad,
            cantidadCruda: crudo === undefined ? null : crudo,
            extras: Object.keys(extrasFila).length ? extrasFila : undefined
        });
    }
    return resultado;
}

/* ============================================================
   Entrada principal
   ============================================================ */
function leerReporteEEGSA(buffer, nombreArchivo = "") {
    if (!buffer || !buffer.length) throw new ErrorArchivo("El archivo está vacío.");
    const esZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
    const esOle = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
    if (!esZip && !esOle) throw new ErrorArchivo("El contenido no corresponde a un archivo de Excel (.xlsx o .xls).");

    let libro;
    try {
        libro = XLSX.read(buffer, { type: "buffer", dense: true, cellDates: true, cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false });
    } catch (error) {
        throw new ErrorArchivo("No se pudo leer el archivo. Verifica que sea un Excel (.xlsx o .xls) válido y que no esté dañado.");
    }
    if (!libro.SheetNames.length) throw new ErrorArchivo("El archivo no tiene hojas.");

    const hojas = libro.SheetNames.map(nombre => ({ nombre, filas: filasDeHoja(libro.Sheets[nombre]) }));
    if (!hojas.some(h => h.filas.some(f => f && f.some(v => v !== null && textoCelda(v) !== "")))) {
        throw new ErrorArchivo("El archivo está vacío: no tiene datos en ninguna hoja.");
    }
    const periodoNombre = detectarPeriodo(String(nombreArchivo).replace(/[_\-.]+/g, " "));

    // ---------- formato 1: facturación con detalle de órdenes ----------
    const detalle = leerDetalle(hojas);
    if (detalle && detalle.inspectores.length) {
        const periodoTitulo = periodoDeTitulos(hojas);
        return {
            formato: "detalle",
            hojaDetalle: detalle.hoja,
            filasLeidas: detalle.filasLeidas,
            filasSinInspector: detalle.sinInspector,
            periodo: periodoTitulo || detalle.periodo || periodoNombre,
            origenPeriodo: periodoTitulo ? "archivo" : (detalle.periodo ? "fechas" : (periodoNombre ? "nombre_archivo" : null)),
            inspectores: detalle.inspectores,
            totales: leerTotalesDeclarados(hojas),
            penalizaciones: leerPenalizaciones(hojas),
            emergencias: leerEmergencias(hojas)
        };
    }

    // ---------- formato 2: resumen de un inspector ----------
    let elegida = null;
    for (const h of hojas) {
        const r = leerResumenInspector(h);
        if (r.encabezadoEncontrado && (!elegida || (r.inspector && !elegida.inspector))) elegida = r;
        if (r.encabezadoEncontrado && r.inspector) break;
    }
    if (!elegida) elegida = leerResumenInspector(hojas[0]);
    let periodo = elegida.periodo, origenPeriodo = periodo ? "archivo" : null;
    if (!periodo) { periodo = periodoDeTitulos(hojas); if (periodo) origenPeriodo = "archivo"; }
    if (!periodo && periodoNombre) { periodo = periodoNombre; origenPeriodo = "nombre_archivo"; }
    return { formato: "simple", ...elegida, periodo, origenPeriodo };
}

/* Convierte el libro en la "lectura" de UN técnico (lo que valida el paso 2). */
function lecturaParaInspector(libro, nombreInspector) {
    if (libro.formato !== "detalle") return libro;
    const clave = normalizar(nombreInspector);
    const ins = libro.inspectores.find(i => normalizar(i.nombre) === clave);
    if (!ins) throw new ErrorArchivo(`El técnico "${nombreInspector}" no aparece en el archivo.`);

    const areasPresentes = new Set();
    ins.actividades.forEach(a => Object.keys(a.areas).forEach(x => areasPresentes.add(x)));
    const columnasAreas = [...areasPresentes].sort((a, b) => (Number(a) || 99) - (Number(b) || 99));

    const ordenadas = [...ins.actividades].sort((a, b) => posicionOficial(a.nombre) - posicionOficial(b.nombre));
    const actividades = ordenadas.map((a, i) => ({
        fila: null, orden: i + 1, nombre: a.nombre, cantidadCruda: a.cantidad,
        areas: a.areas
    }));
    const emergencias = libro.emergencias[clave] || 0;
    if (emergencias) actividades.push({ fila: null, nombre: ACTIVIDAD_EMERGENCIAS, cantidadCruda: emergencias, deHoja: "Emergencias" });

    const declarado = libro.totales[clave];
    return {
        formato: "detalle",
        hoja: libro.hojaDetalle,
        inspector: ins.nombre,
        filaInspector: null,
        periodo: libro.periodo,
        origenPeriodo: libro.origenPeriodo,
        encabezadoEncontrado: true,
        columnaCantidad: "Total órdenes",
        columnasAreas,
        areas: columnasAreas.length ? columnasAreas.join(", ") : null,
        actividades,
        // el total de "Resumen Total" se compara contra las órdenes (sin emergencias)
        totalDeclarado: declarado ? declarado.total + emergencias : null,
        filaTotal: declarado ? declarado.fila : null,
        hojaTotal: declarado ? declarado.hoja : null,
        ordenesSinActividad: ins.sinActividad,
        columnasExtra: [],
        penalizaciones: libro.penalizaciones[clave] || null
    };
}

/* Lista corta de técnicos del archivo (para escoger en pantalla). */
function resumenInspectores(libro) {
    if (libro.formato !== "detalle") return [];
    return libro.inspectores.map(i => ({
        nombre: i.nombre, ordenes: i.total,
        penalizaciones: (libro.penalizaciones[normalizar(i.nombre)] || {}).total || 0,
        emergencias: libro.emergencias[normalizar(i.nombre)] || 0
    }));
}

module.exports = { leerReporteEEGSA, lecturaParaInspector, resumenInspectores, detectarPeriodo, ErrorArchivo, redondear2, ACTIVIDAD_EMERGENCIAS };
