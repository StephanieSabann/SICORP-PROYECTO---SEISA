const U = require("./util");
const A = require("./agregadores");
const CAT = require("./catalogos");

/* ============================================================
   CATÁLOGO DE GRÁFICAS DE LOS DASHBOARDS
   ------------------------------------------------------------
   Cada gráfica es un objeto:
     id, seccion, titulo, sub, tipo, ancho (4 | 8 | 12 de 12 columnas)
     filtros(ctx)         → opciones desplegables propias de la gráfica
     calcular(ctx, f)     → { ...datos, tabla:{columnas,filas} }
   tipo: donut | barrasH | barrasV | lineas | area | apiladas | medidor
   Al cambiar un filtro en pantalla solo se vuelve a pedir ESA gráfica.
   Para agregar una gráfica nueva basta con sumar un objeto a GRAFICAS.
   ctx = { repo, params, hoy, periodo, + cargadores con memoria }
   ============================================================ */

const PALETA = ["#3FB6E8", "#1E7BFF", "#22D3EE", "#18BE2D", "#F59E0B", "#E3453F", "#A855F7", "#EC4899", "#14B8A6", "#6B7886"];
const VERDE = "#18BE2D", ROJO = "#E3453F", NARANJA = "#F59E0B", GRIS = "#6B7886", AZUL = "#1E7BFF", CIAN = "#22D3EE";
const colorDe = i => PALETA[i % PALETA.length];

const op = (valor, etiqueta) => ({ valor, etiqueta });
const filtro = (clave, etiqueta, opciones, defecto) => ({ clave, etiqueta, opciones, defecto: defecto === undefined ? opciones[0].valor : defecto });
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

const OP_MESES = [op("3", "Últimos 3 meses"), op("6", "Últimos 6 meses"), op("12", "Últimos 12 meses"), op("24", "Últimos 24 meses")];
const OP_RANGO = [op("1", "Solo el período"), op("3", "Últimos 3 meses"), op("6", "Últimos 6 meses"), op("12", "Últimos 12 meses")];
const OP_ESTADO_EMP = [op("Activo", "Activos"), op("Inactivo", "Inactivos"), op("", "Todos")];
const OP_TOP = [op("5", "Top 5"), op("8", "Top 8"), op("10", "Top 10")];
const NOMBRE_TIPO_NOMINA = { TECNICO_SOCIO: "Técnico socio", TECNICO_NO_SOCIO: "Técnico no socio", ADMINISTRATIVA: "Planilla administrativa" };

/* ---------------------- contexto con carga perezosa ---------------------- */
function crearContexto({ repo, params, hoy, periodo }) {
    const memo = new Map();
    const una = (k, fn) => { if (!memo.has(k)) memo.set(k, Promise.resolve().then(fn)); return memo.get(k); };
    return {
        repo, params, hoy, periodo,
        empleados: () => una("emp", () => repo.empleados()),
        permisos: () => una("per", () => repo.permisos()),
        recursos: () => una("rec", () => repo.recursos()),
        categorias: () => una("cat", () => repo.categorias()),
        entregas: () => una("ent", () => repo.entregasPendientes()),
        movimientos: (desde, hasta) => una(`mov${desde}${hasta}`, () => repo.movimientos({ desde, hasta })),
        nominas: (desde, hasta) => una(`nom${desde}${hasta}`, () => repo.nominas({ desdePeriodo: desde, hastaPeriodo: hasta }))
    };
}
const ventanaMeses = (c, meses) => ({ meses: U.ultimosPeriodos(c.periodo, meses), desde: U.sumarMeses(c.periodo, -(meses - 1)) });
const cap = (lista, n) => lista.slice(0, n);

/* ---------------------- piezas reutilizables ---------------------- */
function codigoGrupo(e) { return A.grupoPersonal(e); }
async function empleadosFiltrados(c, f) {
    const todos = await c.empleados();
    const rango = U.rangoPeriodo(c.periodo);
    return todos.filter(e => {
        const fc = U.aISO(e.fecha_contratacion);
        if (fc && fc > rango.hasta) return false;
        if (f.estado === "Activo" && !e.activo) return false;
        if (f.estado === "Inactivo" && e.activo) return false;
        if (f.grupo && codigoGrupo(e) !== f.grupo) return false;
        return true;
    });
}
const tabla = (columnas, filas) => ({ columnas, filas });
const colEtiqueta = (titulo) => ({ campo: "etiqueta", titulo });

function conPct(datos) {
    const total = datos.reduce((s, d) => s + d.valor, 0);
    return datos.map(d => ({ ...d, pct: U.porcentaje(d.valor, total) }));
}
function nombreNomina(n) { return n.empleado_nombre || (n.snapshot && n.snapshot.empleado && n.snapshot.empleado.nombre) || "Sin empleado asignado"; }
const filtroTipoNomina = (n, f) => !f.tipo || n.tipo === f.tipo;
const nombreEmpleado = e => U.nombreCompleto(e) || `Empleado ${e.codigo_empleado}`;

/* Días de ausencia (permisos aprobados) que caen dentro de [desde, hasta]. */
function diasEnRango(p, desde, hasta) {
    const d = U.aISO(p.desde), h = U.aISO(p.hasta) || d;
    if (!d) return 0;
    const ini = d < desde ? desde : d, fin = h > hasta ? hasta : h;
    return fin < ini ? 0 : U.diasEntre(ini, fin) + 1;
}
const esVacaciones = p => U.normalizar(p.tipo_nombre).includes("vacacion");

/* ============================================================
   EMPLEADOS
   ============================================================ */
