const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const { crearServicioReportes } = require("../servicios/reportes.servicio");
const { crearRepositorioReportesMemoria, crearDatosDemo } = require("../servicios/repositorioReportesMemoria");
const { REPORTES } = require("../servicios/reportes/definiciones");
const U = require("../servicios/reportes/util");
const A = require("../servicios/reportes/agregadores");

const AHORA = new Date(2026, 5, 30, 10, 0); // 30 de junio de 2026, hora local
const TODOS = ["Empleados", "Inventario", "Nóminas", "Reportes", "Usuarios"];

function nuevo(opciones = {}) {
    let reloj = AHORA;
    const repo = crearRepositorioReportesMemoria(crearDatosDemo("2026-06-30"), { ahora: () => reloj });
    const enviados = [];
    const servicio = crearServicioReportes({
        repo, ahora: () => reloj,
        enviarCorreo: opciones.sinCorreo ? null : async m => { enviados.push(m); return { enviado: true }; }
    });
    return { repo, servicio, enviados, mover: f => { reloj = f; } };
}
const ctx = (accesos = TODOS) => ({ usuario: { id_credencial: 1, nombre: "Jonathan Admin" }, accesos });

test("utilidades de período", () => {
    assert.equal(U.sumarMeses("2026-01", -1), "2025-12");
    assert.equal(U.sumarMeses("2026-12", 1), "2027-01");
    assert.deepEqual(U.ultimosPeriodos("2026-02", 3), ["2025-12", "2026-01", "2026-02"]);
    assert.deepEqual(U.rangoPeriodo("2024-02"), { desde: "2024-02-01", hasta: "2024-02-29" });
    assert.equal(U.nombrePeriodo("2026-06"), "Junio 2026");
    assert.equal(U.aISO(new Date(Date.UTC(2026, 5, 30))), "2026-06-30");
    assert.equal(U.aniosCumplidos("2020-06-30", "2026-06-29"), 5);
    assert.equal(U.aniosCumplidos("2020-06-30", "2026-06-30"), 6);
});

test("dashboard de empleados: conteos y composición coinciden con los datos", async () => {
    const { servicio, repo } = nuevo();
    const d = await servicio.dashboard("empleados", "2026-06", ctx());
    const emps = await repo.empleados();
    const activos = emps.filter(e => e.activo);
    assert.equal(d.kpis[0].valor, activos.length);
    assert.equal(d.kpis[1].valor + d.kpis[2].valor + d.kpis[3].valor, activos.length);
    assert.equal(d.estado.total, emps.length);
    assert.equal(d.estado.inactivos, emps.length - activos.length);
    assert.equal(d.antiguedad.reduce((s, x) => s + x.valor, 0), activos.length);
    const suma = d.composicion.reduce((s, x) => s + x.pct, 0);
    assert.ok(Math.abs(suma - 100) < 0.5, `la composición suma ${suma}`);
    assert.equal(d.ingresos.etiquetas.length, 6);
    assert.deepEqual(d.ingresos.valores, [2, 1, 3, 2, 4, 1]);
});

test("rangos de antigüedad se arman con los cortes configurados", () => {
    const r = A.antiguedadRangos([1, 4, 7]).map(x => x.etiqueta);
    assert.deepEqual(r, ["Menos de 1 año", "1-3 años", "4-6 años", "Más de 6 años"]);
    assert.deepEqual(A.antiguedadRangos([2]).map(x => x.etiqueta), ["Menos de 2 años", "Más de 1 año"]);
});

