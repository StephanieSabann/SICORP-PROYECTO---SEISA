const U = require("./util");

/* ============================================================
   Agregadores: convierten los datos crudos de cada módulo en lo
   que dibuja cada dashboard. Son funciones PURAS (no tocan la
   base de datos ni el reloj), así se prueban fácil.
   Dinero: siempre en quetzales (número con 2 decimales).
   ============================================================ */

const COLORES = {
    tecnicos: "#1E7BFF", auxiliares: "#22D3EE", administrativos: "#E3453F",
    otros: "#A855F7", verde: "#18BE2D", naranja: "#F59E0B", gris: "#6B7886", azul: "#1E7BFF", cian: "#22D3EE", rojo: "#E3453F"
};
const COLOR_EXTRA = ["#A855F7", "#F59E0B", "#18BE2D", "#EC4899", "#14B8A6"];
const GRUPOS_FIJOS = ["Técnicos", "Auxiliares", "Administrativos"];
const colorDeGrupo = (g, i = 0) =>
    g === "Técnicos" ? COLORES.tecnicos : g === "Auxiliares" ? COLORES.auxiliares : g === "Administrativos" ? COLORES.administrativos : COLOR_EXTRA[i % COLOR_EXTRA.length];

/* ---------------------- clasificación del personal ---------------------- */
function grupoPersonal(e) {
    const t = e.tipo_empleado;
    if (t === "TECNICO_SOCIO" || t === "TECNICO_NO_SOCIO") return "Técnicos";
    if (t === "AUXILIAR") return "Auxiliares";
    if (t === "ADMINISTRATIVO") return "Administrativos";
    const p = U.normalizar(e.puesto);
    if (p.includes("tecnic")) return "Técnicos";
    if (p.includes("auxiliar")) return "Auxiliares";
    if (p.includes("administr")) return "Administrativos";
    return e.puesto ? String(e.puesto) : "Sin puesto";
}
const esTecnico = e => grupoPersonal(e) === "Técnicos";

/* Cuenta por grupo: siempre los 3 oficiales y, si hay más puestos, los 3 más grandes + "Otros". */
function contarGrupos(lista) {
    const cuenta = new Map(GRUPOS_FIJOS.map(g => [g, 0]));
    lista.forEach(e => { const g = grupoPersonal(e); cuenta.set(g, (cuenta.get(g) || 0) + 1); });
    const fijos = GRUPOS_FIJOS.map(g => ({ etiqueta: g, valor: cuenta.get(g), color: colorDeGrupo(g) }));
    const extras = [...cuenta.entries()].filter(([g]) => !GRUPOS_FIJOS.includes(g)).sort((a, b) => b[1] - a[1]);
    const visibles = extras.slice(0, 3).map(([g, v], i) => ({ etiqueta: g, valor: v, color: colorDeGrupo(g, i) }));
    const resto = extras.slice(3).reduce((s, [, v]) => s + v, 0);
    if (resto) visibles.push({ etiqueta: "Otros", valor: resto, color: COLORES.gris });
    return [...fijos, ...visibles];
}

function conPorcentaje(lista) {
    const total = lista.reduce((s, x) => s + x.valor, 0);
    return lista.map(x => ({ ...x, pct: U.porcentaje(x.valor, total) }));
}

const REQUERIDOS_EXPEDIENTE = [["dpi", "DPI"], ["nit", "NIT"], ["direccion", "dirección"], ["telefono", "teléfono"], ["email", "correo"], ["fecha_nacimiento", "nacimiento"], ["fecha_contratacion", "contratación"]];
/* Qué tan completo está el expediente de un empleado: { pct, faltan: [nombres] } */
function completitudExpediente(e) {
    const faltan = REQUERIDOS_EXPEDIENTE.filter(([c]) => !e[c] || (typeof e[c] === "string" && !e[c].trim())).map(([, n]) => n);
    return { pct: Math.round(((REQUERIDOS_EXPEDIENTE.length - faltan.length) / REQUERIDOS_EXPEDIENTE.length) * 100), faltan };
}

const alerta = (nivel, texto, extra = {}) => ({ nivel, texto, ...extra });
const ORDEN_NIVEL = { critico: 0, aviso: 1, info: 2, ok: 3 };
const ordenarAlertas = a => [...a].sort((x, y) => ORDEN_NIVEL[x.nivel] - ORDEN_NIVEL[y.nivel]);

