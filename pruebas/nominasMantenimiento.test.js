const test = require("node:test");
const assert = require("node:assert/strict");
const { TIPOS } = require("../configuracion/nominas.config");
const { catalogoParametros, convertirValor, aplicarParametros } = require("../servicios/nominasParametros");
const { crearServicioNominas } = require("../servicios/nominas.servicio");
const { crearServicioNominasMantenimiento } = require("../servicios/nominasMantenimiento.servicio");
const { crearRepositorioMemoria } = require("../servicios/repositorioMemoria");
const Calc = require("../public/js/nominas-calculo");

const ctx = { usuario: { id_credencial: 1, nombre: "Admin" } };
const EMPLEADO = { codigo_empleado: 7, nombre: "Ana", apellido: "Pérez", activo: true, tipo_empleado: "AUXILIAR", salario_base: 3500, puesto: "Auxiliar" };

/* Repositorio con las funciones de mantenimiento que en producción implementa modelos/nominas.model.js. */
function repoConMantenimiento() {
    const repo = crearRepositorioMemoria({ empleados: [EMPLEADO] });
    const bitacora = [];
    let id = 1;
    Object.assign(repo, {
        async listarParametros(tipo) { return repo._parametros.filter(p => p.tipo === tipo).map(p => ({ ...p })); },
        async guardarParametro(p) {
            const i = repo._parametros.findIndex(x => x.tipo === p.tipo && x.clave === p.clave && x.vigente_desde === p.vigente_desde);
            const previo = i >= 0 ? repo._parametros[i].valor : null;
            const fila = { id_parametro: id++, tipo: p.tipo, clave: p.clave, valor: p.valor, vigente_desde: p.vigente_desde, motivo: p.motivo };
            if (i >= 0) repo._parametros[i] = fila; else repo._parametros.push(fila);
            return previo;
        },
        async eliminarParametro({ tipo, clave, vigente_desde }) {
            const i = repo._parametros.findIndex(x => x.tipo === tipo && x.clave === clave && x.vigente_desde === vigente_desde);
            if (i < 0) return null;
            return repo._parametros.splice(i, 1)[0].valor;
        },
        async registrarBitacoraParametro(b) { bitacora.unshift({ ...b, id_bitacora: bitacora.length + 1, fecha: new Date() }); },
        async bitacoraParametros() { return { filas: bitacora, total: bitacora.length }; },
        async estadoPeriodos() { return { conteos: [{ periodo: "2026-06", estado: "EN_PREPARACION", total: 2 }, { periodo: "2026-06", estado: "APROBADA", total: 5 }], cierres: repo._cerrados.map(p => ({ periodo: p, estado: "CERRADO", usuario: "Admin", fecha: new Date(), motivo: null })) }; },
        async marcarPeriodo({ periodo, estado }) {
            const i = repo._cerrados.indexOf(periodo);
            if (estado === "CERRADO" && i < 0) repo._cerrados.push(periodo);
            if (estado === "ABIERTO" && i >= 0) repo._cerrados.splice(i, 1);
        },
        async historialGeneral() { return { filas: [], total: 0 }; },
        _bitacora: bitacora
    });
    return repo;
}

test("sin cambios guardados las reglas son idénticas a las de fábrica", () => {
    for (const tipo of Object.keys(TIPOS)) {
        assert.deepEqual(aplicarParametros(TIPOS[tipo], [], "2026-06"), TIPOS[tipo]);
    }
    // y nunca modifica el original
    const antes = JSON.stringify(TIPOS);
    aplicarParametros(TIPOS.TECNICO_SOCIO, [{ clave: "tasas.iva_bp", valor: 1, vigente_desde: "2020-01" }], "2026-06");
    assert.equal(JSON.stringify(TIPOS), antes);
});

test("la vigencia manda: un cambio de julio no toca junio", () => {
    const filas = [{ clave: "tasas.iva_bp", valor: 1300, vigente_desde: "2026-07" }, { clave: "tasas.iva_bp", valor: 1250, vigente_desde: "2026-09" }];
    const en = p => aplicarParametros(TIPOS.TECNICO_SOCIO, filas, p).tasas.iva_bp;
    assert.equal(en("2026-06"), 1200);
    assert.equal(en("2026-07"), 1300);
    assert.equal(en("2026-08"), 1300);
    assert.equal(en("2026-09"), 1250);
    assert.equal(en("2027-01"), 1250);
});