test("dashboard de inventario: existencias, inversión y alertas", async () => {
    const { servicio, repo } = nuevo();
    const d = await servicio.dashboard("inventario", "2026-06", ctx());
    const rs = await repo.recursos();
    const unidades = rs.reduce((s, r) => s + r.cantidad_total, 0);
    const inversion = rs.filter(r => r.costo_unitario !== null).reduce((s, r) => s + r.cantidad_total * r.costo_unitario, 0);
    assert.equal(d.kpis[1].valor, unidades);
    assert.equal(d.kpis[2].valor, Math.round(inversion * 100) / 100);
    assert.equal(d.existencias.disponibles + d.existencias.asignadas, unidades);
    assert.equal(d.distribucion.reduce((s, x) => s + x.valor, 0), unidades);
    assert.equal(d.top.length, 5);
    assert.ok(d.top[0].valor >= d.top[4].valor);
    const textos = d.alertas.map(a => a.texto).join(" | ");
    assert.match(textos, /agotado/);
    assert.match(textos, /devolución vencida/);
    assert.ok(d.alertas[0].nivel === "critico", "las alertas críticas van primero");
    const m = Object.fromEntries(d.movimientos.resumen.map(x => [x.etiqueta, x.valor]));
    assert.equal(m["Entradas"], 10);          // 6 + 4 en junio
    assert.equal(m["Pérdidas y daños"], 3);   // 2 dañados + 1 perdido
    assert.equal(d.control.ultimaEntrada, "2026-06-18");
});

test("entregas vencidas respetan los días de gracia", async () => {
    const { servicio } = nuevo();
    await servicio.guardarParametros({ dias_gracia_devolucion: "30" }, ctx());
    const d = await servicio.dashboard("inventario", "2026-06", ctx());
    assert.equal(d.salud.find(s => s.clave === "vencidas").valor, 0);
});

test("dashboard de nóminas: los totales salen de las fotografías aprobadas", async () => {
    const { servicio, repo } = nuevo();
    const d = await servicio.dashboard("nominas", "2026-06", ctx());
    const aprobadas = (await repo.nominas({ desdePeriodo: "2026-06", hastaPeriodo: "2026-06" })).filter(n => n.estado === "APROBADA");
    const liquido = Math.round(aprobadas.reduce((s, n) => s + n.total_centavos, 0)) / 100;
    assert.equal(d.kpis[0].valor, liquido);
    // líquido = ingresos brutos − descuentos
    assert.equal(Math.round((d.kpis[1].valor - d.kpis[3].valor) * 100), Math.round(d.kpis[0].valor * 100));
    assert.equal(d.porGrupo.reduce((s, g) => s + g.valor, 0).toFixed(2), liquido.toFixed(2));
    assert.equal(d.estadoPagos[0].valor, aprobadas.length);
    assert.equal(d.avance.aprobadas, aprobadas.length);
    assert.equal(d.tendencia.liquido.length, 6);
    assert.equal(d.tendencia.liquido[5], liquido);
    assert.ok(d.kpis[0].variacion.pct !== undefined);
});

test("período cerrado con nóminas sin aprobar genera alerta crítica", async () => {
    const { servicio, repo } = nuevo();
    repo._cerrados.push("2026-06");
    const d = await servicio.dashboard("nominas", "2026-06", ctx());
    assert.equal(d.avance.estado, "Cerrado");
    assert.ok(d.alertas.some(a => a.nivel === "critico"));
});

test("permisos: sin acceso a Nóminas no se ve nada de nómina", async () => {
    const { servicio } = nuevo();
    const c = ctx(["Empleados", "Reportes"]);
    await assert.rejects(() => servicio.dashboard("nominas", "2026-06", c), e => e.status === 403);
    await assert.rejects(() => servicio.tabla("nominas_planilla", { periodo: "2026-06" }, c), e => e.status === 403);
    const r = await servicio.resumen("2026-06", c);
    assert.ok(r.personal && !r.nomina && !r.inventario);
    assert.ok(r.reportes.every(x => x.modulo === "Empleados"));
    assert.ok(r.alertas.every(a => a.origen === "Empleados"));
    // "Nominas" sin tilde también cuenta
    await servicio.dashboard("nominas", "2026-06", ctx(["Nominas"]));
});

test("resumen reúne las tres áreas", async () => {
    const { servicio } = nuevo();
    const r = await servicio.resumen("2026-06", ctx());
    assert.ok(r.personal.total > 0 && r.inventario.recursos > 0 && r.nomina.esperadas > 0);
    assert.equal(r.nomina.checks.length, 3);
    assert.equal(r.reportes.length, REPORTES.length);
});

