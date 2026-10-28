/* ============================================================
   Repositorio de REPORTES EN MEMORIA
   ------------------------------------------------------------
   Misma interfaz que modelos/reportes.model.js (SQL Server), con
   datos de ejemplo. Se usa en las pruebas automáticas
   (pruebas/reportes.test.js) y en el servidor de demostración
   (pruebas/servidorDemo.js) — NUNCA en el sistema real.
   ============================================================ */

const U = require("./reportes/util");

/* Generador pseudoaleatorio determinista (siempre los mismos datos de ejemplo). */
function aleatorio(semilla) {
    let s = semilla >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const NOMBRES = ["Carlos", "Luis", "José", "Marvin", "Edwin", "Oscar", "Byron", "Kevin", "Hugo", "Elmer", "Wilson", "Jorge", "Mario", "Pedro", "Cristian", "Rolando", "Erick", "Selvin", "Allan", "Josué"];
const NOMBRES_F = ["Ana", "María", "Lucía", "Karla", "Sandra", "Rosa", "Julia", "Andrea"];
const APELLIDOS = ["López", "Pérez", "García", "Morales", "Hernández", "Ramírez", "Cifuentes", "Castillo", "Méndez", "Orozco", "Barrios", "Juárez", "Ixcoy", "Tzoc", "Aguilar", "Ajú", "Cux", "Chávez"];

function crearDatosDemo(hoyISO = "2026-06-30") {
    const al = aleatorio(20260630);
    const elige = lista => lista[Math.floor(al() * lista.length)];
    const [anio, mes] = hoyISO.split("-").map(Number);

    const empleados = [];
    const plan = [["Técnico", 24, "TECNICO_SOCIO"], ["Auxiliar", 12, "AUXILIAR"], ["Administrativo", 6, "ADMINISTRATIVO"]];
    let codigo = 100;
    plan.forEach(([puesto, cuantos, tipo]) => {
        for (let i = 0; i < cuantos; i++) {
            const antiguedadMeses = Math.floor(al() * 100) + (i % 5 === 0 ? 1 : 0);
            const f = new Date(Date.UTC(anio, mes - 1 - antiguedadMeses, 1 + Math.floor(al() * 27)));
            const mujer = puesto === "Administrativo" && i % 2 === 0;
            empleados.push({
                codigo_empleado: codigo++, id_puesto: puesto === "Técnico" ? 2 : puesto === "Auxiliar" ? 3 : 1, puesto,
                nombre: elige(mujer ? NOMBRES_F : NOMBRES), apellido: `${elige(APELLIDOS)} ${elige(APELLIDOS)}`,
                dpi: i % 9 === 8 ? "" : String(2000000000000 + Math.floor(al() * 9e11)), nit: i % 11 === 10 ? null : 1000000 + Math.floor(al() * 8999999),
                direccion: "Zona " + (1 + Math.floor(al() * 18)) + ", Guatemala", telefono: i % 7 === 6 ? "" : "5" + String(1000000 + Math.floor(al() * 8999999)),
                email: i % 6 === 5 ? "" : `empleado${codigo}@seisa.com.gt`,
                fecha_contratacion: f, fecha_nacimiento: new Date(Date.UTC(1975 + Math.floor(al() * 28), Math.floor(al() * 12), 1 + Math.floor(al() * 27))),
                activo: true, tipo_empleado: puesto === "Técnico" ? (i < 21 ? (i % 3 === 0 ? "TECNICO_NO_SOCIO" : "TECNICO_SOCIO") : null) : tipo,
                salario_base: puesto === "Técnico" ? null : (puesto === "Auxiliar" ? 3200 + (i % 3) * 150 : 5800 + i * 200)
            });
        }
    });
    // Altas recientes con un patrón fijo (Ene 2, Feb 1, Mar 3, Abr 2, May 4, Jun 1) para que la gráfica de ingresos tenga forma.
    [5, 5, 4, 3, 3, 3, 2, 2, 1, 1, 1, 1, 0].forEach((atras, i) => {
        const e = empleados[2 + i * 3];
        e.fecha_contratacion = new Date(Date.UTC(anio, mes - 1 - atras, 3 + i));
    });
    [["Técnico", "TECNICO_SOCIO"], ["Auxiliar", "AUXILIAR"]].forEach(([puesto, tipo], i) => {
        empleados.push({
            codigo_empleado: codigo++, id_puesto: i ? 3 : 2, puesto, nombre: elige(NOMBRES), apellido: `${elige(APELLIDOS)} ${elige(APELLIDOS)}`, dpi: "2456789012345", nit: 4455667,
            direccion: "Zona 7", telefono: "55001122", email: "baja@seisa.com.gt", fecha_contratacion: new Date(Date.UTC(2021, 2, 10)),
            fecha_nacimiento: new Date(Date.UTC(1990, 4, 3)), activo: false, tipo_empleado: tipo, salario_base: null
        });
    });

    const categorias = [
        { id_categoria: 1, nombre: "Herramientas", color: "#4F7DF3" }, { id_categoria: 2, nombre: "EPP", color: "#22C2B5" },
        { id_categoria: 3, nombre: "Equipos", color: "#E3453F" }, { id_categoria: 4, nombre: "Uniformes", color: "#A855F7" }
    ];
    const r = (id, codigo, nombre, cat, total, disp, min, costo) => ({
        id_recurso: id, codigo, nombre, id_categoria: cat, categoria: categorias[cat - 1].nombre, categoria_color: categorias[cat - 1].color,
        cantidad_total: total, cantidad_disponible: disp, cantidad_minima: min, estado_fisico: "Nuevo", activo: true,
        fecha_creacion: new Date(Date.UTC(2026, 1, 4)), costo_unitario: costo
    });
    const recursos = [
        r(1, "REC-001", "Caimán", 1, 8, 5, 2, 85), r(2, "REC-002", "Caimanete", 1, 6, 6, 2, 120), r(3, "REC-003", "Alicate", 1, 5, 4, 2, 65.5), r(4, "REC-004", "Herramienta manual", 1, 4, 1, 2, 210),
        r(5, "REC-005", "Cascos", 2, 12, 9, 4, 95), r(6, "REC-006", "Guantes", 2, 14, 10, 6, 35), r(7, "REC-007", "Arnés", 2, 8, 0, 2, 480), r(8, "REC-008", "Chaleco reflectivo", 2, 6, 6, 3, 55),
        r(9, "REC-009", "Conos", 3, 15, 15, 5, 70), r(10, "REC-010", "Candados", 3, 14, 11, 4, 40), r(11, "REC-011", "Escalera tijera", 3, 5, 3, 2, 950), r(12, "REC-012", "Portapapeles", 3, 3, 3, 0, 25), r(13, "REC-013", "Capas impermeables", 3, 9, 9, 3, 110),
        r(14, "REC-014", "Camisola SEISA", 4, 0, 0, 0, null)
    ];

    const mov = (id, tipo, rec, cant, fecha, extra = {}) => ({
        id_movimiento: id, tipo, cantidad: cant, fecha: new Date(fecha + "T00:00:00Z"), origen: null, condicion: null, observacion: "",
        fecha_devolucion_prevista: null, id_empleado: null, id_recurso: rec, recurso_codigo: recursos[rec - 1].codigo, recurso_nombre: recursos[rec - 1].nombre,
        categoria: recursos[rec - 1].categoria, empleado_nombre: null, empleado_apellido: null, responsable_nombre: "Jonathan", responsable_apellido: "Administrador", ...extra
    });
    const e1 = empleados[0], e2 = empleados[3], e3 = empleados[8];
    const ex = e => ({ id_empleado: e.codigo_empleado, empleado_nombre: e.nombre, empleado_apellido: e.apellido });
    const movimientos = [
        mov(1, "Entrada", 1, 8, "2026-02-04", { origen: "SEISA" }), mov(2, "Entrada", 5, 12, "2026-02-04", { origen: "SEISA" }),
        mov(3, "Entrada", 9, 15, "2026-05-12", { origen: "EEGSA" }), mov(4, "Entrada", 6, 6, "2026-06-03", { origen: "EEGSA" }), mov(5, "Entrada", 10, 4, "2026-06-18", { origen: "SEISA" }),
        mov(6, "Entrega", 1, 3, "2026-06-05", { ...ex(e1), fecha_devolucion_prevista: new Date("2026-06-20T00:00:00Z") }),
        mov(7, "Entrega", 7, 4, "2026-05-22", { ...ex(e2), fecha_devolucion_prevista: new Date("2026-06-10T00:00:00Z") }),
        mov(8, "Entrega", 5, 3, "2026-06-09", { ...ex(e3) }), mov(9, "Entrega", 4, 3, "2026-05-15", { ...ex(e1) }),
        mov(10, "Devolución", 5, 2, "2026-06-24", { ...ex(e3), condicion: "Buen estado", id_movimiento_relacionado: 8 }),
        mov(11, "Devolución", 6, 2, "2026-06-25", { ...ex(e2), condicion: "Dañado" }), mov(12, "Devolución", 3, 1, "2026-06-26", { ...ex(e1), condicion: "Perdido" }),
        mov(13, "Entrega", 2, 2, "2026-05-08", { ...ex(e2) }), mov(14, "Devolución", 2, 2, "2026-05-30", { ...ex(e2), condicion: "Buen estado" }),
        mov(15, "Ajuste", 11, 1, "2026-06-28", { observacion: "Ajuste por conteo físico CNT-001." })
    ];
    const entregasPendientes = [
        { id_movimiento: 6, cantidad: 3, fecha_entrega: new Date("2026-06-05T00:00:00Z"), fecha_devolucion_prevista: new Date("2026-06-20T00:00:00Z"), id_empleado: e1.codigo_empleado, recurso_codigo: "REC-001", recurso_nombre: "Caimán", empleado_nombre: e1.nombre, empleado_apellido: e1.apellido },
        { id_movimiento: 7, cantidad: 4, fecha_entrega: new Date("2026-05-22T00:00:00Z"), fecha_devolucion_prevista: new Date("2026-06-10T00:00:00Z"), id_empleado: e2.codigo_empleado, recurso_codigo: "REC-007", recurso_nombre: "Arnés", empleado_nombre: e2.nombre, empleado_apellido: e2.apellido },
        { id_movimiento: 9, cantidad: 3, fecha_entrega: new Date("2026-05-15T00:00:00Z"), fecha_devolucion_prevista: null, id_empleado: e1.codigo_empleado, recurso_codigo: "REC-004", recurso_nombre: "Herramienta manual", empleado_nombre: e1.nombre, empleado_apellido: e1.apellido }
    ];

    /* Nóminas: 6 meses para el personal activo; el último mes queda incompleto a propósito. */
    const nominas = [];
    let idN = 1, recibo = 1000;
    const activos = empleados.filter(e => e.activo);
    const periodos = U.ultimosPeriodos(`${anio}-${String(mes).padStart(2, "0")}`, 6);
    periodos.forEach((p, pi) => {
        const ultimo = pi === periodos.length - 1;
        activos.forEach((e, ei) => {
            if (pi < 3 && ei % 7 === 6) return; // en meses viejos había menos personal
            const tecnico = e.puesto === "Técnico";
            const fecha = new Date(Date.UTC(+p.slice(0, 4), +p.slice(5) - 1, 28, 15, 30));
            let estado = "APROBADA";
            if (ultimo) estado = ei % 11 === 5 ? "PENDIENTE_APROBACION" : ei % 17 === 3 ? "EN_PREPARACION" : ei % 9 === 8 ? null : "APROBADA";
            if (!estado) return;
            let calculo = null;
            if (estado === "APROBADA") {
                if (tecnico) {
                    const salario = 3800 + Math.floor(al() * 1500), bono = 700 + Math.floor(al() * 600), desc = Math.floor(al() * 300);
                    calculo = { salario: salario * 100, bono: bono * 100, totalSinDescuentos: (salario + bono) * 100, totalDescuentos: desc * 100, total: (salario + bono - desc) * 100 };
                } else {
                    const base = (e.salario_base || 3500) * 100, bonif = 25000, igss = Math.round(base * 0.0483);
                    calculo = { ingresos: [{ clave: "salario_base", monto: base }, { clave: "bonificacion", monto: bonif }], totalIngresos: base + bonif, totalDescuentos: igss, total: base + bonif - igss };
                }
            }
            nominas.push({
                id_nomina: idN++, tipo: tecnico ? (e.tipo_empleado === "TECNICO_NO_SOCIO" ? "TECNICO_NO_SOCIO" : "TECNICO_SOCIO") : "ADMINISTRATIVA", periodo: p, codigo_empleado: e.codigo_empleado,
                empleado_nombre: `${e.nombre} ${e.apellido}`, estado, numero_recibo: calculo ? recibo++ : null, total_centavos: calculo ? calculo.total : null,
                fecha_aprobacion: calculo ? fecha : null, fecha_actualizacion: fecha, fecha_creacion: fecha,
                snapshot: calculo ? { calculo, aprobadoPor: "Jonathan Administrador", pago: { forma_pago: ei % 2 ? "Transferencia" : "Pago en línea" }, empleado: { nombre: `${e.nombre} ${e.apellido}` } } : null
            });
        });
    });

    const permisos = [
        { id_permiso: 1, id_empleado: e1.codigo_empleado, desde: new Date("2026-06-10T00:00:00Z"), hasta: new Date("2026-06-12T00:00:00Z"), motivo: "Cita médica", estado: true, tipo_nombre: "Salud" },
        { id_permiso: 2, id_empleado: e2.codigo_empleado, desde: new Date("2026-07-01T00:00:00Z"), hasta: new Date("2026-07-05T00:00:00Z"), motivo: "Vacaciones", estado: null, tipo_nombre: "Vacaciones" },
        { id_permiso: 3, id_empleado: e3.codigo_empleado, desde: new Date("2026-06-20T00:00:00Z"), hasta: new Date("2026-06-20T00:00:00Z"), motivo: "Trámite personal", estado: false, tipo_nombre: "Personal" }
    ];

    return { empleados, categorias, recursos, movimientos, entregasPendientes, nominas, permisos, hoyISO };
}

function crearRepositorioReportesMemoria(datos = crearDatosDemo(), { ahora = () => new Date() } = {}) {
    const parametros = {};
    const visibilidad = {};
    const bitacora = [];
    const programados = [];
    let sigBit = 1, sigProg = 1;
    const cerrados = [];
    const copia = o => JSON.parse(JSON.stringify(o), (k, v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ? new Date(v) : v));

    return {
        async empleados() { return copia(datos.empleados); },
        async permisos() { return copia(datos.permisos); },
        async recursos() { return copia(datos.recursos); },
        async categorias() { return copia(datos.categorias); },
        async catalogos() {
            const unicos = l => [...new Set(l.filter(Boolean))].sort();
            return {
                puestos: unicos(datos.empleados.map(e => e.puesto)),
                tiposNomina: unicos(datos.nominas.map(n => n.tipo)),
                origenes: unicos(datos.movimientos.map(m => m.origen)),
                tiposPermiso: unicos(datos.permisos.map(p => p.tipo_nombre))
            };
        },
        async movimientos({ desde, hasta }) { return copia(datos.movimientos.filter(m => U.aISO(m.fecha) >= desde && U.aISO(m.fecha) <= hasta)); },
        async ultimaEntrada() {
            const e = datos.movimientos.filter(m => m.tipo === "Entrada").sort((a, b) => b.fecha - a.fecha)[0];
            return e ? copia({ fecha: e.fecha, origen: e.origen, responsable_nombre: e.responsable_nombre, responsable_apellido: e.responsable_apellido }) : null;
        },
        async entregasPendientes() { return copia(datos.entregasPendientes); },
        async ultimoConteo() { return datos.ultimoConteo === undefined ? { codigo: "CNT-001", fecha: new Date("2026-05-30T00:00:00Z"), estado: "Completado" } : datos.ultimoConteo; },
        async nominas({ desdePeriodo, hastaPeriodo }) { return copia(datos.nominas.filter(n => n.estado !== "CANCELADA" && n.periodo >= desdePeriodo && n.periodo <= hastaPeriodo)); },
        async periodosNominaCerrados() { return [...cerrados]; },

        async parametros() { return { ...parametros }; },
        async guardarParametro({ clave, valor }) { parametros[clave] = valor; },
        async visibilidad() { return { ...visibilidad }; },
        async guardarVisibilidad({ clave, activo }) { visibilidad[clave] = !!activo; },
        async registrarBitacora(b) { bitacora.unshift({ ...b, id_bitacora: sigBit++, fecha: ahora() }); },
        async listarBitacora({ reporte, usuario, pagina = 1, porPagina = 15 }) {
            let f = bitacora.filter(b => (!reporte || b.reporte === reporte) && (!usuario || String(b.usuario || "").toLowerCase().includes(usuario.toLowerCase())));
            return { filas: f.slice((pagina - 1) * porPagina, pagina * porPagina), total: f.length };
        },
        async depurarBitacora(dias) {
            const limite = Date.now() - dias * 86400000;
            const antes = bitacora.length;
            for (let i = bitacora.length - 1; i >= 0; i--) if (bitacora[i].fecha.getTime() < limite) bitacora.splice(i, 1);
            return antes - bitacora.length;
        },
        async listarProgramados() { return programados.map(p => ({ ...p })); },
        async obtenerProgramado(id) { const p = programados.find(x => x.id_programado === id); return p ? { ...p } : null; },
        async crearProgramado(p) {
            const nuevo = { id_programado: sigProg++, activo: true, ultima_ejecucion: null, ultimo_estado: null, fecha_creacion: ahora(), ...p };
            programados.push(nuevo);
            return { ...nuevo };
        },
        async actualizarProgramado(id, p) { const x = programados.find(y => y.id_programado === id); Object.assign(x, p); return { ...x }; },
        async eliminarProgramado(id) { const i = programados.findIndex(x => x.id_programado === id); if (i >= 0) programados.splice(i, 1); },
        async marcarEjecucion(id, { fecha, estado }) { const x = programados.find(y => y.id_programado === id); x.ultima_ejecucion = fecha; x.ultimo_estado = estado; },
        async guardarCostoRecurso({ id_recurso, costo_unitario }) {
            const r = datos.recursos.find(x => x.id_recurso === id_recurso);
            if (!r) return false;
            r.costo_unitario = costo_unitario;
            return true;
        },
        _datos: datos, _bitacora: bitacora, _cerrados: cerrados
    };
}

module.exports = { crearRepositorioReportesMemoria, crearDatosDemo };