/* ============================================================
   EMPLEADOS
   ============================================================ */
function antiguedadRangos(cortes) {
    const rangos = [];
    rangos.push({ etiqueta: `Menos de ${cortes[0]} ${cortes[0] === 1 ? "año" : "años"}`, desde: 0, hasta: cortes[0] - 1 });
    for (let i = 0; i < cortes.length - 1; i++) {
        const d = cortes[i], h = cortes[i + 1] - 1;
        rangos.push({ etiqueta: d === h ? `${d} ${d === 1 ? "año" : "años"}` : `${d}-${h} años`, desde: d, hasta: h });
    }
    const ult = cortes[cortes.length - 1];
    rangos.push({ etiqueta: `Más de ${ult - 1} ${ult - 1 === 1 ? "año" : "años"}`, desde: ult, hasta: Infinity });
    return rangos;
}

function dashboardEmpleados({ empleados, permisos = [] }, periodo, params, hoy) {
    const rango = U.rangoPeriodo(periodo);
    const referencia = hoy < rango.hasta ? hoy : rango.hasta;
    const registrados = empleados.filter(e => { const f = U.aISO(e.fecha_contratacion); return !f || f <= rango.hasta; });
    const activos = registrados.filter(e => e.activo);
    const inactivos = registrados.length - activos.length;

    const grupos = contarGrupos(activos);
    const gTec = grupos[0], gAux = grupos[1], gAdm = grupos[2];
    const otros = grupos.slice(3).reduce((s, g) => s + g.valor, 0);

    const altasMes = registrados.filter(e => U.periodoDeFecha(U.aISO(e.fecha_contratacion)) === periodo).length;
    const meses = U.ultimosPeriodos(periodo, params.meses_historial);
    const ingresos = {
        etiquetas: meses.map(U.mesCorto), periodos: meses,
        valores: meses.map(m => registrados.filter(e => U.periodoDeFecha(U.aISO(e.fecha_contratacion)) === m).length)
    };

    const rangos = antiguedadRangos(params.antiguedad_cortes);
    const antiguedad = rangos.map(r => ({ etiqueta: r.etiqueta, valor: 0 }));
    activos.forEach(e => {
        const f = U.aISO(e.fecha_contratacion);
        if (!f) return;
        const a = Math.max(0, U.aniosCumplidos(f, referencia));
        const i = rangos.findIndex(r => a >= r.desde && a <= r.hasta);
        if (i >= 0) antiguedad[i].valor++;
    });
    const sinFechaContratacion = activos.filter(e => !U.aISO(e.fecha_contratacion)).length;

    const pctActivos = U.porcentaje(activos.length, registrados.length);
    const permisosPend = permisos.filter(p => p.estado === null || p.estado === undefined).length;
    const tecnicosSinClasificar = activos.filter(e => esTecnico(e) && !e.tipo_empleado).length;
    const cumples = activos.filter(e => { const f = U.aISO(e.fecha_nacimiento); return f && f.slice(5, 7) === periodo.slice(5); }).length;

    const alertas = [];
    if (tecnicosSinClasificar) alertas.push(alerta("aviso", `${tecnicosSinClasificar} técnico${tecnicosSinClasificar === 1 ? "" : "s"} sin clasificar como socio o no socio: sin eso no se les puede generar la nómina.`, { reporte: "empleados_activos" }));
    if (permisosPend) alertas.push(alerta("aviso", `${permisosPend} permiso${permisosPend === 1 ? "" : "s"} pendiente${permisosPend === 1 ? "" : "s"} de aprobación.`, { reporte: "empleados_permisos", filtros: { estado: "pendiente" } }));
    if (sinFechaContratacion) alertas.push(alerta("info", `${sinFechaContratacion} empleado${sinFechaContratacion === 1 ? "" : "s"} activo${sinFechaContratacion === 1 ? "" : "s"} sin fecha de contratación (no entran en la antigüedad).`, { reporte: "expedientes_laborales" }));
    if (cumples) alertas.push(alerta("info", `${cumples} cumpleaños en ${U.nombreMes(periodo).toLowerCase()}.`));
    if (!alertas.length) alertas.push(alerta("ok", "Sin pendientes en el personal."));

    const kpis = [
        { clave: "activos", titulo: "Empleados activos", valor: activos.length, icono: "personas", tono: "azul", nota: altasMes ? `+${altasMes} ingreso${altasMes === 1 ? "" : "s"} en ${U.nombreMes(periodo).toLowerCase()}` : "" },
        { clave: "tecnicos", titulo: "Técnicos", valor: gTec.valor, icono: "tecnico", tono: "azul" },
        { clave: "auxiliares", titulo: "Auxiliares", valor: gAux.valor, icono: "auxiliar", tono: "cian" },
        { clave: "administrativos", titulo: "Administrativos", valor: gAdm.valor, icono: "maletin", tono: "rojo" }
    ];
    if (otros) kpis.push({ clave: "otros", titulo: "Otros puestos", valor: otros, icono: "maletin", tono: "azul" });

    return {
        seccion: "empleados", periodo, periodoNombre: U.nombrePeriodo(periodo),
        kpis,
        estado: { total: registrados.length, activos: activos.length, inactivos },
        puestos: grupos.filter(g => g.valor > 0 || GRUPOS_FIJOS.includes(g.etiqueta)),
        ingresos, antiguedad,
        composicion: conPorcentaje(grupos.filter(g => g.valor > 0)),
        alertas: ordenarAlertas(alertas),
        pie: { texto: `${pctActivos % 1 === 0 ? pctActivos.toFixed(0) : pctActivos}% del personal se encuentra activo`, enlace: "Ver reporte detallado", reporte: "empleados_activos", nivel: pctActivos >= 90 ? "ok" : "aviso" },
        tablas: [
            { nombre: "Personal por puesto", columnas: [{ campo: "etiqueta", titulo: "Puesto" }, { campo: "valor", titulo: "Activos", tipo: "entero" }, { campo: "pct", titulo: "% del personal", tipo: "decimal" }], filas: conPorcentaje(grupos.filter(g => g.valor > 0)) },
            { nombre: "Antigüedad", columnas: [{ campo: "etiqueta", titulo: "Rango" }, { campo: "valor", titulo: "Empleados", tipo: "entero" }], filas: antiguedad },
            { nombre: "Ingresos por mes", columnas: [{ campo: "periodo", titulo: "Período" }, { campo: "valor", titulo: "Ingresos", tipo: "entero" }], filas: meses.map((m, i) => ({ periodo: m, valor: ingresos.valores[i] })) }
        ]
    };
}