test("período inválido se rechaza", async () => {
    const { servicio } = nuevo();
    await assert.rejects(() => servicio.dashboard("empleados", "2026-13", ctx()), e => e.status === 400);
    await assert.rejects(() => servicio.dashboard("nada", "2026-06", ctx()), e => e.status === 404);
});

test("la caché reutiliza el resultado y se puede refrescar o limpiar", async () => {
    const { servicio, repo } = nuevo();
    const a = await servicio.dashboard("inventario", "2026-06", ctx());
    assert.equal(a.desdeCache, false);
    repo._datos.recursos[0].cantidad_total = 999;
    assert.equal((await servicio.dashboard("inventario", "2026-06", ctx())).desdeCache, true);
    const r = await servicio.dashboard("inventario", "2026-06", ctx(), { refrescar: true });
    assert.equal(r.desdeCache, false);
    assert.ok(r.kpis[1].valor > 900);
    servicio.limpiarCache();
    assert.equal(servicio.estadoCache().entradas, 0);
    await servicio.guardarParametros({ cache_segundos: "0" }, ctx());
    await servicio.dashboard("inventario", "2026-06", ctx());
    assert.equal(servicio.estadoCache().entradas, 0, "con 0 segundos no se guarda caché");
});

test("todos los reportes del catálogo se consultan y exportan sin error", async () => {
    const { servicio } = nuevo();
    for (const def of REPORTES) {
        const t = await servicio.tabla(def.clave, { periodo: "2026-06" }, ctx());
        assert.ok(Array.isArray(t.filas), def.clave);
        assert.ok(t.columnas.length > 0, def.clave);
        t.filtros.forEach(f => assert.ok(f.opciones.some(o => o.valor === f.defecto), `${def.clave}: el filtro ${f.clave} tiene un defecto fuera de sus opciones`));
        const x = await servicio.exportarTabla(def.clave, { periodo: "2026-06" }, ctx());
        const libro = XLSX.read(x.buffer, { type: "buffer" });
        assert.equal(libro.SheetNames.length, 2, def.clave);
        const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]]);
        assert.equal(filas.length, t.total + (def.totales && t.total ? 1 : 0), `${def.clave}: el Excel debe tener todas las filas (más la fila de totales)`);
    }
});

test("tabla: búsqueda sin acentos, orden, paginación y totales", async () => {
    const { servicio } = nuevo();
    const todo = await servicio.tabla("inventario_existencias", {}, ctx());
    assert.equal(todo.total, 14);
    assert.equal(todo.totales.total, 109);
    const busq = await servicio.tabla("inventario_existencias", { texto: "caiman" }, ctx());
    assert.equal(busq.total, 2); // Caimán y Caimanete
    const orden = await servicio.tabla("inventario_existencias", { orden: "total", dir: "desc" }, ctx());
    assert.ok(orden.filas[0].total >= orden.filas[1].total);
    const pag = await servicio.tabla("inventario_existencias", { porPagina: 5, pagina: 3 }, ctx());
    assert.equal(pag.filas.length, 4);
    assert.equal(pag.paginas, 3);
    const fuera = await servicio.tabla("inventario_existencias", { porPagina: 5, pagina: 99 }, ctx());
    assert.equal(fuera.pagina, 3, "una página fuera de rango se corrige");
    const agot = await servicio.tabla("inventario_existencias", { filtros: { alerta: "Agotado" } }, ctx());
    assert.ok(agot.filas.length > 0 && agot.filas.every(f => f.alerta === "Agotado"));
    const malo = await servicio.tabla("inventario_existencias", { filtros: { alerta: "inventado" } }, ctx());
    assert.equal(malo.total, todo.total, "un valor de filtro inválido se ignora");
});

test("vacíos van al final al ordenar y los totales de nómina cuadran", async () => {
    const { servicio } = nuevo();
    const t = await servicio.tabla("nominas_planilla", { periodo: "2026-06", orden: "liquido", dir: "desc", porPagina: 200 }, ctx());
    const conLiquido = t.filas.filter(f => f.liquido !== null);
    assert.equal(t.filas.slice(0, conLiquido.length).every(f => f.liquido !== null), true);
    const suma = Math.round(conLiquido.reduce((s, f) => s + f.liquido, 0) * 100) / 100;
    assert.equal(t.totales.liquido, suma);
    const aprobadas = await servicio.tabla("nominas_planilla", { periodo: "2026-06", filtros: { estado: "APROBADA" } }, ctx());
    assert.ok(aprobadas.filas.every(f => f.estado === "Aprobada"));
});

