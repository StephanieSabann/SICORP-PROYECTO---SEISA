const XLSX = require("xlsx");
const U = require("./util");

/* ============================================================
   Exportación a Excel (.xlsx) y CSV
   ------------------------------------------------------------
   Todo sale con tipos reales (números, fechas, moneda) para que
   en Excel se pueda ordenar, filtrar y sumar sin convertir nada.
   ============================================================ */

const FORMATO_Q = '"Q"#,##0.00';
const FORMATO_ENTERO = "#,##0";
const FORMATO_DECIMAL = "#,##0.0";

function nombreHoja(texto, usados) {
    let base = String(texto || "Hoja").replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Hoja";
    let nombre = base, i = 2;
    while (usados.has(nombre.toLowerCase())) nombre = `${base.slice(0, 25)} ${i++}`;
    usados.add(nombre.toLowerCase());
    return nombre;
}

function aFecha(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)));
}

/* Hoja de tabla: encabezado + filas (+ fila de totales) con formato por tipo de columna. */
function hojaTabla(columnas, filas, { totales = [] } = {}) {
    const aoa = [columnas.map(c => c.titulo)];
    filas.forEach(f => aoa.push(columnas.map(c => {
        const v = f[c.campo];
        if (v === null || v === undefined || v === "") return null;
        if (c.tipo === "fecha" || c.tipo === "fechahora") return aFecha(v) || v;
        return v;
    })));
    let filaTotales = null;
    if (totales.length && filas.length) {
        filaTotales = columnas.map((c, i) => i === 0 ? "TOTAL" : totales.includes(c.campo) ? U.redondear2(filas.reduce((s, f) => s + (Number(f[c.campo]) || 0), 0)) : null);
        aoa.push(filaTotales);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    const rango = XLSX.utils.decode_range(ws["!ref"] || "A1");
    columnas.forEach((c, ci) => {
        for (let r = 1; r <= rango.e.r; r++) {
            const celda = ws[XLSX.utils.encode_cell({ r, c: ci })];
            if (!celda) continue;
            if (c.tipo === "moneda") celda.z = FORMATO_Q;
            else if (c.tipo === "entero") celda.z = FORMATO_ENTERO;
            else if (c.tipo === "decimal") celda.z = FORMATO_DECIMAL;
            else if (c.tipo === "fecha") celda.z = "dd/mm/yyyy";
            else if (c.tipo === "fechahora") celda.z = "dd/mm/yyyy hh:mm";
        }
    });
    ws["!cols"] = columnas.map((c, ci) => {
        let max = String(c.titulo).length;
        filas.forEach(f => { const v = f[c.campo]; if (v !== null && v !== undefined) max = Math.max(max, String(v).length); });
        return { wch: Math.min(48, Math.max(c.tipo === "moneda" ? 14 : 8, max + 2)) };
    });
    if (filas.length) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: columnas.length - 1 } }) };
    return ws;
}

function hojaInformacion(titulo, pares) {
    const aoa = [[titulo], [], ...pares.map(([k, v]) => [k, v])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 26 }, { wch: 60 }];
    return ws;
}

const aBuffer = wb => XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellDates: true });

/* meta: { usuario, fecha:Date, periodoNombre, filtrosTexto } */
function excelDeTabla(def, filas, meta) {
    const wb = XLSX.utils.book_new();
    const usados = new Set();
    XLSX.utils.book_append_sheet(wb, hojaTabla(def.columnas, filas, { totales: def.totales }), nombreHoja(def.subtitulo || def.titulo, usados));
    XLSX.utils.book_append_sheet(wb, hojaInformacion(`${def.titulo} — ${def.subtitulo}`, [
        ["Sistema", "SICORP — SEISA"],
        ["Reporte", `${def.titulo} — ${def.subtitulo}`],
        ...(def.conPeriodo ? [["Período", meta.periodoNombre]] : []),
        ["Filtros", meta.filtrosTexto || "Ninguno"],
        ["Filas", filas.length],
        ["Generado por", meta.usuario || "—"],
        ["Fecha de generación", U.aISOHora(meta.fecha) || ""]
    ]), nombreHoja("Información", usados));
    return aBuffer(wb);
}

/* Dashboard completo: hoja "Resumen" con los indicadores y una hoja por cada gráfica. */
function excelDeDashboard(dashboard, titulo, meta) {
    const wb = XLSX.utils.book_new();
    const usados = new Set();
    const kpis = (dashboard.kpis || []).concat(dashboard.salud || []).map(k => ({
        indicador: k.titulo, valor: k.valor, formato: k.formato || "entero",
        variacion: k.variacion && k.variacion.pct !== null && k.variacion.pct !== undefined ? k.variacion.pct : null, nota: k.nota || ""
    }));
    const hojaResumen = hojaTabla([
        { campo: "indicador", titulo: "Indicador" }, { campo: "valor", titulo: "Valor", tipo: "decimal" },
        { campo: "variacion", titulo: "Variación vs. período anterior (%)", tipo: "decimal" }, { campo: "nota", titulo: "Nota" }], kpis);
    // las celdas de moneda y porcentaje se formatean según su indicador
    kpis.forEach((k, i) => {
        const c = hojaResumen[XLSX.utils.encode_cell({ r: i + 1, c: 1 })];
        if (!c) return;
        c.z = k.formato === "moneda" ? FORMATO_Q : k.formato === "pct" ? '0.0"%"' : FORMATO_ENTERO;
    });
    XLSX.utils.book_append_sheet(wb, hojaResumen, nombreHoja("Resumen", usados));
    (dashboard.tablas || []).forEach(t => XLSX.utils.book_append_sheet(wb, hojaTabla(t.columnas, t.filas), nombreHoja(t.nombre, usados)));
    if (dashboard.alertas && dashboard.alertas.length) {
        XLSX.utils.book_append_sheet(wb, hojaTabla([{ campo: "nivel", titulo: "Nivel" }, { campo: "texto", titulo: "Alerta" }], dashboard.alertas), nombreHoja("Alertas", usados));
    }
    XLSX.utils.book_append_sheet(wb, hojaInformacion(titulo, [
        ["Sistema", "SICORP — SEISA"], ["Dashboard", titulo], ["Período", dashboard.periodoNombre],
        ["Generado por", meta.usuario || "—"], ["Fecha de generación", U.aISOHora(meta.fecha) || ""]
    ]), nombreHoja("Información", usados));
    return aBuffer(wb);
}

/* CSV con BOM (Excel lo abre con acentos bien) y comillas dobles escapadas. */
function csvDeTabla(columnas, filas) {
    const esc = v => {
        if (v === null || v === undefined) return "";
        let s = String(v);
        if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = "'" + s; // evita fórmulas inyectadas
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lineas = [columnas.map(c => esc(c.titulo)).join(",")];
    filas.forEach(f => lineas.push(columnas.map(c => esc(f[c.campo])).join(",")));
    return Buffer.from("﻿" + lineas.join("\r\n") + "\r\n", "utf8");
}

const nombreArchivo = (base, ext, periodo) =>
    `${U.normalizar(base).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}${periodo ? "-" + periodo : ""}.${ext}`;

module.exports = { excelDeTabla, excelDeDashboard, csvDeTabla, nombreArchivo, hojaTabla };