const G_EMPLEADOS = [
    {
        id: "puestos", titulo: "Personal por puesto", sub: "Quiénes integran la plantilla", tipo: "donut", ancho: 4,
        filtros: async () => [filtro("estado", "Estado", OP_ESTADO_EMP, "Activo")],
        async calcular(c, f) {
            const lista = await empleadosFiltrados(c, { estado: f.estado });
            const datos = A.contarGrupos(lista).filter(d => d.valor > 0);
            return { datos, centro: { valor: String(lista.length), sub: f.estado === "Inactivo" ? "inactivos" : f.estado === "" ? "registrados" : "activos" },
                tabla: tabla([colEtiqueta("Puesto"), { campo: "valor", titulo: "Empleados", tipo: "entero" }, { campo: "pct", titulo: "% del personal", tipo: "decimal" }], conPct(datos)) };
        }
    },
    {
        id: "ingresos", titulo: "Nuevas contrataciones", sub: "Ingresos de personal por mes", tipo: "barrasV", ancho: 8,
        filtros: async c => [filtro("meses", "Rango", OP_MESES, "6"), filtro("grupo", "Puesto", await CAT.opcionesGrupo(c.repo), "")],
        async calcular(c, f) {
            const { meses } = ventanaMeses(c, num(f.meses, 6));
            const lista = await empleadosFiltrados(c, { grupo: f.grupo });
            const valores = meses.map(m => lista.filter(e => U.periodoDeFecha(U.aISO(e.fecha_contratacion)) === m).length);
            return { etiquetas: meses.map(m => meses.length > 12 ? `${U.mesCorto(m)} ${m.slice(2, 4)}` : U.mesCorto(m)), valores, color: CIAN, nombreSerie: "Ingresos", formato: "entero",
                tabla: tabla([{ campo: "periodo", titulo: "Período" }, { campo: "valor", titulo: "Ingresos", tipo: "entero" }], meses.map((m, i) => ({ periodo: U.nombrePeriodo(m), valor: valores[i] }))) };
        }
    },
    {
        id: "desempeno", titulo: "Desempeño del personal", sub: "Ranking por faltas y descuentos", tipo: "barrasH", ancho: 8,
        filtros: async c => [
            filtro("indicador", "Indicador", [op("mejor", "Mejor desempeño (menos faltas y descuentos)"), op("menos_faltas", "Menos faltas (mejor asistencia)"), op("mas_faltas", "Más faltas"), op("menos_descuentos", "Menos descuentos"), op("mas_descuentos", "Más descuentos"), op("mayor_liquido", "Mayor líquido pagado")], "mejor"),
            filtro("meses", "Período evaluado", [op("6", "Últimos 6 meses"), op("3", "Últimos 3 meses"), op("12", "Últimos 12 meses"), op("1", "Solo el período")], "6"),
            filtro("grupo", "Puesto", await CAT.opcionesGrupo(c.repo), ""),
            filtro("contar", "Qué cuenta como falta", [op("sin_vacaciones", "Permisos aprobados sin vacaciones"), op("todas", "Todos los permisos aprobados")], "sin_vacaciones"),
            filtro("top", "Mostrar", OP_TOP, "8")
        ],
        async calcular(c, f) {
            const meses = num(f.meses, 6), { desde } = ventanaMeses(c, meses);
            const ini = U.rangoPeriodo(desde).desde, fin = U.rangoPeriodo(c.periodo).hasta;
            const [permisos, nominas] = await Promise.all([c.permisos(), c.nominas(desde, c.periodo)]);
            const activos = await empleadosFiltrados(c, { estado: "Activo", grupo: f.grupo });
            const filas = activos.map(e => {
                const dias = permisos.filter(p => p.id_empleado === e.codigo_empleado && p.estado === true && (f.contar === "todas" || !esVacaciones(p)))
                    .reduce((s, p) => s + diasEnRango(p, ini, fin), 0);
                const propias = nominas.filter(n => n.estado === "APROBADA" && n.codigo_empleado === e.codigo_empleado).map(A.montosNomina);
                const descuentos = U.redondear2(propias.reduce((s, m) => s + (m.descuentos || 0), 0));
                const liquido = U.redondear2(propias.reduce((s, m) => s + (m.liquido || 0), 0));
                return { empleado: nombreEmpleado(e), puesto: codigoGrupo(e), dias, descuentos, liquido, nominas: propias.length };
            });
            const esNomina = ["mejor", "menos_descuentos", "mas_descuentos", "mayor_liquido"].includes(f.indicador);
            const base = esNomina ? filas.filter(x => x.nominas > 0) : filas;
            const mejor = f.indicador === "mejor";
            const campo = mejor ? "descuentos" : f.indicador.endsWith("faltas") ? "dias" : f.indicador.endsWith("descuentos") ? "descuentos" : "liquido";
            const asc = mejor || f.indicador.startsWith("menos");
            const orden = [...base].sort((a, b) => (mejor ? a.dias - b.dias || a.descuentos - b.descuentos : asc ? a[campo] - b[campo] : b[campo] - a[campo]) || a.empleado.localeCompare(b.empleado));
            const bueno = mejor || f.indicador.startsWith("menos") || f.indicador === "mayor_liquido";
            const top = cap(orden, num(f.top, 8));
            const dinero = campo !== "dias";
            return {
                datos: top.map(x => ({ etiqueta: x.empleado, valor: x[campo], color: bueno ? VERDE : ROJO, detalle: `${x.puesto} · ${x.dias} día${x.dias === 1 ? "" : "s"} de ausencia · descuentos ${U.formatoQ(x.descuentos)}` })),
                formato: dinero ? "moneda" : "entero",
                nota: mejor && base.length ? `Ordenado por menos días de ausencia y, a igualdad, menos descuentos (barra = descuentos) · ${base.length} empleado${base.length === 1 ? "" : "s"} con nómina aprobada · ${U.nombrePeriodo(desde)} a ${U.nombrePeriodo(c.periodo)}` : base.length && !top.some(x => x[campo] > 0) && campo === "dias" ? `Ningún empleado evaluado registra ausencias en este período (todos tienen 0 días).` : base.length ? `${base.length} empleado${base.length === 1 ? "" : "s"} evaluado${base.length === 1 ? "" : "s"}${esNomina ? " con nómina aprobada" : ""} · ${U.nombrePeriodo(desde)} a ${U.nombrePeriodo(c.periodo)}` : "",
                tabla: tabla([{ campo: "empleado", titulo: "Empleado" }, { campo: "puesto", titulo: "Puesto" }, { campo: "dias", titulo: "Días de ausencia", tipo: "entero" }, { campo: "descuentos", titulo: "Descuentos", tipo: "moneda" }, { campo: "liquido", titulo: "Líquido pagado", tipo: "moneda" }], cap(orden, 100))
            };
        }
    },
    {
        id: "ausencias_tipo", titulo: "Ausencias por tipo", sub: "Días de permiso", tipo: "donut", ancho: 4,
        filtros: async c => [
            filtro("estado", "Estado del permiso", [op("aprobado", "Aprobados"), op("pendiente", "Pendientes"), op("rechazado", "Rechazados"), op("", "Todos")], "aprobado"),
            filtro("meses", "Rango", OP_MESES, "12")
        ],
        async calcular(c, f) {
            const { desde } = ventanaMeses(c, num(f.meses, 12));
            const ini = U.rangoPeriodo(desde).desde, fin = U.rangoPeriodo(c.periodo).hasta;
            const estadoDe = p => p.estado === null || p.estado === undefined ? "pendiente" : p.estado ? "aprobado" : "rechazado";
            const grupos = new Map();
            (await c.permisos()).filter(p => !f.estado || estadoDe(p) === f.estado).forEach(p => {
                const d = diasEnRango(p, ini, fin);
                if (d > 0) grupos.set(p.tipo_nombre || "Sin tipo", (grupos.get(p.tipo_nombre || "Sin tipo") || 0) + d);
            });
            const datos = [...grupos.entries()].sort((a, b) => b[1] - a[1]).map(([etiqueta, valor], i) => ({ etiqueta, valor, color: colorDe(i + 3) }));
            return { datos, centro: { valor: String(datos.reduce((s, d) => s + d.valor, 0)), sub: "días" }, tabla: tabla([colEtiqueta("Tipo de permiso"), { campo: "valor", titulo: "Días", tipo: "entero" }, { campo: "pct", titulo: "%", tipo: "decimal" }], conPct(datos)) };
        }
    },
    {
        id: "ausencias_mes", titulo: "Ausencias por mes", sub: "Días de permiso aprobados", tipo: "area", ancho: 8,
        filtros: async c => {
            return [filtro("meses", "Rango", OP_MESES, "6"), filtro("tipo", "Tipo de permiso", await CAT.opcionesTipoPermiso(c.repo), ""), filtro("grupo", "Puesto", await CAT.opcionesGrupo(c.repo), "")];
        },
        async calcular(c, f) {
            const { meses } = ventanaMeses(c, num(f.meses, 6));
            const emp = new Map((await empleadosFiltrados(c, { grupo: f.grupo })).map(e => [e.codigo_empleado, e]));
            const permisos = (await c.permisos()).filter(p => p.estado === true && emp.has(p.id_empleado) && (!f.tipo || p.tipo_nombre === f.tipo));
            const valores = meses.map(m => { const r = U.rangoPeriodo(m); return permisos.reduce((s, p) => s + diasEnRango(p, r.desde, r.hasta), 0); });
            return { etiquetas: meses.map(m => U.mesCorto(m)), series: [{ nombre: "Días de ausencia", valores, color: NARANJA }], formato: "entero",
                tabla: tabla([{ campo: "periodo", titulo: "Período" }, { campo: "valor", titulo: "Días de ausencia", tipo: "entero" }], meses.map((m, i) => ({ periodo: U.nombrePeriodo(m), valor: valores[i] }))) };
        }
    },
    {
        id: "expedientes", titulo: "Expedientes completos", sub: "Promedio de datos registrados", tipo: "medidor", ancho: 4,
        filtros: async c => [filtro("estado", "Estado", OP_ESTADO_EMP, "Activo"), filtro("grupo", "Puesto", await CAT.opcionesGrupo(c.repo), "")],
        async calcular(c, f) {
            const lista = await empleadosFiltrados(c, f);
            const pcts = lista.map(e => A.completitudExpediente(e).pct);
            const prom = pcts.length ? Math.round(pcts.reduce((s, x) => s + x, 0) / pcts.length) : 0;
            const completos = pcts.filter(x => x === 100).length;
            const porGrupo = [...new Set(lista.map(codigoGrupo))].map(g => { const l = lista.filter(e => codigoGrupo(e) === g); return { etiqueta: g, empleados: l.length, valor: Math.round(l.reduce((s, e) => s + A.completitudExpediente(e).pct, 0) / l.length) }; });
            return { valor: prom, texto: prom + "%", sub: "completitud", color: prom >= 90 ? VERDE : prom >= 60 ? NARANJA : ROJO, meta: 100, detalle: `${completos} de ${lista.length} expedientes completos`,
                tabla: tabla([colEtiqueta("Puesto"), { campo: "empleados", titulo: "Empleados", tipo: "entero" }, { campo: "valor", titulo: "Completitud (%)", tipo: "entero" }], porGrupo) };
        }
    },
    {
        id: "antiguedad", titulo: "Antigüedad", sub: "Años en la empresa", tipo: "barrasH", ancho: 4,
        filtros: async c => [filtro("estado", "Estado", OP_ESTADO_EMP, "Activo"), filtro("grupo", "Puesto", await CAT.opcionesGrupo(c.repo), "")],
        async calcular(c, f) {
            const lista = await empleadosFiltrados(c, f);
            const rango = U.rangoPeriodo(c.periodo);
            const ref = c.hoy < rango.hasta ? c.hoy : rango.hasta;
            const rangos = A.antiguedadRangos(c.params.antiguedad_cortes);
            const datos = rangos.map((r, i) => ({ etiqueta: r.etiqueta, valor: 0, color: "#3FB6E8" }));
            lista.forEach(e => { const fc = U.aISO(e.fecha_contratacion); if (!fc) return; const a = Math.max(0, U.aniosCumplidos(fc, ref)); const i = rangos.findIndex(r => a >= r.desde && a <= r.hasta); if (i >= 0) datos[i].valor++; });
            return { datos: datos.map(d => ({ ...d, detalle: "empleados" })), formato: "entero", tabla: tabla([colEtiqueta("Rango"), { campo: "valor", titulo: "Empleados", tipo: "entero" }], datos) };
        }
    },
    {
        id: "edades", titulo: "Edad del personal", sub: "Rangos de edad", tipo: "barrasV", ancho: 4,
        filtros: async c => [filtro("estado", "Estado", OP_ESTADO_EMP, "Activo"), filtro("grupo", "Puesto", await CAT.opcionesGrupo(c.repo), "")],
        async calcular(c, f) {
            const lista = await empleadosFiltrados(c, f);
            const cortes = [["Menos de 25", 0, 24], ["25-34", 25, 34], ["35-44", 35, 44], ["45-54", 45, 54], ["55 o más", 55, 200]];
            const valores = cortes.map(() => 0); let sin = 0;
            lista.forEach(e => { const nac = U.aISO(e.fecha_nacimiento); if (!nac) { sin++; return; } const a = U.aniosCumplidos(nac, c.hoy); const i = cortes.findIndex(([, d, h]) => a >= d && a <= h); if (i >= 0) valores[i]++; });
            const etiquetas = cortes.map(x => x[0]);
            if (sin) { etiquetas.push("Sin dato"); valores.push(sin); }
            return { etiquetas, valores, color: "#A855F7", nombreSerie: "Empleados", formato: "entero", tabla: tabla([{ campo: "etiqueta", titulo: "Edad" }, { campo: "valor", titulo: "Empleados", tipo: "entero" }], etiquetas.map((e, i) => ({ etiqueta: e, valor: valores[i] }))) };
        }
    },
    {
        id: "tipos", titulo: "Tipo de empleado", sub: "Socios, no socios, auxiliares y administrativos", tipo: "barrasH", ancho: 4,
        filtros: async () => [filtro("estado", "Estado", OP_ESTADO_EMP, "Activo")],
        async calcular(c, f) {
            const NOMBRE = { TECNICO_SOCIO: "Técnico socio", TECNICO_NO_SOCIO: "Técnico no socio", AUXILIAR: "Auxiliar", ADMINISTRATIVO: "Administrativo" };
            const lista = await empleadosFiltrados(c, { estado: f.estado });
            const g = new Map();
            lista.forEach(e => { const k = NOMBRE[e.tipo_empleado] || (A.esTecnico(e) ? "Técnico sin clasificar" : "Sin clasificar"); g.set(k, (g.get(k) || 0) + 1); });
            const datos = [...g.entries()].sort((a, b) => b[1] - a[1]).map(([etiqueta, valor], i) => ({ etiqueta, valor, color: etiqueta.includes("sin clasificar") || etiqueta === "Sin clasificar" ? NARANJA : colorDe(i + 1), detalle: "empleados" }));
            return { datos, formato: "entero", tabla: tabla([colEtiqueta("Tipo"), { campo: "valor", titulo: "Empleados", tipo: "entero" }], datos) };
        }
    }
];