test("se pueden cambiar tasas, montos, cargos y precios sin tocar otros tipos", () => {
    const filas = [
        { clave: "tasas.aporte_seisa_bp", valor: 800, vigente_desde: "2026-06" },
        { clave: "mantenimiento_vehiculos", valor: 15000, vigente_desde: "2026-06" },
        { clave: "cargo.gps", valor: 17500, vigente_desde: "2026-06" },
        { clave: "precio.INSPECCIÓN.produccion", valor: 2800, vigente_desde: "2026-06" },
        { clave: "precio.ACTIVIDAD NUEVA.bono", valor: 900, vigente_desde: "2026-06" }
    ];
    const r = aplicarParametros(TIPOS.TECNICO_SOCIO, filas, "2026-06");
    assert.equal(r.tasas.aporte_seisa_bp, 800);
    assert.equal(r.mantenimiento_vehiculos, 15000);
    assert.equal(r.cargosSeisa.find(c => c.clave === "gps").monto, 17500);
    assert.equal(r.cargosSeisa.find(c => c.clave === "sueldo_completo").origen, "produccion_sin_iva");
    assert.deepEqual(r.precios["INSPECCIÓN"], { produccion: 2800, bono: 500 });
    assert.deepEqual(r.precios["ACTIVIDAD NUEVA"], { produccion: null, bono: 900 });
    assert.equal(TIPOS.TECNICO_NO_SOCIO.tasas.aporte_seisa_bp, 1000);
});

test("catálogo de parámetros por tipo", () => {
    const tec = catalogoParametros("TECNICO_SOCIO", ["ACTIVIDAD NUEVA"]);
    assert.ok(tec.some(p => p.clave === "tasas.iva_bp" && p.base === 1200));
    assert.ok(tec.some(p => p.clave === "cargo.gps" && p.base === 15800));
    assert.ok(!tec.some(p => p.clave === "cargo.sueldo_completo"), "el cargo calculado no se edita");
    assert.ok(tec.some(p => p.clave === "precio.ACTIVIDAD NUEVA.bono" && p.nueva));
    const adm = catalogoParametros("ADMINISTRATIVA");
    assert.deepEqual(adm.map(p => p.clave).sort(), ["bonificacion_ley", "tasas.igss_laboral_bp"]);
});

test("conversión de lo que se escribe a la unidad interna", () => {
    assert.deepEqual(convertirValor("pct", "12"), { valor: 1200 });
    assert.deepEqual(convertirValor("pct", "4.83 %"), { valor: 483 });
    assert.deepEqual(convertirValor("quetzales", "Q 1,250.50"), { valor: 125050 });
    assert.ok(convertirValor("pct", "101").error);
    assert.ok(convertirValor("pct", "12.345").error);
    assert.ok(convertirValor("quetzales", "-5").error);
    assert.ok(convertirValor("quetzales", "").error);
    assert.ok(convertirValor("quetzales", "2000000").error);
});

test("mantenimiento: valida, guarda con vigencia y deja bitácora", async () => {
    const repo = repoConMantenimiento();
    const m = crearServicioNominasMantenimiento({ repo, ahora: () => new Date(2026, 5, 30) });
    await assert.rejects(() => m.guardarParametro({ tipo: "X", clave: "tasas.iva_bp", valor: "12", vigente_desde: "2026-07", motivo: "m" }, ctx), /Tipo/);
    await assert.rejects(() => m.guardarParametro({ tipo: "ADMINISTRATIVA", clave: "tasas.inventada", valor: "12", vigente_desde: "2026-07", motivo: "m" }, ctx), /no se puede modificar/);
    await assert.rejects(() => m.guardarParametro({ tipo: "ADMINISTRATIVA", clave: "tasas.igss_laboral_bp", valor: "5", vigente_desde: "julio", motivo: "m" }, ctx), /AAAA-MM/);
    await assert.rejects(() => m.guardarParametro({ tipo: "ADMINISTRATIVA", clave: "tasas.igss_laboral_bp", valor: "5", vigente_desde: "2026-07", motivo: "" }, ctx), /motivo/);
    await m.guardarParametro({ tipo: "ADMINISTRATIVA", clave: "tasas.igss_laboral_bp", valor: "5.25", vigente_desde: "2026-07", motivo: "Reforma IGSS" }, ctx);
    assert.equal(repo._parametros[0].valor, 525);

    const junio = (await m.parametros("ADMINISTRATIVA", "2026-06")).find(p => p.clave === "tasas.igss_laboral_bp");
    assert.equal(junio.vigente, 4.83);
    assert.equal(junio.personalizado, false);
    assert.equal(junio.cambios[0].futuro, true);
    const julio = (await m.parametros("ADMINISTRATIVA", "2026-07")).find(p => p.clave === "tasas.igss_laboral_bp");
    assert.equal(julio.vigente, 5.25);
    assert.equal(julio.vigenteDesde, "2026-07");

    await m.guardarParametro({ tipo: "ADMINISTRATIVA", clave: "tasas.igss_laboral_bp", valor: "5.50", vigente_desde: "2026-07", motivo: "Corrección" }, ctx);
    assert.equal(repo._parametros.length, 1, "mismo período: reemplaza, no duplica");
    assert.deepEqual(repo._bitacora.map(b => b.accion), ["MODIFICAR", "CREAR"]);
    assert.equal(repo._bitacora[0].valor_anterior, 525);

    await m.restablecer({ tipo: "ADMINISTRATIVA", clave: "tasas.igss_laboral_bp", vigente_desde: "2026-07" }, ctx);
    assert.equal(repo._parametros.length, 0);
    assert.equal(repo._bitacora[0].accion, "ELIMINAR");
    await assert.rejects(() => m.restablecer({ tipo: "ADMINISTRATIVA", clave: "tasas.igss_laboral_bp", vigente_desde: "2026-07" }, ctx), e => e.status === 404);
});

