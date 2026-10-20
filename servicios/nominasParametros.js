const { TIPOS, ACTIVIDADES_OFICIALES } = require("../configuracion/nominas.config");

/* ============================================================
   Parámetros de nómina con VIGENCIA
   ------------------------------------------------------------
   Los valores de configuracion/nominas.config.js son los de
   fábrica. Desde "Soporte y Mantenimiento → Nómina" se pueden
   cambiar tasas, montos fijos y precios SIN tocar código: cada
   cambio se guarda con el período desde el cual rige (AAAA-MM).

   Reglas de oro:
     - Un cambio vigente desde 2026-07 NO altera junio ni meses
       anteriores.
     - Las nóminas ya aprobadas nunca cambian (guardan su propia
       fotografía).
     - Sin cambios guardados, el cálculo es idéntico al de siempre.

   Claves de parámetro (por tipo de nómina):
     tasas.<nombre>                  puntos básicos  (12 % = 1200)
     mantenimiento_vehiculos         centavos
     bonificacion_ley                centavos        (planilla administrativa)
     cargo.<clave>                   centavos        (cargos SEISA fijos)
     precio.<ACTIVIDAD>.produccion   centavos
     precio.<ACTIVIDAD>.bono         centavos
   ============================================================ */

const ETIQUETAS_TASAS = {
    iva_bp: "IVA incluido en la producción",
    retencion_isr_bp: "Retención de ISR sobre la producción sin IVA",
    aporte_seisa_bp: "Aporte para el funcionamiento de SEISA",
    flotilla_bp: "Aporte para renovación de flotilla",
    igss_laboral_bp: "Cuota laboral IGSS (sobre el salario base)"
};

const esTecnico = tipo => tipo === "TECNICO_SOCIO" || tipo === "TECNICO_NO_SOCIO";
const copia = o => JSON.parse(JSON.stringify(o));

/* Lista todo lo que se puede editar de un tipo de nómina. */
function catalogoParametros(tipo, actividadesExtra = []) {
    const reglas = TIPOS[tipo];
    if (!reglas) return [];
    const lista = [];
    Object.keys(reglas.tasas || {}).forEach(k => lista.push({
        clave: `tasas.${k}`, grupo: "Tasas y porcentajes", nombre: ETIQUETAS_TASAS[k] || k, unidad: "pct", base: reglas.tasas[k]
    }));
    if (reglas.bonificacion_ley !== undefined) {
        lista.push({ clave: "bonificacion_ley", grupo: "Montos fijos", nombre: "Bonificación incentivo de ley (Decreto 78-89)", unidad: "quetzales", base: reglas.bonificacion_ley });
    }
    if (esTecnico(tipo)) {
        lista.push({ clave: "mantenimiento_vehiculos", grupo: "Montos fijos", nombre: "Mantenimiento de vehículos (monto fijo)", unidad: "quetzales", base: reglas.mantenimiento_vehiculos || 0 });
        (reglas.cargosSeisa || []).filter(c => !c.origen).forEach(c => lista.push({
            clave: `cargo.${c.clave}`, grupo: "Cargos SEISA", nombre: c.nombre, unidad: "quetzales", base: c.monto || 0
        }));
        const actividades = [...ACTIVIDADES_OFICIALES, ...actividadesExtra.filter(a => !ACTIVIDADES_OFICIALES.includes(a))];
        actividades.forEach(a => {
            const p = (reglas.precios || {})[a] || {};
            lista.push({ clave: `precio.${a}.produccion`, grupo: "Precios por actividad", nombre: a, subnombre: "Producción SEISA (por orden)", unidad: "quetzales", base: p.produccion ?? null, actividad: a, campo: "produccion", nueva: !ACTIVIDADES_OFICIALES.includes(a) });
            lista.push({ clave: `precio.${a}.bono`, grupo: "Precios por actividad", nombre: a, subnombre: "Bono del técnico (por orden)", unidad: "quetzales", base: p.bono ?? null, actividad: a, campo: "bono", nueva: !ACTIVIDADES_OFICIALES.includes(a) });
        });
    }
    return lista;
}

/* Convierte lo que escribe la persona (12.5 → 12.5 %, 250 → Q 250.00) a la unidad interna. */
function convertirValor(unidad, bruto) {
    const limpio = String(bruto ?? "").replace(/[Qq%\s,]/g, "");
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(limpio)) return { error: unidad === "pct" ? "Escribe un porcentaje válido (ej. 12 o 4.83)." : "Escribe un monto válido (ej. 250.00)." };
    const n = Number(limpio);
    if (unidad === "pct") {
        if (n > 100) return { error: "El porcentaje no puede ser mayor que 100." };
        return { valor: Math.round(n * 100) };
    }
    if (n > 1000000) return { error: "El monto no puede ser mayor que Q 1,000,000.00." };
    return { valor: Math.round(n * 100) };
}

/* Aplica a una copia de las reglas de fábrica los cambios vigentes a "periodo".
   filas: [{ clave, valor, vigente_desde }]  (de cualquier fecha; se elige la más reciente <= periodo) */
function aplicarParametros(reglasBase, filas, periodo) {
    const reglas = copia(reglasBase);
    const vigentes = new Map();
    (filas || []).forEach(f => {
        if (f.vigente_desde > periodo) return;
        const previo = vigentes.get(f.clave);
        if (!previo || f.vigente_desde > previo.vigente_desde) vigentes.set(f.clave, f);
    });
    vigentes.forEach((f, clave) => {
        const valor = Number(f.valor);
        if (clave.startsWith("tasas.")) {
            reglas.tasas = reglas.tasas || {};
            reglas.tasas[clave.slice(6)] = valor;
        } else if (clave === "mantenimiento_vehiculos") {
            reglas.mantenimiento_vehiculos = valor;
        } else if (clave === "bonificacion_ley") {
            reglas.bonificacion_ley = valor;
        } else if (clave.startsWith("cargo.")) {
            const cargo = (reglas.cargosSeisa || []).find(c => c.clave === clave.slice(6) && !c.origen);
            if (cargo) cargo.monto = valor;
        } else if (clave.startsWith("precio.")) {
            const resto = clave.slice(7);
            const punto = resto.lastIndexOf(".");
            const actividad = resto.slice(0, punto), campo = resto.slice(punto + 1);
            if (actividad && ["produccion", "bono"].includes(campo)) {
                reglas.precios = reglas.precios || {};
                reglas.precios[actividad] = { produccion: null, bono: null, ...(reglas.precios[actividad] || {}), [campo]: valor };
            }
        }
    });
    return reglas;
}

module.exports = { catalogoParametros, convertirValor, aplicarParametros, ETIQUETAS_TASAS };