/* ============================================================
   INVENTARIO
   ============================================================ */
const opCategorias = async c => [op("", "Todas las categorías"), ...(await c.categorias()).map(x => op(x.nombre, x.nombre))];
const filtroCategoria = async c => filtro("categoria", "Categoría", await opCategorias(c), "");
const filtroOrigen = async c => filtro("origen", "Origen", await CAT.opcionesOrigen(c.repo), "");
const enCategoria = (f, r) => !f.categoria || r.categoria === f.categoria;
async function movimientosEn(c, f, meses) {
    const { desde } = ventanaMeses(c, meses);
    return (await c.movimientos(U.rangoPeriodo(desde).desde, U.rangoPeriodo(c.periodo).hasta))
        .filter(m => (!f.categoria || m.categoria === f.categoria) && (!f.origen || m.origen === f.origen));
}
const COLOR_MOV = { Entrada: VERDE, Entrega: AZUL, "Devolución": CIAN, Ajuste: NARANJA, "Pérdidas y daños": ROJO };

const G_INVENTARIO = [
    {
        id: "categorias", titulo: "Unidades por categoría", sub: "Cómo se reparte el inventario", tipo: "donut", ancho: 4,
        filtros: async () => [filtro("metrica", "Medir", [op("total", "Unidades totales"), op("disponible", "Disponibles"), op("asignado", "Asignadas al personal")], "total")],
        async calcular(c, f) {
            const [recursos, categorias] = await Promise.all([c.recursos(), c.categorias()]);
            const medir = r => f.metrica === "disponible" ? num(r.cantidad_disponible) : f.metrica === "asignado" ? Math.max(0, num(r.cantidad_total) - num(r.cantidad_disponible)) : num(r.cantidad_total);
            const datos = categorias.map((cat, i) => ({ etiqueta: cat.nombre, color: cat.color || colorDe(i), valor: recursos.filter(r => r.id_categoria === cat.id_categoria).reduce((s, r) => s + medir(r), 0) }));
            return { datos, centro: { valor: String(datos.reduce((s, d) => s + d.valor, 0)), sub: "unidades" }, tabla: tabla([colEtiqueta("Categoría"), { campo: "valor", titulo: "Unidades", tipo: "entero" }, { campo: "pct", titulo: "%", tipo: "decimal" }], conPct(datos)) };
        }
    },
    {
        id: "top", titulo: "Recursos con mayor cantidad", sub: "Los que más existencias tienen", tipo: "barrasH", ancho: 8,
        filtros: async c => [await filtroCategoria(c), filtro("metrica", "Medir", [op("total", "Unidades totales"), op("disponible", "Disponibles"), op("asignado", "Asignadas")], "total"), filtro("top", "Mostrar", [op("7", "Top 7"), op("5", "Top 5"), op("10", "Top 10")], "7")],
        async calcular(c, f) {
            const medir = r => f.metrica === "disponible" ? num(r.cantidad_disponible) : f.metrica === "asignado" ? Math.max(0, num(r.cantidad_total) - num(r.cantidad_disponible)) : num(r.cantidad_total);
            const lista = (await c.recursos()).filter(r => enCategoria(f, r)).map(r => ({ r, v: medir(r) })).sort((a, b) => b.v - a.v || a.r.nombre.localeCompare(b.r.nombre));
            return { datos: cap(lista, num(f.top, 7)).map(x => ({ etiqueta: x.r.nombre, valor: x.v, color: x.r.categoria_color || "#3FB6E8", detalle: x.r.categoria })), formato: "entero",
                tabla: tabla([{ campo: "recurso", titulo: "Recurso" }, { campo: "categoria", titulo: "Categoría" }, { campo: "valor", titulo: "Unidades", tipo: "entero" }], lista.map(x => ({ recurso: x.r.nombre, categoria: x.r.categoria, valor: x.v }))) };
        }
    },
    {
        id: "disponibilidad", titulo: "Disponibilidad", sub: "Unidades listas para entregar", tipo: "medidor", ancho: 4,
        filtros: async c => [await filtroCategoria(c)],
        async calcular(c, f) {
            const lista = (await c.recursos()).filter(r => enCategoria(f, r));
            const total = lista.reduce((s, r) => s + num(r.cantidad_total), 0), disp = lista.reduce((s, r) => s + num(r.cantidad_disponible), 0);
            const pct = U.porcentaje(disp, total), minimo = c.params.disponibilidad_minima_pct;
            const porCat = [...new Set(lista.map(r => r.categoria))].map(cat => { const l = lista.filter(r => r.categoria === cat); const t = l.reduce((s, r) => s + num(r.cantidad_total), 0), d = l.reduce((s, r) => s + num(r.cantidad_disponible), 0); return { etiqueta: cat, total: t, disponible: d, pct: U.porcentaje(d, t) }; });
            return { valor: pct, texto: decimalPct(pct), sub: "disponible", color: total === 0 ? GRIS : pct >= minimo ? VERDE : NARANJA, meta: minimo, detalle: `${disp} de ${total} unidades · mínimo ${minimo}%`,
                tabla: tabla([colEtiqueta("Categoría"), { campo: "total", titulo: "Total", tipo: "entero" }, { campo: "disponible", titulo: "Disponibles", tipo: "entero" }, { campo: "pct", titulo: "% disponible", tipo: "decimal" }], porCat) };
        }
    },
    {
        id: "movimientos_mes", titulo: "Movimientos por mes", sub: "Entradas, entregas y devoluciones", tipo: "lineas", ancho: 8,
        filtros: async c => [filtro("meses", "Rango", OP_MESES, "6"), await filtroCategoria(c), await filtroOrigen(c)],
        async calcular(c, f) {
            const { meses } = ventanaMeses(c, num(f.meses, 6));
            const movs = await movimientosEn(c, f, meses.length);
            const serie = tipo => meses.map(m => movs.filter(x => x.tipo === tipo && U.periodoDeFecha(U.aISO(x.fecha)) === m).length);
            const series = [{ nombre: "Entradas", valores: serie("Entrada"), color: VERDE }, { nombre: "Entregas", valores: serie("Entrega"), color: AZUL }, { nombre: "Devoluciones", valores: serie("Devolución"), color: CIAN }];
            return { etiquetas: meses.map(m => U.mesCorto(m)), series, formato: "entero",
                tabla: tabla([{ campo: "periodo", titulo: "Período" }, { campo: "e", titulo: "Entradas", tipo: "entero" }, { campo: "g", titulo: "Entregas", tipo: "entero" }, { campo: "d", titulo: "Devoluciones", tipo: "entero" }], meses.map((m, i) => ({ periodo: U.nombrePeriodo(m), e: series[0].valores[i], g: series[1].valores[i], d: series[2].valores[i] }))) };
        }
    },
    {
        id: "stock", titulo: "Estado del stock", sub: "Tipos de recurso según su mínimo", tipo: "donut", ancho: 4,
        filtros: async c => [await filtroCategoria(c)],
        async calcular(c, f) {
            const lista = (await c.recursos()).filter(r => enCategoria(f, r));
            const cuenta = e => lista.filter(r => A.estadoStock(r) === e).length;
            const datos = [{ etiqueta: "Disponible", valor: cuenta("Disponible"), color: VERDE }, { etiqueta: "Stock bajo", valor: cuenta("Stock bajo"), color: NARANJA }, { etiqueta: "Agotado", valor: cuenta("Agotado"), color: ROJO }];
            return { datos, centro: { valor: String(lista.length), sub: "recursos" }, tabla: tabla([colEtiqueta("Estado"), { campo: "valor", titulo: "Recursos", tipo: "entero" }, { campo: "pct", titulo: "%", tipo: "decimal" }], conPct(datos)) };
        }
    },
    {
        id: "movimientos_tipo", titulo: "Movimientos del período", sub: "Cantidad de movimientos por tipo", tipo: "barrasV", ancho: 4,
        filtros: async c => [filtro("meses", "Rango", [op("1", "Solo el período"), op("3", "Últimos 3 meses"), op("6", "Últimos 6 meses")], "1"), await filtroCategoria(c), await filtroOrigen(c)],
        async calcular(c, f) {
            const movs = await movimientosEn(c, f, num(f.meses, 1));
            const cuenta = fn => movs.filter(fn).length;
            const filas = [["Entradas", cuenta(m => m.tipo === "Entrada")], ["Entregas", cuenta(m => m.tipo === "Entrega")], ["Devoluciones", cuenta(m => m.tipo === "Devolución")], ["Ajustes", cuenta(m => m.tipo === "Ajuste")], ["Pérdidas y daños", cuenta(A.esPerdida)]];
            return { etiquetas: filas.map(x => x[0]), valores: filas.map(x => x[1]), colores: [VERDE, AZUL, CIAN, NARANJA, ROJO], nombreSerie: "Movimientos", formato: "entero", tabla: tabla([colEtiqueta("Movimiento"), { campo: "valor", titulo: "Cantidad", tipo: "entero" }], filas.map(x => ({ etiqueta: x[0], valor: x[1] }))) };
        }
    },
    {
        id: "entregas", titulo: "Entregas sin devolver", sub: "Quién tiene herramienta o equipo", tipo: "barrasH", ancho: 8,
        filtros: async () => [filtro("estado", "Estado", [op("", "Todas"), op("Vencida", "Vencidas"), op("En plazo", "En plazo"), op("Sin fecha", "Sin fecha prevista")], ""), filtro("top", "Mostrar", OP_TOP, "5")],
        async calcular(c, f) {
            const estadoDe = e => { const p = U.aISO(e.fecha_devolucion_prevista); return !p ? "Sin fecha" : A.entregaVencida(e, c.hoy, c.params.dias_gracia_devolucion) ? "Vencida" : "En plazo"; };
            const grupos = new Map();
            (await c.entregas()).filter(e => !f.estado || estadoDe(e) === f.estado).forEach(e => {
                const n = U.nombreCompleto({ nombre: e.empleado_nombre, apellido: e.empleado_apellido }) || "—";
                const g = grupos.get(n) || { etiqueta: n, valor: 0, vencidas: 0 };
                g.valor += num(e.cantidad); if (estadoDe(e) === "Vencida") g.vencidas += num(e.cantidad);
                grupos.set(n, g);
            });
            const lista = [...grupos.values()].sort((a, b) => b.valor - a.valor || a.etiqueta.localeCompare(b.etiqueta));
            return { datos: cap(lista, num(f.top, 5)).map(g => ({ etiqueta: g.etiqueta, valor: g.valor, color: g.vencidas ? ROJO : NARANJA, detalle: g.vencidas ? `${g.vencidas} vencida${g.vencidas === 1 ? "" : "s"}` : "en plazo" })), formato: "entero",
                tabla: tabla([colEtiqueta("Empleado"), { campo: "valor", titulo: "Unidades por devolver", tipo: "entero" }, { campo: "vencidas", titulo: "Vencidas", tipo: "entero" }], lista) };
        }
    },
    {
        id: "perdidas", titulo: "Pérdidas y daños", sub: "Unidades devueltas con problemas", tipo: "apiladas", ancho: 4,
        filtros: async c => [filtro("meses", "Rango", OP_MESES, "6"), await filtroCategoria(c)],
        async calcular(c, f) {
            const { meses } = ventanaMeses(c, num(f.meses, 6));
            const movs = (await movimientosEn(c, f, meses.length)).filter(A.esPerdida);
            const suma = (cond, m) => movs.filter(x => x.condicion === cond && U.periodoDeFecha(U.aISO(x.fecha)) === m).reduce((s, x) => s + num(x.cantidad), 0);
            const series = [["Perdido", ROJO], ["Dañado", NARANJA], ["Incompleto", "#A855F7"]].map(([n, color]) => ({ nombre: n, color, valores: meses.map(m => suma(n, m)) }));
            return { etiquetas: meses.map(m => U.mesCorto(m)), series, formato: "entero", tabla: tabla([{ campo: "periodo", titulo: "Período" }, { campo: "p", titulo: "Perdidas", tipo: "entero" }, { campo: "d", titulo: "Dañadas", tipo: "entero" }, { campo: "i", titulo: "Incompletas", tipo: "entero" }], meses.map((m, i) => ({ periodo: U.nombrePeriodo(m), p: series[0].valores[i], d: series[1].valores[i], i: series[2].valores[i] }))) };
        }
    },
    {
        id: "valor", titulo: "Inversión por categoría", sub: "Valor documentado de las existencias", tipo: "barrasH", ancho: 4,
        filtros: async () => [filtro("alerta", "Estado del stock", [op("", "Todos"), op("Disponible", "Disponibles"), op("Stock bajo", "Stock bajo"), op("Agotado", "Agotados")], "")],
        async calcular(c, f) {
            const [recursos, categorias] = await Promise.all([c.recursos(), c.categorias()]);
            const lista = recursos.filter(r => !f.alerta || A.estadoStock(r) === f.alerta);
            const datos = categorias.map((cat, i) => ({ etiqueta: cat.nombre, color: cat.color || colorDe(i), valor: U.redondear2(lista.filter(r => r.id_categoria === cat.id_categoria && r.costo_unitario !== null && r.costo_unitario !== undefined).reduce((s, r) => s + num(r.cantidad_total) * r.costo_unitario, 0)) }))
                .sort((a, b) => b.valor - a.valor);
            return { datos, formato: "moneda", nota: lista.some(r => r.costo_unitario === null || r.costo_unitario === undefined) ? "Hay recursos sin costo registrado: el total está incompleto." : "", tabla: tabla([colEtiqueta("Categoría"), { campo: "valor", titulo: "Valor documentado", tipo: "moneda" }], datos) };
        }
    }
];
const decimalPct = n => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%";