test("historial de pagos respeta el rango de meses", async () => {
    const { servicio } = nuevo();
    const uno = await servicio.tabla("nominas_historial", { periodo: "2026-06", filtros: { meses: "1" }, porPagina: 200 }, ctx());
    const seis = await servicio.tabla("nominas_historial", { periodo: "2026-06", filtros: { meses: "6" }, porPagina: 200 }, ctx());
    assert.ok(uno.total > 0 && seis.total > uno.total);
    assert.ok(uno.filas.every(f => f.periodo === "2026-06"));
});

test("exportación: CSV con BOM y protección contra fórmulas; bitácora; límite de filas", async () => {
    const { servicio, repo } = nuevo();
    repo._datos.recursos[0].nombre = '=HYPERLINK("http://malo")';
    const csv = await servicio.exportarTabla("inventario_existencias", {}, ctx(), { formato: "csv" });
    const texto = csv.buffer.toString("utf8");
    assert.ok(texto.startsWith("﻿Código,Recurso"));
    assert.ok(texto.includes("\"'=HYPERLINK"), "las celdas que empiezan con = se neutralizan");
    assert.ok(csv.nombre.endsWith(".csv"));
    assert.equal(repo._bitacora.length, 1);
    assert.equal(repo._bitacora[0].accion, "EXPORTAR");
    assert.equal(repo._bitacora[0].usuario, "Jonathan Admin");
    await assert.rejects(() => servicio.exportarTabla("inventario_existencias", {}, ctx(), { formato: "pdf" }), e => e.status === 400);
    await servicio.guardarParametros({ maximo_filas_exportar: "100" }, ctx());
    await servicio.exportarTabla("inventario_existencias", {}, ctx());
    // 14 filas caben; al bajar al mínimo permitido (100) sigue funcionando
    const mov = await servicio.exportarDashboard("nominas", "2026-06", ctx());
    const libro = XLSX.read(mov.buffer, { type: "buffer" });
    assert.ok(libro.SheetNames.includes("Resumen") && libro.SheetNames.includes("Líquido por mes"));
});

test("exportar el dashboard exige acceso al módulo", async () => {
    const { servicio } = nuevo();
    await assert.rejects(() => servicio.exportarDashboard("nominas", "2026-06", ctx(["Empleados"])), e => e.status === 403);
});

test("parámetros: se validan, se guardan y mandan sobre el valor de fábrica", async () => {
    const { servicio } = nuevo();
    const lista = await servicio.parametrosParaEditar();
    assert.equal(lista.find(p => p.clave === "dias_sin_conteo").valor, "90");
    assert.equal(lista.find(p => p.clave === "dias_sin_conteo").personalizado, false);
    await assert.rejects(() => servicio.guardarParametros({ dias_sin_conteo: "abc" }, ctx()), e => e.status === 400);
    await assert.rejects(() => servicio.guardarParametros({ dias_sin_conteo: "1" }, ctx()), e => /entre 7 y 730/.test(e.message));
    await assert.rejects(() => servicio.guardarParametros({ antiguedad_cortes: "4,2" }, ctx()), e => /menor a mayor/.test(e.message));
    await assert.rejects(() => servicio.guardarParametros({ inventado: "1" }, ctx()), e => /no existe/.test(e.message));
    await servicio.guardarParametros({ dias_sin_conteo: "20", antiguedad_cortes: "2,5" }, ctx());
    const d = await servicio.dashboard("inventario", "2026-06", ctx());
    assert.ok(d.alertas.some(a => /31 días desde el último conteo/.test(a.texto)), "con 20 días de máximo, 31 días es alerta");
    const e = await servicio.dashboard("empleados", "2026-06", ctx());
    assert.deepEqual(e.antiguedad.map(x => x.etiqueta), ["Menos de 2 años", "2-4 años", "Más de 4 años"]);
});