/* ============================================================
   INVENTARIO
   ============================================================ */
const TIPOS_MOV = ["Entrada", "Entrega", "Devolución", "Ajuste"];
const esPerdida = m => m.tipo === "Devolución" && ["Perdido", "Dañado", "Incompleto"].includes(m.condicion);

function resumenMovimientos(movs) {
    const r = { Entrada: 0, Entrega: 0, "Devolución": 0, Ajuste: 0, perdidasDanos: 0, cantidadMovimientos: movs.length };
    movs.forEach(m => {
        if (r[m.tipo] !== undefined) r[m.tipo] += Number(m.cantidad) || 0;
        if (esPerdida(m)) r.perdidasDanos += Number(m.cantidad) || 0;
    });
    return r;
}

function entregaVencida(e, hoy, gracia) {
    const prevista = U.aISO(e.fecha_devolucion_prevista);
    return !!prevista && U.diasEntre(prevista, hoy) > gracia;
}

function estadoStock(r) {
    if (Number(r.cantidad_disponible) <= 0) return "Agotado";
    if (Number(r.cantidad_disponible) <= Number(r.cantidad_minima)) return "Stock bajo";
    return "Disponible";
}

function dashboardInventario({ recursos, categorias, movimientos, entregasPendientes = [], ultimoConteo = null, ultimaEntrada = null }, periodo, params, hoy) {
    const periodoAnt = U.sumarMeses(periodo, -1);
    const movsPeriodo = movimientos.filter(m => U.periodoDeFecha(U.aISO(m.fecha)) === periodo);
    const movsAnt = movimientos.filter(m => U.periodoDeFecha(U.aISO(m.fecha)) === periodoAnt);
    const mov = resumenMovimientos(movsPeriodo), movAnt = resumenMovimientos(movsAnt);

    const unidades = recursos.reduce((s, r) => s + (Number(r.cantidad_total) || 0), 0);
    const disponibles = recursos.reduce((s, r) => s + (Number(r.cantidad_disponible) || 0), 0);
    const asignadas = Math.max(0, unidades - disponibles);
    const pctDisp = U.porcentaje(disponibles, unidades);
    const conCosto = recursos.filter(r => r.costo_unitario !== null && r.costo_unitario !== undefined);
    const sinCosto = recursos.length - conCosto.length;
    const inversion = U.redondear2(conCosto.reduce((s, r) => s + (Number(r.cantidad_total) || 0) * Number(r.costo_unitario), 0));
    const agotados = recursos.filter(r => estadoStock(r) === "Agotado");
    const bajos = recursos.filter(r => estadoStock(r) === "Stock bajo");
    const vencidas = entregasPendientes.filter(e => entregaVencida(e, hoy, params.dias_gracia_devolucion));

    const porCategoria = categorias.map(c => {
        const rs = recursos.filter(r => r.id_categoria === c.id_categoria);
        return {
            etiqueta: c.nombre, color: c.color || COLORES.azul, tipos: rs.length,
            valor: rs.reduce((s, r) => s + (Number(r.cantidad_total) || 0), 0),
            disponibles: rs.reduce((s, r) => s + (Number(r.cantidad_disponible) || 0), 0),
            ejemplos: [...rs].sort((a, b) => b.cantidad_total - a.cantidad_total).slice(0, 4).map(r => r.nombre)
        };
    });
    const top = [...recursos].sort((a, b) => b.cantidad_total - a.cantidad_total || a.nombre.localeCompare(b.nombre)).slice(0, 5)
        .map(r => ({ etiqueta: r.nombre, valor: Number(r.cantidad_total) || 0, color: r.categoria_color || COLORES.azul, categoria: r.categoria }));

    const diasSinConteo = ultimoConteo ? U.diasEntre(U.aISO(ultimoConteo.fecha), hoy) : null;
    const alertas = [];
    if (agotados.length) alertas.push(alerta("critico", `${agotados.length} recurso${agotados.length === 1 ? "" : "s"} agotado${agotados.length === 1 ? "" : "s"}: ${agotados.slice(0, 3).map(r => r.nombre).join(", ")}${agotados.length > 3 ? "…" : ""}.`, { reporte: "inventario_existencias", filtros: { alerta: "Agotado" } }));
    if (vencidas.length) alertas.push(alerta("critico", `${vencidas.length} entrega${vencidas.length === 1 ? "" : "s"} con devolución vencida.`, { reporte: "inventario_entregas_pendientes", filtros: { estado: "Vencida" } }));
    if (bajos.length) alertas.push(alerta("aviso", `${bajos.length} recurso${bajos.length === 1 ? "" : "s"} con stock bajo (en o por debajo del mínimo).`, { reporte: "inventario_existencias", filtros: { alerta: "Stock bajo" } }));
    if (unidades > 0 && pctDisp < params.disponibilidad_minima_pct) alertas.push(alerta("aviso", `La disponibilidad (${pctDisp}%) está por debajo del mínimo configurado (${params.disponibilidad_minima_pct}%).`));
    if (!ultimoConteo) alertas.push(alerta("aviso", "Todavía no se ha completado ningún conteo físico del inventario.", {}));
    else if (diasSinConteo > params.dias_sin_conteo) alertas.push(alerta("aviso", `Han pasado ${diasSinConteo} días desde el último conteo físico (máximo configurado: ${params.dias_sin_conteo}).`));
    if (mov.perdidasDanos > 0) alertas.push(alerta("aviso", `${mov.perdidasDanos} unidad${mov.perdidasDanos === 1 ? "" : "es"} perdida${mov.perdidasDanos === 1 ? "" : "s"}, dañada${mov.perdidasDanos === 1 ? "" : "s"} o incompleta${mov.perdidasDanos === 1 ? "" : "s"} en ${U.nombreMes(periodo).toLowerCase()}.`, { reporte: "inventario_movimientos", filtros: { tipo: "Pérdidas y daños" } }));
    if (sinCosto && recursos.length) alertas.push(alerta("info", `${sinCosto} recurso${sinCosto === 1 ? "" : "s"} sin costo registrado: la inversión documentada está incompleta.`));
    if (!alertas.length) alertas.push(alerta("ok", "Inventario actualizado con las categorías oficiales y sin alertas."));
    const categoriasTxt = categorias.map(c => c.nombre).join(", ");

    return {
        seccion: "inventario", periodo, periodoNombre: U.nombrePeriodo(periodo),
        kpis: [
            { clave: "tipos", titulo: "Tipos de recurso", valor: recursos.length, icono: "caja", tono: "cian" },
            { clave: "unidades", titulo: "Unidades registradas", valor: unidades, icono: "caja", tono: "azul" },
            { clave: "inversion", titulo: "Inversión documentada", valor: inversion, formato: "moneda", icono: "billete", tono: "verde", nota: sinCosto ? `${sinCosto} sin costo` : "" },
            { clave: "categorias", titulo: "Categorías oficiales", valor: categorias.length, icono: "llave", tono: "rojo" }
        ],
        salud: [
            { clave: "disponibilidad", titulo: "Disponibilidad", valor: pctDisp, formato: "pct", tono: pctDisp >= params.disponibilidad_minima_pct ? "verde" : "naranja", nota: `${disponibles} de ${unidades} unidades` },
            { clave: "bajo", titulo: "Stock bajo", valor: bajos.length, tono: bajos.length ? "naranja" : "verde" },
            { clave: "agotado", titulo: "Agotados", valor: agotados.length, tono: agotados.length ? "rojo" : "verde" },
            { clave: "vencidas", titulo: "Devoluciones vencidas", valor: vencidas.length, tono: vencidas.length ? "rojo" : "verde" }
        ],
        existencias: { total: unidades, disponibles, asignadas, pctDisponible: pctDisp },
        distribucion: porCategoria.map(c => ({ etiqueta: c.etiqueta, valor: c.valor, color: c.color })),
        categorias: porCategoria,
        top,
        control: {
            ultimaEntrada: ultimaEntrada ? U.aISO(ultimaEntrada.fecha) : null,
            responsable: ultimaEntrada && (ultimaEntrada.responsable_nombre || ultimaEntrada.responsable_apellido) ? U.nombreCompleto({ nombre: ultimaEntrada.responsable_nombre, apellido: ultimaEntrada.responsable_apellido }) : null,
            origen: ultimaEntrada ? (ultimaEntrada.origen || null) : null,
            ultimoConteo: ultimoConteo ? U.aISO(ultimoConteo.fecha) : null,
            diasSinConteo,
            entregasPendientes: entregasPendientes.length
        },
        movimientos: {
            resumen: [
                { etiqueta: "Entradas", valor: mov.Entrada, anterior: movAnt.Entrada, color: COLORES.verde },
                { etiqueta: "Entregas", valor: mov.Entrega, anterior: movAnt.Entrega, color: COLORES.azul },
                { etiqueta: "Devoluciones", valor: mov["Devolución"], anterior: movAnt["Devolución"], color: COLORES.cian },
                { etiqueta: "Pérdidas y daños", valor: mov.perdidasDanos, anterior: movAnt.perdidasDanos, color: COLORES.rojo }
            ].map(x => ({ ...x, variacion: U.variacion(x.valor, x.anterior) })),
            total: mov.cantidadMovimientos
        },
        alertas: ordenarAlertas(alertas),
        pie: { texto: alertas[0] && alertas[0].nivel === "ok" ? `Inventario actualizado con las ${categorias.length} categorías oficiales: ${categoriasTxt}.` : ordenarAlertas(alertas)[0].texto, enlace: "Ver detalle", reporte: "inventario_existencias", nivel: ordenarAlertas(alertas)[0].nivel },
        tablas: [
            { nombre: "Unidades por categoría", columnas: [{ campo: "etiqueta", titulo: "Categoría" }, { campo: "tipos", titulo: "Tipos de recurso", tipo: "entero" }, { campo: "valor", titulo: "Unidades", tipo: "entero" }, { campo: "disponibles", titulo: "Disponibles", tipo: "entero" }], filas: porCategoria },
            { nombre: "Recursos con mayor cantidad", columnas: [{ campo: "etiqueta", titulo: "Recurso" }, { campo: "categoria", titulo: "Categoría" }, { campo: "valor", titulo: "Unidades", tipo: "entero" }], filas: top },
            { nombre: "Movimientos del período", columnas: [{ campo: "etiqueta", titulo: "Movimiento" }, { campo: "valor", titulo: U.nombrePeriodo(periodo), tipo: "entero" }, { campo: "anterior", titulo: U.nombrePeriodo(periodoAnt), tipo: "entero" }], filas: [
                { etiqueta: "Entradas", valor: mov.Entrada, anterior: movAnt.Entrada }, { etiqueta: "Entregas", valor: mov.Entrega, anterior: movAnt.Entrega },
                { etiqueta: "Devoluciones", valor: mov["Devolución"], anterior: movAnt["Devolución"] }, { etiqueta: "Pérdidas y daños", valor: mov.perdidasDanos, anterior: movAnt.perdidasDanos }] }
        ]
    };
}