/* ============================================================
   NÓMINAS
   ============================================================ */
const COLOR_ESTADO_NOMINA = { APROBADA: VERDE, PENDIENTE_APROBACION: NARANJA, EN_PREPARACION: GRIS };

async function aprobadasEn(c, f, meses) {
  const { desde } = ventanaMeses(c, meses);
  return (await c.nominas(desde, c.periodo)).filter(n => n.estado === "APROBADA" && filtroTipoNomina(n, f));
}
function sumarPorMes(aprobadas, meses, campo) {
    return meses.map(m => U.redondear2(aprobadas.filter(n => n.periodo === m).reduce((s, n) => s + (A.montosNomina(n)[campo] || 0), 0)));
}
const G_NOMINAS = [
    {
        id: "tendencia", titulo: "Líquido a pagar por mes", sub: "Líquido, bonificaciones y descuentos", tipo: "area", ancho: 8,
        filtros: async c => [filtro("meses", "Rango", OP_MESES, "6"), filtro("tipo", "Tipo de nómina", await CAT.opcionesTipoNomina(c.repo), "")],
        async calcular(c, f) {
            const { meses } = ventanaMeses(c, num(f.meses, 6));
            const ap = await aprobadasEn(c, f, meses.length);
            const series = [{ nombre: "Líquido", valores: sumarPorMes(ap, meses, "liquido"), color: "#3FB6E8" }, { nombre: "Bonificaciones", valores: sumarPorMes(ap, meses, "bonificaciones"), color: VERDE }, { nombre: "Descuentos", valores: sumarPorMes(ap, meses, "descuentos"), color: ROJO }];
            return { etiquetas: meses.map(m => U.mesCorto(m)), series, formato: "moneda",
                tabla: tabla([{ campo: "periodo", titulo: "Período" }, { campo: "l", titulo: "Líquido", tipo: "moneda" }, { campo: "b", titulo: "Bonificaciones", tipo: "moneda" }, { campo: "d", titulo: "Descuentos", tipo: "moneda" }], meses.map((m, i) => ({ periodo: U.nombrePeriodo(m), l: series[0].valores[i], b: series[1].valores[i], d: series[2].valores[i] }))) };
        }
    },
    {
        id: "estado", titulo: "Estado de las nóminas", sub: "Del período seleccionado", tipo: "donut", ancho: 4,
        filtros: async c => [filtro("tipo", "Tipo de nómina", await CAT.opcionesTipoNomina(c.repo), "")],
        async calcular(c, f) {
            const lista = (await c.nominas(c.periodo, c.periodo)).filter(n => filtroTipoNomina(n, f));
            const datos = Object.keys(A.ESTADO_NOMINA).map(k => ({ etiqueta: A.ESTADO_NOMINA[k], valor: lista.filter(n => n.estado === k).length, color: COLOR_ESTADO_NOMINA[k] }));
            return { datos, centro: { valor: String(lista.length), sub: "nóminas" }, tabla: tabla([colEtiqueta("Estado"), { campo: "valor", titulo: "Nóminas", tipo: "entero" }, { campo: "pct", titulo: "%", tipo: "decimal" }], conPct(datos)) };
        }
    },
    {
        id: "por_puesto", titulo: "Pagos por puesto", sub: "Cuánto se paga a cada grupo", tipo: "barrasH", ancho: 4,
        filtros: async () => [filtro("metrica", "Medir", [op("liquido", "Líquido"), op("bruto", "Ingresos brutos"), op("bonificaciones", "Bonificaciones"), op("descuentos", "Descuentos")], "liquido"), filtro("rango", "Rango", OP_RANGO, "1")],
        async calcular(c, f) {
            const ap = await aprobadasEn(c, {}, num(f.rango, 1));
            const porCodigo = new Map((await c.empleados()).map(e => [e.codigo_empleado, e]));
            const grupos = new Map();
            ap.forEach(n => { const g = A.grupoNomina(n, porCodigo); const x = grupos.get(g) || { etiqueta: g, valor: 0, cantidad: 0 }; x.valor += A.montosNomina(n)[f.metrica] || 0; x.cantidad++; grupos.set(g, x); });
            const datos = ["Técnicos", "Auxiliares", "Administrativos"].map(g => { const x = grupos.get(g) || { etiqueta: g, valor: 0, cantidad: 0 }; return { ...x, valor: U.redondear2(x.valor), color: A.COLORES[g === "Técnicos" ? "tecnicos" : g === "Auxiliares" ? "auxiliares" : "administrativos"], detalle: `${x.cantidad} nómina${x.cantidad === 1 ? "" : "s"}` }; });
            return { datos, formato: "moneda", tabla: tabla([colEtiqueta("Puesto"), { campo: "cantidad", titulo: "Nóminas", tipo: "entero" }, { campo: "valor", titulo: "Monto", tipo: "moneda" }], datos) };
        }
    },
    {
        id: "composicion", titulo: "Composición del pago", sub: "Líquido y descuentos de cada mes", tipo: "apiladas", ancho: 4,
        filtros: async c => [filtro("meses", "Rango", OP_MESES, "6"), filtro("tipo", "Tipo de nómina", await CAT.opcionesTipoNomina(c.repo), "")],
        async calcular(c, f) {
            const { meses } = ventanaMeses(c, num(f.meses, 6));
            const ap = await aprobadasEn(c, f, meses.length);
            const series = [{ nombre: "Líquido", valores: sumarPorMes(ap, meses, "liquido"), color: "#3FB6E8" }, { nombre: "Descuentos", valores: sumarPorMes(ap, meses, "descuentos"), color: ROJO }];
            return { etiquetas: meses.map(m => U.mesCorto(m)), series, formato: "moneda", tabla: tabla([{ campo: "periodo", titulo: "Período" }, { campo: "l", titulo: "Líquido", tipo: "moneda" }, { campo: "d", titulo: "Descuentos", tipo: "moneda" }], meses.map((m, i) => ({ periodo: U.nombrePeriodo(m), l: series[0].valores[i], d: series[1].valores[i] }))) };
        }
    },
    {
        id: "descuentos_top", titulo: "Descuentos por empleado", sub: "Quién acumula más o menos descuentos", tipo: "barrasH", ancho: 8,
        filtros: async c => [filtro("orden", "Orden", [op("mas", "Más descuentos"), op("menos", "Menos descuentos")], "mas"), filtro("rango", "Rango", [op("3", "Últimos 3 meses"), op("1", "Solo el período"), op("6", "Últimos 6 meses"), op("12", "Últimos 12 meses")], "3"), filtro("tipo", "Tipo de nómina", await CAT.opcionesTipoNomina(c.repo), ""), filtro("top", "Mostrar", OP_TOP, "8")],
        async calcular(c, f) {
            const ap = await aprobadasEn(c, f, num(f.rango, 3));
            const grupos = new Map();
            ap.forEach(n => { const k = n.codigo_empleado ? `e${n.codigo_empleado}` : nombreNomina(n); const x = grupos.get(k) || { etiqueta: nombreNomina(n), descuentos: 0, bruto: 0, liquido: 0, nominas: 0 }; const m = A.montosNomina(n); x.descuentos += m.descuentos || 0; x.bruto += m.bruto || 0; x.liquido += m.liquido || 0; x.nominas++; grupos.set(k, x); });
            const lista = [...grupos.values()].map(x => ({ ...x, descuentos: U.redondear2(x.descuentos), bruto: U.redondear2(x.bruto), liquido: U.redondear2(x.liquido), pct: x.bruto ? U.porcentaje(x.descuentos, x.bruto) : 0 }))
                .sort((a, b) => (f.orden === "menos" ? a.descuentos - b.descuentos : b.descuentos - a.descuentos) || a.etiqueta.localeCompare(b.etiqueta));
            return { datos: cap(lista, num(f.top, 8)).map(x => ({ etiqueta: x.etiqueta, valor: x.descuentos, color: f.orden === "menos" ? VERDE : ROJO, detalle: `${decimalPct(x.pct)} de sus ingresos · ${x.nominas} nómina${x.nominas === 1 ? "" : "s"}` })), formato: "moneda",
                tabla: tabla([colEtiqueta("Empleado"), { campo: "nominas", titulo: "Nóminas", tipo: "entero" }, { campo: "bruto", titulo: "Ingresos", tipo: "moneda" }, { campo: "descuentos", titulo: "Descuentos", tipo: "moneda" }, { campo: "pct", titulo: "% descontado", tipo: "decimal" }, { campo: "liquido", titulo: "Líquido", tipo: "moneda" }], cap(lista, 100)) };
        }
    },
    {
        id: "avance", titulo: "Avance de aprobación", sub: "Nóminas aprobadas del período", tipo: "medidor", ancho: 4,
        filtros: async c => [filtro("tipo", "Tipo de nómina", await CAT.opcionesTipoNomina(c.repo), "")],
        async calcular(c, f) {
            const lista = (await c.nominas(c.periodo, c.periodo)).filter(n => filtroTipoNomina(n, f));
            const aprobadas = lista.filter(n => n.estado === "APROBADA").length;
            const pct = U.porcentaje(aprobadas, lista.length);
            return { valor: pct, texto: decimalPct(pct), sub: "aprobado", color: lista.length === 0 ? GRIS : pct >= 100 ? VERDE : pct >= 50 ? CIAN : NARANJA, meta: 100, detalle: `${aprobadas} de ${lista.length} nóminas`,
                tabla: tabla([colEtiqueta("Estado"), { campo: "valor", titulo: "Nóminas", tipo: "entero" }], Object.keys(A.ESTADO_NOMINA).map(k => ({ etiqueta: A.ESTADO_NOMINA[k], valor: lista.filter(n => n.estado === k).length }))) };
        }
    },
    {
        id: "forma_pago", titulo: "Formas de pago", sub: "Cómo se paga a los empleados", tipo: "donut", ancho: 4,
        filtros: async c => [filtro("rango", "Rango", OP_RANGO, "3"), filtro("tipo", "Tipo de nómina", await CAT.opcionesTipoNomina(c.repo), "")],
        async calcular(c, f) {
            const ap = await aprobadasEn(c, f, num(f.rango, 3));
            const g = new Map();
            ap.forEach(n => { const k = (n.snapshot && n.snapshot.pago && n.snapshot.pago.forma_pago) || "Sin definir"; g.set(k, (g.get(k) || 0) + 1); });
            const datos = [...g.entries()].sort((a, b) => b[1] - a[1]).map(([etiqueta, valor], i) => ({ etiqueta, valor, color: colorDe(i + 1) }));
            return { datos, centro: { valor: String(ap.length), sub: "pagos" }, tabla: tabla([colEtiqueta("Forma de pago"), { campo: "valor", titulo: "Pagos", tipo: "entero" }, { campo: "pct", titulo: "%", tipo: "decimal" }], conPct(datos)) };
        }
    },
    {
        id: "cantidad", titulo: "Nóminas aprobadas por mes", sub: "Cuántos comprobantes se emitieron", tipo: "barrasV", ancho: 8,
        filtros: async c => [filtro("meses", "Rango", OP_MESES, "6"), filtro("tipo", "Tipo de nómina", await CAT.opcionesTipoNomina(c.repo), "")],
        async calcular(c, f) {
            const { meses } = ventanaMeses(c, num(f.meses, 6));
            const ap = await aprobadasEn(c, f, meses.length);
            const valores = meses.map(m => ap.filter(n => n.periodo === m).length);
            return { etiquetas: meses.map(m => U.mesCorto(m)), valores, color: "#18BE2D", nombreSerie: "Nóminas aprobadas", formato: "entero", tabla: tabla([{ campo: "periodo", titulo: "Período" }, { campo: "valor", titulo: "Nóminas aprobadas", tipo: "entero" }], meses.map((m, i) => ({ periodo: U.nombrePeriodo(m), valor: valores[i] }))) };
        }
    },
    {
        id: "cobertura", titulo: "Cobertura de la planilla", sub: "Empleados con nómina aprobada", tipo: "donut", ancho: 4,
        filtros: async c => [filtro("grupo", "Puesto", await CAT.opcionesGrupo(c.repo), "")],
        async calcular(c, f) {
            const emps = await empleadosFiltrados(c, { estado: "Activo", grupo: f.grupo });
            const aprobados = new Set((await c.nominas(c.periodo, c.periodo)).filter(n => n.estado === "APROBADA" && n.codigo_empleado).map(n => n.codigo_empleado));
            const con = emps.filter(e => aprobados.has(e.codigo_empleado)).length;
            const datos = [{ etiqueta: "Con nómina aprobada", valor: con, color: VERDE }, { etiqueta: "Sin nómina aprobada", valor: emps.length - con, color: NARANJA }];
            return { datos, centro: { valor: String(emps.length), sub: "activos" }, tabla: tabla([colEtiqueta("Situación"), { campo: "valor", titulo: "Empleados", tipo: "entero" }, { campo: "pct", titulo: "%", tipo: "decimal" }], conPct(datos)) };
        }
    }
];