test("visibilidad: un reporte oculto sale del catálogo pero sigue consultable por administración", async () => {
    const { servicio } = nuevo();
    await servicio.cambiarVisibilidad("empleados_permisos", false, ctx());
    assert.ok(!(await servicio.catalogo(ctx())).some(r => r.clave === "empleados_permisos"));
    assert.ok((await servicio.catalogo(ctx(), { incluirOcultos: true })).some(r => r.clave === "empleados_permisos"));
    assert.equal((await servicio.listaVisibilidad()).find(r => r.clave === "empleados_permisos").activo, false);
    await assert.rejects(() => servicio.cambiarVisibilidad("no_existe", true, ctx()), e => e.status === 404);
});

test("costos de recursos: validación y efecto en la inversión", async () => {
    const { servicio } = nuevo();
    const antes = (await servicio.dashboard("inventario", "2026-06", ctx())).kpis[2].valor;
    await assert.rejects(() => servicio.guardarCosto(14, "abc", ctx()), e => e.status === 400);
    await assert.rejects(() => servicio.guardarCosto(999, "10", ctx()), e => e.status === 404);
    await servicio.guardarCosto(14, "Q 25.50", ctx());   // 0 unidades → no cambia la inversión
    await servicio.guardarCosto(1, "100", ctx());          // 8 unidades: de 85 a 100 = +120
    const despues = (await servicio.dashboard("inventario", "2026-06", ctx())).kpis[2].valor;
    assert.equal(Math.round((despues - antes) * 100) / 100, 120);
    await servicio.guardarCosto(1, "", ctx());             // quitar el costo
    assert.equal((await servicio.costosRecursos()).find(r => r.id_recurso === 1).costo_unitario, null);
});

test("calidad de datos detecta los problemas sembrados", async () => {
    const { servicio } = nuevo();
    const c = await servicio.calidadDatos();
    const por = Object.fromEntries(c.map(x => [x.clave, x]));
    assert.equal(por.tecnicos_sin_clasificar.cantidad, 3);
    assert.equal(por.recursos_sin_costo.cantidad, 1);
    assert.ok(por.expedientes_incompletos.cantidad > 0);
    assert.equal(por.disponible_mayor_total.severidad, "ok");
});

test("programados: validación de datos", async () => {
    const { servicio } = nuevo();
    const base = { nombre: "Existencias semanales", reporte: "inventario_existencias", frecuencia: "SEMANAL", dia: 1, hora: "07:00", destinatarios: "a@b.com, c@d.org" };
    const ok = await servicio.crearProgramado(base, ctx());
    assert.equal(ok.destinatarios, "a@b.com, c@d.org");
    for (const [cambio, patron] of [
        [{ nombre: "" }, /nombre/], [{ reporte: "x" }, /reporte/], [{ frecuencia: "HORARIA" }, /frecuencia/], [{ dia: 9 }, /día/],
        [{ hora: "25:00" }, /hora/], [{ destinatarios: "sin-arroba" }, /correo/], [{ destinatarios: "" }, /al menos un correo/], [{ formato: "pdf" }, /formato/]
    ]) {
        await assert.rejects(() => servicio.crearProgramado({ ...base, ...cambio }, ctx()), e => patron.test(e.message), JSON.stringify(cambio));
    }
    await assert.rejects(() => servicio.crearProgramado({ ...base, frecuencia: "MENSUAL", dia: 31 }, ctx()), e => /1 y 28/.test(e.message));
});