/* ============================================================
   NÓMINAS
   ============================================================ */
const ESTADO_NOMINA = { APROBADA: "Aprobada", PENDIENTE_APROBACION: "En revisión", EN_PREPARACION: "En preparación" };

/* Montos (en quetzales) de una nómina a partir de su fotografía aprobada. */
function montosNomina(n) {
    const c = n.snapshot && n.snapshot.calculo;
    const liquido = U.aQuetzales(n.total_centavos !== null && n.total_centavos !== undefined ? n.total_centavos : (c ? c.total : null));
    if (!c) return { liquido, bruto: null, bonificaciones: null, descuentos: null };
    if (c.totalSinDescuentos !== undefined) {
        return { liquido, bruto: U.aQuetzales(c.totalSinDescuentos), bonificaciones: U.aQuetzales(c.bono || 0), descuentos: U.aQuetzales(c.totalDescuentos || 0) };
    }
    const bonif = (c.ingresos || []).find(i => i.clave === "bonificacion");
    return { liquido, bruto: U.aQuetzales(c.totalIngresos), bonificaciones: U.aQuetzales(bonif ? bonif.monto : 0), descuentos: U.aQuetzales(c.totalDescuentos || 0) };
}

function grupoNomina(n, porCodigo) {
    if (n.tipo === "TECNICO_SOCIO" || n.tipo === "TECNICO_NO_SOCIO") return "Técnicos";
    const e = porCodigo.get(n.codigo_empleado);
    const g = e ? grupoPersonal(e) : "Administrativos";
    return g === "Auxiliares" ? "Auxiliares" : "Administrativos";
}