const GRAFICAS_SIN_ORDEN = [
    ...G_EMPLEADOS.map(g => ({ seccion: "empleados", ...g })),
    ...G_INVENTARIO.map(g => ({ seccion: "inventario", ...g })),
    ...G_NOMINAS.map(g => ({ seccion: "nominas", ...g }))
];
/* Orden de aparición: las filas suman 12 columnas (4 + 8, 4 + 4 + 4…). */
const ORDEN = {
    empleados: ["puestos", "ingresos", "desempeno", "ausencias_tipo", "ausencias_mes", "expedientes", "antiguedad", "edades", "tipos"],
    inventario: ["categorias", "top", "disponibilidad", "movimientos_mes", "stock", "movimientos_tipo", "perdidas", "entregas", "valor"],
    nominas: ["tendencia", "estado", "por_puesto", "composicion", "avance", "descuentos_top", "forma_pago", "cantidad", "cobertura"]
};
const GRAFICAS = GRAFICAS_SIN_ORDEN.sort((a, b) => a.seccion === b.seccion ? ORDEN[a.seccion].indexOf(a.id) - ORDEN[b.seccion].indexOf(b.id) : 0);
const grafica = (seccion, id) => GRAFICAS.find(g => g.seccion === seccion && g.id === id);

/* Acepta solo valores que existen entre las opciones; lo demás cae al valor por defecto. */
function filtrosAplicables(definidos, recibidos = {}) {
    const aplicados = {};
    definidos.forEach(d => {
        const v = recibidos[d.clave];
        aplicados[d.clave] = v !== undefined && d.opciones.some(o => o.valor === v) ? v : d.defecto;
    });
    return aplicados;
}

/* Calcula una gráfica completa (con sus filtros definidos y los aplicados). */
async function resolverGrafica(def, c, recibidos) {
    const filtros = await def.filtros(c);
    const aplicados = filtrosAplicables(filtros, recibidos);
    const datos = await def.calcular(c, aplicados);
    return { id: def.id, seccion: def.seccion, titulo: def.titulo, sub: def.sub, tipo: def.tipo, ancho: def.ancho, filtros, filtrosAplicados: aplicados, ...datos };
}

module.exports = { GRAFICAS, grafica, crearContexto, resolverGrafica, filtrosAplicables };
