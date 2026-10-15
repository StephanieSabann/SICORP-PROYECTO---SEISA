const U = require("./util");

/* ============================================================
   Gráficas de cada REPORTE DETALLADO
   ------------------------------------------------------------
   Se calculan sobre las MISMAS filas ya filtradas de la tabla:
   si cambias un filtro o la búsqueda, cambian la tabla y estas
   gráficas a la vez. Cada reporte devuelve una lista de gráficas
   con el mismo formato que las de los dashboards (tipo, datos…).
   ============================================================ */

const PALETA = ["#3FB6E8", "#1E7BFF", "#22D3EE", "#18BE2D", "#F59E0B", "#E3453F", "#A855F7", "#EC4899", "#14B8A6", "#6B7886"];
const VERDE = "#18BE2D", ROJO = "#E3453F", NARANJA = "#F59E0B", GRIS = "#6B7886";
const COLOR_ESTADO = { activo: VERDE, inactivo: GRIS, aprobado: VERDE, aprobada: VERDE, pendiente: NARANJA, rechazado: ROJO, vencida: ROJO, "en plazo": VERDE, "sin fecha": GRIS, agotado: ROJO, "stock bajo": NARANJA, disponible: VERDE, "en revision": NARANJA, "en preparacion": GRIS };
const colorEstado = (t, i = 0) => COLOR_ESTADO[U.normalizar(t)] || PALETA[i % PALETA.length];

const tabla = (columnas, filas) => ({ columnas, filas });
const conPct = datos => { const t = datos.reduce((s, d) => s + d.valor, 0); return datos.map(d => ({ ...d, pct: U.porcentaje(d.valor, t) })); };

/* Agrupa filas por un campo; suma "valor" (campo numérico) o cuenta si no se indica. */
function agrupar(filas, campo, { suma = null, orden = "valor", top = null, color = null, vacio = "Sin dato" } = {}) {
    const m = new Map();
    filas.forEach(f => { const k = (typeof campo === "function" ? campo(f) : f[campo]) || vacio; m.set(k, (m.get(k) || 0) + (suma ? Number(f[suma]) || 0 : 1)); });
    let lista = [...m.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor: suma ? Math.round(valor * 100) / 100 : valor }));
    lista.sort(orden === "etiqueta" ? (a, b) => String(a.etiqueta).localeCompare(String(b.etiqueta)) : (a, b) => b.valor - a.valor || String(a.etiqueta).localeCompare(String(b.etiqueta)));
    if (top && lista.length > top) { const resto = lista.slice(top).reduce((s, x) => s + x.valor, 0); lista = [...lista.slice(0, top), { etiqueta: "Otros", valor: resto }]; }
    return lista.map((x, i) => ({ ...x, color: color ? color(x.etiqueta, i) : PALETA[i % PALETA.length] }));
}

const donut = (id, titulo, datos, sub, etiquetaTabla) => ({
    id, titulo, tipo: "donut", datos, centro: { valor: String(datos.reduce((s, d) => s + d.valor, 0)), sub },
    tabla: tabla([{ campo: "etiqueta", titulo: etiquetaTabla || titulo }, { campo: "valor", titulo: "Cantidad", tipo: "entero" }, { campo: "pct", titulo: "%", tipo: "decimal" }], conPct(datos))
});
const barrasH = (id, titulo, datos, formato, etiquetaTabla, tituloValor) => ({
    id, titulo, tipo: "barrasH", datos, formato,
    tabla: tabla([{ campo: "etiqueta", titulo: etiquetaTabla || titulo }, { campo: "valor", titulo: tituloValor || "Total", tipo: formato === "moneda" ? "moneda" : "entero" }], datos)
});
const barrasV = (id, titulo, etiquetas, valores, { color = "#22D3EE", colores, nombre = "Total", formato = "entero", etiquetaTabla = "Período" } = {}) => ({
    id, titulo, tipo: "barrasV", etiquetas, valores, color, colores, nombreSerie: nombre, formato,
    tabla: tabla([{ campo: "etiqueta", titulo: etiquetaTabla }, { campo: "valor", titulo: nombre, tipo: formato === "moneda" ? "moneda" : "entero" }], etiquetas.map((e, i) => ({ etiqueta: e, valor: valores[i] })))
});
const medidor = (id, titulo, pct, detalle, sub, color) => ({ id, titulo, tipo: "medidor", valor: pct, texto: `${Math.round(pct * 10) / 10}%`, sub, detalle, color, meta: 100, tabla: tabla([{ campo: "etiqueta", titulo: "Indicador" }, { campo: "valor", titulo: "Valor" }], [{ etiqueta: titulo, valor: `${Math.round(pct * 10) / 10}%` }]) });