function sumarPeriodo(aprobadas) {
    const s = { liquido: 0, bruto: 0, bonificaciones: 0, descuentos: 0, cantidad: aprobadas.length };
    aprobadas.forEach(n => {
        const m = montosNomina(n);
        s.liquido += m.liquido || 0; s.bruto += m.bruto || 0; s.bonificaciones += m.bonificaciones || 0; s.descuentos += m.descuentos || 0;
    });
    Object.keys(s).forEach(k => { if (k !== "cantidad") s[k] = U.redondear2(s[k]); });
    return s;
}

function dashboardNominas({ nominas, empleados, cerrados = [] }, periodo, params) {
    const meses = U.ultimosPeriodos(periodo, params.meses_historial);
    const periodoAnt = U.sumarMeses(periodo, -1);
    const deMes = (p, estado) => nominas.filter(n => n.periodo === p && (!estado || n.estado === estado));
    const aprobadas = deMes(periodo, "APROBADA");
    const actual = sumarPeriodo(aprobadas), anterior = sumarPeriodo(deMes(periodoAnt, "APROBADA"));
    const serie = meses.map(m => ({ periodo: m, etiqueta: U.mesCorto(m), ...sumarPeriodo(deMes(m, "APROBADA")) }));

    const porCodigo = new Map(empleados.map(e => [e.codigo_empleado, e]));
    const rango = U.rangoPeriodo(periodo);
    const esperados = empleados.filter(e => e.activo && (!U.aISO(e.fecha_contratacion) || U.aISO(e.fecha_contratacion) <= rango.hasta));
    const clave = n => n.codigo_empleado ? `e${n.codigo_empleado}` : `n${n.id_nomina}`;
    const aprobadasUnicas = new Set(aprobadas.map(clave)).size;
    const pendientes = deMes(periodo, "PENDIENTE_APROBACION").length;
    const preparacion = deMes(periodo, "EN_PREPARACION").length;
    const totalEsperado = Math.max(esperados.length, aprobadasUnicas);
    const avance = U.porcentaje(aprobadasUnicas, totalEsperado);
    const cerrado = cerrados.includes(periodo);
    const estadoPeriodo = cerrado ? "Cerrado" : avance >= 100 ? "Completo" : (aprobadasUnicas + pendientes + preparacion) > 0 ? "En proceso" : "Sin iniciar";

    const gruposOrden = ["Técnicos", "Auxiliares", "Administrativos"];
    const porGrupo = gruposOrden.map(g => ({
        etiqueta: g, color: colorDeGrupo(g),
        valor: U.redondear2(aprobadas.filter(n => grupoNomina(n, porCodigo) === g).reduce((s, n) => s + (montosNomina(n).liquido || 0), 0)),
        cantidad: aprobadas.filter(n => grupoNomina(n, porCodigo) === g).length
    }));

    const sinNomina = esperados.filter(e => !aprobadas.some(n => n.codigo_empleado === e.codigo_empleado));
    const alertas = [];
    if (cerrado && (pendientes || preparacion)) alertas.push(alerta("critico", `El período está cerrado pero tiene ${pendientes + preparacion} nómina${pendientes + preparacion === 1 ? "" : "s"} sin aprobar.`, { reporte: "nominas_planilla" }));
    if (pendientes) alertas.push(alerta("aviso", `${pendientes} nómina${pendientes === 1 ? "" : "s"} esperando aprobación.`, { reporte: "nominas_planilla", filtros: { estado: "PENDIENTE_APROBACION" } }));
    if (preparacion) alertas.push(alerta("info", `${preparacion} nómina${preparacion === 1 ? "" : "s"} todavía en preparación (borrador).`, { reporte: "nominas_planilla", filtros: { estado: "EN_PREPARACION" } }));
    if (sinNomina.length && !cerrado) alertas.push(alerta("aviso", `${sinNomina.length} empleado${sinNomina.length === 1 ? "" : "s"} activo${sinNomina.length === 1 ? "" : "s"} sin nómina aprobada en ${U.nombrePeriodo(periodo)}.`, { reporte: "nominas_planilla" }));
    if (actual.liquido > 0 && anterior.liquido > 0) {
        const v = U.variacion(actual.liquido, anterior.liquido);
        if (v.pct !== null && Math.abs(v.pct) >= 25) alertas.push(alerta("info", `El líquido total ${v.sentido === "sube" ? "subió" : "bajó"} ${Math.abs(v.pct)}% frente a ${U.nombrePeriodo(periodoAnt)}.`));
    }
    if (!alertas.length) alertas.push(alerta("ok", "Todas las nóminas del período están aprobadas."));

    const kpi = (clave, titulo, campo, icono, tono) => ({ clave, titulo, valor: actual[campo], formato: "moneda", icono, tono, variacion: U.variacion(actual[campo], anterior[campo]), anterior: anterior[campo] });
    return {
        seccion: "nominas", periodo, periodoNombre: U.nombrePeriodo(periodo), periodoAnterior: U.nombrePeriodo(periodoAnt),
        kpis: [
            kpi("liquido", "Líquido a pagar", "liquido", "billetera", "azul"),
            kpi("bruto", "Ingresos brutos", "bruto", "regalo", "verde"),
            kpi("bonificaciones", "Bonificaciones", "bonificaciones", "billete", "cian"),
            kpi("descuentos", "Descuentos", "descuentos", "documento", "rojo")
        ],
        tendencia: { etiquetas: serie.map(s => s.etiqueta), periodos: serie.map(s => s.periodo), liquido: serie.map(s => s.liquido), bonificaciones: serie.map(s => s.bonificaciones), descuentos: serie.map(s => s.descuentos), cantidad: serie.map(s => s.cantidad) },
        estadoPagos: conPorcentaje([
            { etiqueta: "Aprobadas", valor: aprobadas.length, color: COLORES.verde },
            { etiqueta: "En revisión", valor: pendientes, color: COLORES.naranja },
            { etiqueta: "En preparación", valor: preparacion, color: COLORES.gris }
        ]),
        totalNominas: aprobadas.length + pendientes + preparacion,
        porGrupo,
        avance: { pct: avance, aprobadas: aprobadasUnicas, esperadas: totalEsperado, pendientes: pendientes + preparacion, estado: estadoPeriodo, cerrado },
        alertas: ordenarAlertas(alertas),
        pie: { texto: `${aprobadasUnicas} de ${totalEsperado} nóminas han sido aprobadas`, enlace: "Ver detalle", reporte: "nominas_planilla", nivel: avance >= 100 ? "ok" : "aviso" },
        tablas: [
            { nombre: "Líquido por mes", columnas: [{ campo: "periodo", titulo: "Período" }, { campo: "cantidad", titulo: "Nóminas aprobadas", tipo: "entero" }, { campo: "bruto", titulo: "Ingresos brutos", tipo: "moneda" }, { campo: "bonificaciones", titulo: "Bonificaciones", tipo: "moneda" }, { campo: "descuentos", titulo: "Descuentos", tipo: "moneda" }, { campo: "liquido", titulo: "Líquido", tipo: "moneda" }], filas: serie },
            { nombre: "Líquido por puesto", columnas: [{ campo: "etiqueta", titulo: "Puesto" }, { campo: "cantidad", titulo: "Nóminas", tipo: "entero" }, { campo: "valor", titulo: "Líquido", tipo: "moneda" }], filas: porGrupo },
            { nombre: "Estado de las nóminas", columnas: [{ campo: "etiqueta", titulo: "Estado" }, { campo: "valor", titulo: "Cantidad", tipo: "entero" }], filas: conPorcentaje([{ etiqueta: "Aprobadas", valor: aprobadas.length }, { etiqueta: "En revisión", valor: pendientes }, { etiqueta: "En preparación", valor: preparacion }]) }
        ]
    };
}

