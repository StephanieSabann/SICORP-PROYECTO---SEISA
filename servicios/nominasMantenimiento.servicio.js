const { TIPOS } = require("../configuracion/nominas.config");
const { catalogoParametros, convertirValor } = require("./nominasParametros");
const U = require("./reportes/util");

/* ============================================================
   Servicio de MANTENIMIENTO DE NÓMINA
   ------------------------------------------------------------
   Lo que usa "Soporte y Mantenimiento → Nómina":
     · tasas, montos y precios con vigencia (ver nominasParametros.js)
     · cierre y reapertura de períodos
     · auditoría de cambios
   No calcula nóminas; solo administra las reglas que ellas usan.
   ============================================================ */

class ErrorMantenimiento extends Error {
    constructor(mensaje, status = 400, extra = {}) { super(mensaje); this.status = status; this.extra = extra; }
}

const aPantalla = (unidad, interno) => interno === null || interno === undefined ? null : unidad === "pct" ? interno / 100 : interno / 100;

function crearServicioNominasMantenimiento({ repo, ahora = () => new Date() }) {

    const tipoValido = tipo => {
        if (!TIPOS[tipo]) throw new ErrorMantenimiento("Tipo de nómina no válido.");
        return tipo;
    };

    async function extras(tipo) {
        const lista = await repo.preciosActividades(tipo);
        return lista;
    }

    async function catalogoDe(tipo) {
        const filasExtra = await extras(tipo);
        const catalogo = catalogoParametros(tipo, filasExtra.map(f => f.actividad));
        // precios de actividades nuevas: la base es lo que ya se capturó en el flujo de nómina
        catalogo.forEach(c => {
            if (c.nueva) {
                const f = filasExtra.find(x => x.actividad === c.actividad);
                c.base = f ? (c.campo === "produccion" ? f.precio_produccion : f.precio_bono) : null;
            }
        });
        return catalogo;
    }

    function tipos() {
        return Object.values(TIPOS).map(t => ({ clave: t.clave, nombre: t.nombre }));
    }

    /* Catálogo con el valor que rige en "periodo" y los cambios ya programados. */
    async function parametros(tipo, periodo) {
        tipoValido(tipo);
        if (!U.periodoValido(periodo)) throw new ErrorMantenimiento("El período debe tener el formato AAAA-MM.");
        const [catalogo, filas] = await Promise.all([catalogoDe(tipo), repo.listarParametros(tipo)]);
        return catalogo.map(c => {
            const propias = filas.filter(f => f.clave === c.clave).sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde));
            const rige = [...propias].reverse().find(f => f.vigente_desde <= periodo) || null;
            return {
                clave: c.clave, grupo: c.grupo, nombre: c.nombre, subnombre: c.subnombre || null, unidad: c.unidad, nueva: !!c.nueva,
                base: aPantalla(c.unidad, c.base),
                vigente: aPantalla(c.unidad, rige ? rige.valor : c.base),
                vigenteDesde: rige ? rige.vigente_desde : null,
                personalizado: !!rige,
                cambios: propias.map(f => ({ vigente_desde: f.vigente_desde, valor: aPantalla(c.unidad, f.valor), motivo: f.motivo, futuro: f.vigente_desde > periodo }))
            };
        });
    }

    async function guardarParametro({ tipo, clave, valor, vigente_desde, motivo }, ctx) {
        tipoValido(tipo);
        if (!U.periodoValido(vigente_desde)) throw new ErrorMantenimiento("Elige el período desde el cual rige el cambio (AAAA-MM).");
        if (vigente_desde < "2020-01") throw new ErrorMantenimiento("La vigencia no puede ser anterior a 2020.");
        const def = (await catalogoDe(tipo)).find(c => c.clave === clave);
        if (!def) throw new ErrorMantenimiento("Ese parámetro no se puede modificar.");
        const conv = convertirValor(def.unidad, valor);
        if (conv.error) throw new ErrorMantenimiento(`${def.nombre}: ${conv.error}`);
        const texto = String(motivo || "").trim().slice(0, 200);
        if (!texto) throw new ErrorMantenimiento("Escribe el motivo del cambio (ej. \"Reforma de ley\", \"Nuevo contrato EEGSA\"). Queda en la auditoría.");
        const anterior = await repo.guardarParametro({ tipo, clave, valor: conv.valor, vigente_desde, motivo: texto, id_credencial: ctx.usuario.id_credencial });
        await repo.registrarBitacoraParametro({ tipo, clave, accion: anterior === null ? "CREAR" : "MODIFICAR", valor_anterior: anterior, valor_nuevo: conv.valor, vigente_desde, motivo: texto, id_credencial: ctx.usuario.id_credencial, usuario: ctx.usuario.nombre });
        return { guardado: true, valorInterno: conv.valor };
    }

    async function restablecer({ tipo, clave, vigente_desde }, ctx) {
        tipoValido(tipo);
        if (!U.periodoValido(vigente_desde)) throw new ErrorMantenimiento("Período no válido.");
        const anterior = await repo.eliminarParametro({ tipo, clave, vigente_desde });
        if (anterior === null) throw new ErrorMantenimiento("Ese cambio ya no existe.", 404);
        await repo.registrarBitacoraParametro({ tipo, clave, accion: "ELIMINAR", valor_anterior: anterior, valor_nuevo: null, vigente_desde, motivo: "Se quitó el cambio", id_credencial: ctx.usuario.id_credencial, usuario: ctx.usuario.nombre });
        return { eliminado: true };
    }

    async function bitacora(f = {}) {
        const pagina = Math.max(1, Number(f.pagina) || 1), porPagina = 15;
        const r = await repo.bitacoraParametros({ pagina, porPagina });
        const nombresTipo = Object.fromEntries(Object.values(TIPOS).map(t => [t.clave, t.nombre]));
        return {
            filas: r.filas.map(x => ({ ...x, tipoNombre: nombresTipo[x.tipo] || x.tipo, fecha: U.aISOHora(x.fecha) })),
            total: r.total, pagina, paginas: Math.max(1, Math.ceil(r.total / porPagina)), porPagina
        };
    }

    /* ---------- cierre de períodos ---------- */
    async function periodos() {
        const actual = U.periodoActual(ahora());
        const desde = U.sumarMeses(actual, -17);
        const { conteos, cierres } = await repo.estadoPeriodos(desde, actual);
        return U.ultimosPeriodos(actual, 18).reverse().map(p => {
            const cuenta = estado => conteos.filter(c => c.periodo === p && c.estado === estado).reduce((s, c) => s + Number(c.total), 0);
            const cierre = cierres.find(c => c.periodo === p);
            return {
                periodo: p, nombre: U.nombrePeriodo(p), cerrado: !!cierre && cierre.estado === "CERRADO",
                aprobadas: cuenta("APROBADA"), enRevision: cuenta("PENDIENTE_APROBACION"), enPreparacion: cuenta("EN_PREPARACION"),
                cerradoPor: cierre ? cierre.usuario : null, fecha: cierre ? U.aISOHora(cierre.fecha) : null, motivo: cierre ? cierre.motivo : null
            };
        });
    }

    async function cerrarPeriodo({ periodo, motivo, forzar }, ctx) {
        if (!U.periodoValido(periodo)) throw new ErrorMantenimiento("Período no válido.");
        const info = (await periodos()).find(p => p.periodo === periodo);
        if (info && info.cerrado) throw new ErrorMantenimiento("Ese período ya está cerrado.", 409);
        const sinAprobar = info ? info.enRevision + info.enPreparacion : 0;
        if (sinAprobar > 0 && !forzar) {
            throw new ErrorMantenimiento(`Hay ${sinAprobar} nómina${sinAprobar === 1 ? "" : "s"} sin aprobar en ${U.nombrePeriodo(periodo)}. Si cierras el período no se podrán aprobar hasta que lo reabras.`, 409, { sinAprobar, requiereConfirmacion: true });
        }
        await repo.marcarPeriodo({ periodo, estado: "CERRADO", motivo: String(motivo || "").trim().slice(0, 200) || null, id_credencial: ctx.usuario.id_credencial, usuario: ctx.usuario.nombre });
        await repo.registrarBitacoraParametro({ tipo: "PERIODO", clave: periodo, accion: "CERRAR", vigente_desde: periodo, motivo: String(motivo || "").trim().slice(0, 200) || null, id_credencial: ctx.usuario.id_credencial, usuario: ctx.usuario.nombre });
        return periodos();
    }

    async function reabrirPeriodo({ periodo, motivo }, ctx) {
        if (!U.periodoValido(periodo)) throw new ErrorMantenimiento("Período no válido.");
        const texto = String(motivo || "").trim().slice(0, 200);
        if (!texto) throw new ErrorMantenimiento("Escribe el motivo para reabrir el período. Queda en la auditoría.");
        await repo.marcarPeriodo({ periodo, estado: "ABIERTO", motivo: texto, id_credencial: ctx.usuario.id_credencial, usuario: ctx.usuario.nombre });
        await repo.registrarBitacoraParametro({ tipo: "PERIODO", clave: periodo, accion: "REABRIR", vigente_desde: periodo, motivo: texto, id_credencial: ctx.usuario.id_credencial, usuario: ctx.usuario.nombre });
        return periodos();
    }

    /* ---------- auditoría general de nóminas ---------- */
    async function auditoria(f = {}) {
        const pagina = Math.max(1, Number(f.pagina) || 1), porPagina = 20;
        const r = await repo.historialGeneral({ texto: (f.texto || "").trim() || undefined, usuario: (f.usuario || "").trim() || undefined, pagina, porPagina });
        return {
            filas: r.filas.map(x => ({ ...x, periodoNombre: U.nombrePeriodo(x.periodo), fecha: U.aISOHora(x.fecha) })),
            total: r.total, pagina, paginas: Math.max(1, Math.ceil(r.total / porPagina)), porPagina
        };
    }

    return { ErrorMantenimiento, tipos, parametros, guardarParametro, restablecer, bitacora, periodos, cerrarPeriodo, reabrirPeriodo, auditoria };
}

module.exports = { crearServicioNominasMantenimiento, ErrorMantenimiento };