function porMes(filas, campoFecha, { suma = null } = {}) {
    const meses = [...new Set(filas.map(f => U.periodoDeFecha(f[campoFecha])).filter(Boolean))].sort();
    const valores = meses.map(m => { const l = filas.filter(f => U.periodoDeFecha(f[campoFecha]) === m); return suma ? Math.round(l.reduce((s, f) => s + (Number(f[suma]) || 0), 0) * 100) / 100 : l.length; });
    return { meses, valores };
}
function rangos(filas, campo, cortes, { sinDato = "Sin dato" } = {}) {
    const vals = cortes.map(() => 0); let sin = 0;
    filas.forEach(f => { const v = f[campo]; if (v === null || v === undefined || v === "") { sin++; return; } const i = cortes.findIndex(([, d, h]) => v >= d && v <= h); if (i >= 0) vals[i]++; });
    const etiquetas = cortes.map(x => x[0]);
    if (sin) { etiquetas.push(sinDato); vals.push(sin); }
    return { etiquetas, valores: vals };
}

const R = {
    empleados_activos: filas => {
        const a = rangos(filas, "antiguedad", [["Menos de 1 año", 0, 0], ["1-3 años", 1, 3], ["4-6 años", 4, 6], ["7 años o más", 7, 200]], { sinDato: "Sin fecha" });
        return [
            donut("puesto", "Por puesto", agrupar(filas, "puesto", { color: (_, i) => PALETA[i % PALETA.length] }), "empleados", "Puesto"),
            barrasH("tipo", "Por tipo de empleado", agrupar(filas, "tipo", { color: (_, i) => PALETA[(i + 2) % PALETA.length] }), "entero", "Tipo", "Empleados"),
            barrasV("antiguedad", "Antigüedad", a.etiquetas, a.valores, { color: "#A855F7", nombre: "Empleados", etiquetaTabla: "Rango" })
        ];
    },
    expedientes_laborales: filas => {
        const completos = filas.filter(f => f.completitud === 100).length;
        const prom = filas.length ? filas.reduce((s, f) => s + f.completitud, 0) / filas.length : 0;
        const faltan = new Map();
        filas.forEach(f => String(f.faltantes || "").split(",").map(x => x.trim()).filter(Boolean).forEach(x => faltan.set(x, (faltan.get(x) || 0) + 1)));
        const datosFaltan = [...faltan.entries()].sort((a, b) => b[1] - a[1]).map(([etiqueta, valor]) => ({ etiqueta, valor, color: NARANJA }));
        return [
            medidor("promedio", "Completitud promedio", prom, `${completos} de ${filas.length} expedientes completos`, "completitud", prom >= 90 ? VERDE : prom >= 60 ? NARANJA : ROJO),
            donut("estado", "Completos e incompletos", [{ etiqueta: "Completos", valor: completos, color: VERDE }, { etiqueta: "Incompletos", valor: filas.length - completos, color: NARANJA }], "expedientes", "Expediente"),
            barrasH("faltantes", "Datos que más faltan", datosFaltan, "entero", "Dato", "Empleados sin él")
        ];
    },
    empleados_permisos: filas => {
        const m = porMes(filas, "desde");
        return [
            donut("estado", "Por estado", agrupar(filas, "estado", { color: colorEstado }), "permisos", "Estado"),
            barrasH("tipo", "Días por tipo de permiso", agrupar(filas, "tipo", { suma: "dias" }), "entero", "Tipo", "Días"),
            barrasV("mes", "Permisos por mes", m.meses.map(x => U.mesCorto(x)), m.valores, { color: NARANJA, nombre: "Permisos", etiquetaTabla: "Mes" }),
            barrasH("empleado", "Empleados con más días", agrupar(filas, "empleado", { suma: "dias", top: 6, color: () => "#3FB6E8" }), "entero", "Empleado", "Días")
        ];
    },
    inventario_existencias: filas => {
        const porCat = [...new Set(filas.map(f => f.categoria))];
        return [
            donut("alerta", "Estado del stock", agrupar(filas, "alerta", { color: colorEstado }), "recursos", "Estado"),
            barrasH("top", "Recursos con más existencias", agrupar(filas, "recurso", { suma: "total", top: 7, color: () => "#3FB6E8" }), "entero", "Recurso", "Unidades"),
            { id: "disp", titulo: "Disponibles y asignadas por categoría", tipo: "apiladas", etiquetas: porCat, formato: "entero",
              series: [{ nombre: "Disponibles", color: VERDE, valores: porCat.map(c => filas.filter(f => f.categoria === c).reduce((s, f) => s + f.disponible, 0)) }, { nombre: "Asignadas", color: "#1E7BFF", valores: porCat.map(c => filas.filter(f => f.categoria === c).reduce((s, f) => s + f.asignado, 0)) }],
              tabla: tabla([{ campo: "etiqueta", titulo: "Categoría" }, { campo: "d", titulo: "Disponibles", tipo: "entero" }, { campo: "a", titulo: "Asignadas", tipo: "entero" }], porCat.map(c => ({ etiqueta: c, d: filas.filter(f => f.categoria === c).reduce((s, f) => s + f.disponible, 0), a: filas.filter(f => f.categoria === c).reduce((s, f) => s + f.asignado, 0) }))) },
            barrasH("valor", "Valor documentado por categoría", agrupar(filas, "categoria", { suma: "valor" }), "moneda", "Categoría", "Valor")
        ];
    },
    inventario_movimientos: filas => {
        const m = porMes(filas, "fecha"); // normalmente un solo mes: se muestra por día
        const dias = [...new Set(filas.map(f => f.fecha))].sort();
        const valoresDia = dias.map(d => filas.filter(f => f.fecha === d).reduce((s, f) => s + f.cantidad, 0));
        return [
            donut("tipo", "Por tipo de movimiento", agrupar(filas, "tipo", { color: (t, i) => ({ Entrada: VERDE, Entrega: "#1E7BFF", "Devolución": "#22D3EE", Ajuste: NARANJA })[t] || PALETA[i] }), "movimientos", "Movimiento"),
            { id: "dia", titulo: "Unidades movidas por día", tipo: "area", etiquetas: dias.map(d => d.slice(8) + "/" + d.slice(5, 7)), series: [{ nombre: "Unidades", valores: valoresDia, color: "#3FB6E8" }], formato: "entero",
              tabla: tabla([{ campo: "etiqueta", titulo: "Día" }, { campo: "valor", titulo: "Unidades", tipo: "entero" }], dias.map((d, i) => ({ etiqueta: d, valor: valoresDia[i] }))) },
            barrasH("categoria", "Unidades por categoría", agrupar(filas, "categoria", { suma: "cantidad", color: (_, i) => PALETA[(i + 4) % PALETA.length] }), "entero", "Categoría", "Unidades"),
            donut("condicion", "Condición al devolver", agrupar(filas.filter(f => f.condicion), "condicion", { color: (c, i) => ({ "Buen estado": VERDE, "Dañado": NARANJA, "Perdido": ROJO, "Incompleto": "#A855F7" })[c] || PALETA[i] }), "devoluciones", "Condición")
        ];
    },
    inventario_entregas_pendientes: filas => {
        const r = rangos(filas, "dias_retraso", [["Al día", 0, 0], ["1-7 días", 1, 7], ["8-30 días", 8, 30], ["Más de 30", 31, 9999]], { sinDato: "Sin fecha" });
        return [
            donut("estado", "Por estado", agrupar(filas, "estado", { color: colorEstado }), "entregas", "Estado"),
            barrasH("empleado", "Unidades por empleado", agrupar(filas, "empleado", { suma: "cantidad", top: 7, color: () => NARANJA }), "entero", "Empleado", "Unidades"),
            barrasV("retraso", "Días de retraso", r.etiquetas, r.valores, { color: ROJO, nombre: "Entregas", etiquetaTabla: "Retraso" })
        ];
    },
    nominas_planilla: filas => [
        donut("estado", "Estado de las nóminas", agrupar(filas, "estado", { color: colorEstado }), "nóminas", "Estado"),
        barrasH("tipo", "Líquido por tipo de nómina", agrupar(filas.filter(f => f.liquido !== null), "tipo", { suma: "liquido" }), "moneda", "Tipo", "Líquido"),
        barrasH("descuentos", "Empleados con más descuentos", agrupar(filas.filter(f => f.descuentos), "empleado", { suma: "descuentos", top: 7, color: () => ROJO }), "moneda", "Empleado", "Descuentos"),
        { id: "composicion", titulo: "Ingresos, descuentos y líquido", tipo: "barrasV", etiquetas: ["Ingresos", "Bonificaciones", "Descuentos", "Líquido"], formato: "moneda", nombreSerie: "Total", colores: ["#3FB6E8", VERDE, ROJO, "#22D3EE"],
          valores: ["bruto", "bonificaciones", "descuentos", "liquido"].map(k => Math.round(filas.reduce((s, f) => s + (Number(f[k]) || 0), 0) * 100) / 100),
          tabla: tabla([{ campo: "etiqueta", titulo: "Concepto" }, { campo: "valor", titulo: "Total", tipo: "moneda" }], ["Ingresos", "Bonificaciones", "Descuentos", "Líquido"].map((e, i) => ({ etiqueta: e, valor: Math.round(filas.reduce((s, f) => s + (Number(f[["bruto", "bonificaciones", "descuentos", "liquido"][i]]) || 0), 0) * 100) / 100 }))) }
    ],
    nominas_historial: filas => {
        const periodos = [...new Set(filas.map(f => f.periodo))].sort();
        const sumaP = campo => periodos.map(p => Math.round(filas.filter(f => f.periodo === p).reduce((s, f) => s + (Number(f[campo]) || 0), 0) * 100) / 100);
        const liquido = sumaP("liquido"), desc = sumaP("descuentos");
        return [
            { id: "tendencia", titulo: "Líquido y descuentos por mes", tipo: "area", etiquetas: periodos.map(p => U.mesCorto(p)), formato: "moneda",
              series: [{ nombre: "Líquido", valores: liquido, color: "#3FB6E8" }, { nombre: "Descuentos", valores: desc, color: ROJO }],
              tabla: tabla([{ campo: "etiqueta", titulo: "Período" }, { campo: "l", titulo: "Líquido", tipo: "moneda" }, { campo: "d", titulo: "Descuentos", tipo: "moneda" }], periodos.map((p, i) => ({ etiqueta: U.nombrePeriodo(p), l: liquido[i], d: desc[i] }))) },
            barrasH("tipo", "Líquido por tipo de nómina", agrupar(filas, "tipo", { suma: "liquido" }), "moneda", "Tipo", "Líquido"),
            donut("pago", "Forma de pago", agrupar(filas, "forma_pago", { vacio: "Sin definir" }), "pagos", "Forma de pago"),
            barrasV("cantidad", "Comprobantes por mes", periodos.map(p => U.mesCorto(p)), periodos.map(p => filas.filter(f => f.periodo === p).length), { color: VERDE, nombre: "Comprobantes", etiquetaTabla: "Mes" })
        ];
    }
};

module.exports = { graficasDeFilas: (clave, filas) => (R[clave] ? R[clave](filas) : []), agrupar };