/* ============================================================
   RESUMEN (portada del módulo)
   ============================================================ */
function resumenGeneral({ emp, inv, nom }, periodo) {
    const salida = { periodo, periodoNombre: U.nombrePeriodo(periodo), alertas: [] };
    if (emp) {
        const total = emp.estado.activos;
        salida.personal = { total, grupos: emp.puestos.filter(g => ["Técnicos", "Auxiliares", "Administrativos"].includes(g.etiqueta)) };
        salida.alertas.push(...emp.alertas.filter(a => a.nivel !== "ok").map(a => ({ ...a, origen: "Empleados" })));
    }
    if (inv) {
        salida.inventario = { recursos: inv.existencias.total, disponibles: inv.existencias.disponibles, asignados: inv.existencias.asignadas, pctDisponible: inv.existencias.pctDisponible };
        salida.alertas.push(...inv.alertas.filter(a => a.nivel !== "ok").map(a => ({ ...a, origen: "Inventario" })));
    }
    if (nom) {
        const a = nom.avance;
        const checks = [
            { texto: "Planilla calculada", estado: nom.totalNominas > 0 ? "ok" : "pendiente" },
            { texto: "Comprobantes generados", estado: a.aprobadas > 0 && a.pendientes === 0 && a.pct >= 100 ? "ok" : a.aprobadas > 0 ? "parcial" : "pendiente" },
            { texto: a.pendientes > 0 ? `${a.pendientes} nómina${a.pendientes === 1 ? "" : "s"} pendiente${a.pendientes === 1 ? "" : "s"} de aprobar` : a.pct >= 100 ? "Sin nóminas pendientes" : `${a.esperadas - a.aprobadas} empleado${a.esperadas - a.aprobadas === 1 ? "" : "s"} sin nómina aprobada`, estado: a.pendientes === 0 && a.pct >= 100 ? "ok" : "pendiente" }
        ];
        salida.nomina = { periodoNombre: nom.periodoNombre, estado: a.estado, pct: a.pct, aprobadas: a.aprobadas, esperadas: a.esperadas, liquido: nom.kpis[0].valor, checks };
        salida.alertas.push(...nom.alertas.filter(x => x.nivel !== "ok").map(x => ({ ...x, origen: "Nóminas" })));
    }
    salida.alertas = ordenarAlertas(salida.alertas);
    return salida;
}

module.exports = {
    grupoPersonal, esTecnico, contarGrupos, completitudExpediente, estadoStock, entregaVencida, esPerdida, montosNomina, grupoNomina, ESTADO_NOMINA,
    dashboardEmpleados, dashboardInventario, dashboardNominas, resumenGeneral, antiguedadRangos, COLORES, ordenarAlertas
};