test("la nómina usa el parámetro vigente en SU período y la aprobada no cambia", async () => {
    const repo = repoConMantenimiento();
    const nominas = crearServicioNominas({ repo, almacen: {}, ahora: () => new Date(2026, 6, 15) });
    const m = crearServicioNominasMantenimiento({ repo });

    const junio = await nominas.abrirOCrear({ tipo: "ADMINISTRATIVA", periodo: "2026-06", codigo_empleado: 7 }, ctx);
    let v = await nominas.vista(junio.id_nomina);
    assert.equal(v.calculo.igssSugerido, 16905);   // 4.83 % de Q 3,500.00
    assert.equal(v.reglas.tasas.igss_laboral_bp, 483);

    await m.guardarParametro({ tipo: "ADMINISTRATIVA", clave: "tasas.igss_laboral_bp", valor: "5", vigente_desde: "2026-07", motivo: "Prueba" }, ctx);
    v = await nominas.vista(junio.id_nomina);
    assert.equal(v.calculo.igssSugerido, 16905, "junio no cambia");

    const julio = await nominas.abrirOCrear({ tipo: "ADMINISTRATIVA", periodo: "2026-07", codigo_empleado: 7 }, ctx);
    const vj = await nominas.vista(julio.id_nomina);
    assert.equal(vj.calculo.igssSugerido, 17500);  // 5 % de Q 3,500.00
    assert.equal(vj.reglas.tasas.igss_laboral_bp, 500);

    // El front calcula con v.reglas y obtiene lo mismo que el servidor
    assert.equal(Calc.calcularAdministrativa(vj.planilla ? { planilla: vj.planilla, descuentos_extra: [] } : {}, vj.reglas).igssSugerido, 17500);

    // aprobar junio y cambiar después la tasa desde junio: el comprobante aprobado queda igual
    let p = await nominas.completarPaso(junio.id_nomina, 1, ctx);
    p = await nominas.aprobar(junio.id_nomina, p.version, ctx);
    const totalAprobado = p.calculo.total;
    await m.guardarParametro({ tipo: "ADMINISTRATIVA", clave: "tasas.igss_laboral_bp", valor: "9", vigente_desde: "2026-06", motivo: "Cambio retroactivo" }, ctx);
    const despues = await nominas.vista(junio.id_nomina);
    assert.equal(despues.calculo.total, totalAprobado);
    assert.equal(despues.estado, "APROBADA");
});

test("sin soporte de parámetros en el repositorio todo sigue funcionando como siempre", async () => {
    const repo = crearRepositorioMemoria({ empleados: [EMPLEADO] });
    delete repo.parametrosNomina;
    delete repo.periodoCerrado;
    const nominas = crearServicioNominas({ repo, almacen: {}, ahora: () => new Date(2026, 5, 30) });
    const r = await nominas.abrirOCrear({ tipo: "ADMINISTRATIVA", periodo: "2026-06", codigo_empleado: 7 }, ctx);
    assert.equal((await nominas.vista(r.id_nomina)).calculo.igssSugerido, 16905);
});