test("programados: se ejecutan solo cuando tocan y una sola vez", async () => {
    const { servicio, repo, enviados, mover } = nuevo();
    mover(new Date(2026, 5, 30, 6, 0));      // martes 30 de junio, 06:00
    const diario = await servicio.crearProgramado({ nombre: "Diario", reporte: "inventario_existencias", frecuencia: "DIARIA", hora: "07:00", destinatarios: "a@b.com" }, ctx());
    assert.deepEqual(await servicio.ejecutarPendientes(), [], "recién creado no se dispara por horas pasadas");
    mover(new Date(2026, 5, 30, 7, 1));
    assert.deepEqual(await servicio.ejecutarPendientes(), [diario.id_programado]);
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].adjuntos[0].filename.endsWith(".xlsx"), true);
    assert.deepEqual(await servicio.ejecutarPendientes(), [], "no se repite el mismo día");
    mover(new Date(2026, 6, 1, 7, 0));
    assert.deepEqual(await servicio.ejecutarPendientes(), [diario.id_programado], "al día siguiente sí");
    const lista = await servicio.listarProgramados();
    assert.match(lista[0].ultimo_estado, /Enviado a a@b.com/);
    assert.ok(lista[0].proxima);
    // pausado no se ejecuta
    await servicio.actualizarProgramado(diario.id_programado, { activo: false });
    mover(new Date(2026, 6, 2, 8, 0));
    assert.deepEqual(await servicio.ejecutarPendientes(), []);
    assert.equal(repo._bitacora.filter(b => b.accion === "PROGRAMADO").length, 2);
});

test("programados: si el correo no está configurado queda registrado, sin tronar", async () => {
    const { servicio } = nuevo({ sinCorreo: true });
    const p = await servicio.crearProgramado({ nombre: "X", reporte: "empleados_activos", frecuencia: "MENSUAL", dia: 1, hora: "08:00", destinatarios: "a@b.com" }, ctx());
    const r = await servicio.ejecutarProgramado(p.id_programado, { manual: true });
    assert.match(r.estado, /Correo no configurado/);
    assert.match((await servicio.listarProgramados())[0].ultimo_estado, /^\(manual\)/);
});

test("programados: cálculo de la última hora programada (semanal y mensual)", () => {
    const { servicio } = nuevo();
    const sem = { frecuencia: "SEMANAL", dia: 1, hora: "07:00" };   // lunes
    assert.equal(U.aISOHora(new Date(Date.UTC(2026, 5, 29, 7, 0))), "2026-06-29 07:00");
    const t = servicio._ultimaProgramada(sem, new Date(2026, 5, 30, 10, 0)); // martes 30
    assert.equal(`${t.getMonth() + 1}/${t.getDate()} ${t.getHours()}`, "6/29 7");   // lunes 29
    const lunesTemprano = servicio._ultimaProgramada(sem, new Date(2026, 5, 29, 6, 0));
    assert.equal(lunesTemprano.getDate(), 22, "el mismo lunes antes de la hora cuenta el lunes anterior");
    const mes = servicio._ultimaProgramada({ frecuencia: "MENSUAL", dia: 15, hora: "07:00" }, new Date(2026, 5, 10, 10, 0));
    assert.equal(`${mes.getMonth() + 1}/${mes.getDate()}`, "5/15");
});

test("bitácora: filtros, paginación y depuración", async () => {
    const { servicio } = nuevo();
    await servicio.exportarTabla("empleados_activos", {}, ctx());
    await servicio.exportarDashboard("inventario", "2026-06", ctx());
    const b = await servicio.listarBitacora({});
    assert.equal(b.total, 2);
    assert.equal(b.filas[0].reporteNombre, "Dashboard de inventario");
    assert.equal((await servicio.listarBitacora({ reporte: "empleados_activos" })).total, 1);
    assert.equal((await servicio.listarBitacora({ usuario: "jonathan" })).total, 2);
    assert.equal((await servicio.depurarBitacora()).borradas, 0);
});

/* ---------- regla: Reportes tampoco muestra meses que todavía no llegan ---------- */
test("el selector de período marca en gris los meses futuros y el servidor los rechaza", async () => {
    const servicio = crearServicioReportes({ repo: crearRepositorioReportesMemoria(), ahora: () => new Date(2026, 9, 16) });   // 16/10/2026
    const { actual, opciones } = servicio.periodos();
    assert.equal(actual, "2026-10");
    assert.deepEqual(opciones.filter(o => o.disponible === false).map(o => o.valor), ["2026-12", "2026-11"]);
    assert.equal(opciones.find(o => o.valor === "2026-10").disponible, true);
    await assert.rejects(() => servicio.dashboard("nominas", "2026-12", { accesos: ["Nóminas"] }), e => e.status === 409 && /todavía no ha llegado/.test(e.message));
});