test("período cerrado: no admite nóminas nuevas ni aprobar; al reabrir vuelve a funcionar", async () => {
    const repo = repoConMantenimiento();
    const nominas = crearServicioNominas({ repo, almacen: {}, ahora: () => new Date(2026, 6, 15) });
    const m = crearServicioNominasMantenimiento({ repo, ahora: () => new Date(2026, 6, 15) });

    const abierta = await nominas.abrirOCrear({ tipo: "ADMINISTRATIVA", periodo: "2026-06", codigo_empleado: 7 }, ctx);
    const p = await nominas.completarPaso(abierta.id_nomina, 1, ctx);

    await assert.rejects(() => m.cerrarPeriodo({ periodo: "2026-06" }, ctx), e => e.status === 409 && e.extra.requiereConfirmacion === true);
    await m.cerrarPeriodo({ periodo: "2026-06", forzar: true, motivo: "Cierre contable" }, ctx);
    await assert.rejects(() => m.cerrarPeriodo({ periodo: "2026-06", forzar: true }, ctx), /ya está cerrado/);

    await assert.rejects(() => nominas.aprobar(abierta.id_nomina, p.version, ctx), /cerrado/);
    await assert.rejects(() => nominas.abrirOCrear({ tipo: "TECNICO_SOCIO", periodo: "2026-06" }, ctx), /cerrado/);
    // otros períodos no se afectan
    await nominas.abrirOCrear({ tipo: "TECNICO_SOCIO", periodo: "2026-07" }, ctx);

    await assert.rejects(() => m.reabrirPeriodo({ periodo: "2026-06", motivo: "" }, ctx), /motivo/);
    await m.reabrirPeriodo({ periodo: "2026-06", motivo: "Se olvidó una nómina" }, ctx);
    const ok = await nominas.aprobar(abierta.id_nomina, p.version, ctx);
    assert.equal(ok.estado, "APROBADA");
    assert.deepEqual(repo._bitacora.filter(b => b.tipo === "PERIODO").map(b => b.accion), ["REABRIR", "CERRAR"]);
});

test("períodos: 18 meses con conteos y estado", async () => {
    const repo = repoConMantenimiento();
    const m = crearServicioNominasMantenimiento({ repo, ahora: () => new Date(2026, 5, 30) });
    const lista = await m.periodos();
    assert.equal(lista.length, 18);
    assert.equal(lista[0].periodo, "2026-06");
    assert.equal(lista[0].aprobadas, 5);
    assert.equal(lista[0].enPreparacion, 2);
    assert.equal(lista[17].periodo, "2025-01");
});

/* ---------- regla: no se procesan meses que todavía no llegan ---------- */
function servicioConReloj(fecha) {
    const repo = repoConMantenimiento();
    return crearServicioNominas({ repo, almacen: {}, ahora: () => fecha });
}

test("no se puede crear una nómina de un mes futuro, pero sí del actual y de meses anteriores", async () => {
    const nominas = servicioConReloj(new Date(2026, 9, 16));   // 16/10/2026
    await assert.rejects(() => nominas.abrirOCrear({ tipo: "ADMINISTRATIVA", periodo: "2026-12", codigo_empleado: 7 }, ctx), e => e.status === 409 && /todavía no ha llegado/.test(e.message) && e.extra.periodoMaximo === "2026-10");
    await assert.rejects(() => nominas.abrirOCrear({ tipo: "ADMINISTRATIVA", periodo: "2026-11", codigo_empleado: 7 }, ctx), /todavía no ha llegado/);
    await assert.rejects(() => nominas.abrirOCrear({ tipo: "ADMINISTRATIVA", periodo: "2027-01", codigo_empleado: 7 }, ctx), /todavía no ha llegado/);
    assert.ok((await nominas.abrirOCrear({ tipo: "ADMINISTRATIVA", periodo: "2026-10", codigo_empleado: 7 }, ctx)).id_nomina);
    assert.ok((await nominas.abrirOCrear({ tipo: "ADMINISTRATIVA", periodo: "2026-09", codigo_empleado: 7 }, ctx)).id_nomina);
});

test("una nómina de un mes futuro que ya existía no se puede editar ni aprobar, pero sí descartar", async () => {
    const repo = repoConMantenimiento();
    let reloj = new Date(2026, 11, 15);                          // diciembre: todavía se permite
    const nominas = crearServicioNominas({ repo, almacen: {}, ahora: () => reloj });
    const futura = await nominas.abrirOCrear({ tipo: "ADMINISTRATIVA", periodo: "2026-12", codigo_empleado: 7 }, ctx);
    reloj = new Date(2026, 9, 16);                               // "volvemos" a octubre
    const v = await nominas.vista(futura.id_nomina);
    assert.equal(v.periodoFuturo, true);
    await assert.rejects(() => nominas.editarValor(futura.id_nomina, "planilla.salario_base", "1000", ctx), /todavía no ha llegado/);
    await assert.rejects(() => nominas.aprobar(futura.id_nomina, v.version, ctx), /todavía no ha llegado/);
    await nominas.descartar(futura.id_nomina, ctx);               // el borrador erróneo sí se puede quitar
    await assert.rejects(() => nominas.vista(futura.id_nomina), e => e.status === 404);
});

test("las reglas publicas le dicen a la pantalla cuál es el último período disponible", async () => {
    const nominas = servicioConReloj(new Date(2026, 9, 16));
    assert.equal(nominas.reglasPublicas().periodoMaximo, "2026-10");
});