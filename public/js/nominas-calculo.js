/* ============================================================
   SICORP — SEISA · Cálculo de NÓMINAS (compartido)
   ------------------------------------------------------------
   El MISMO archivo lo usan el navegador (para mostrar los totales
   al instante) y el servidor (que vuelve a calcular todo y es la
   fuente de verdad). Así nunca hay dos fórmulas distintas.

   Todo el dinero se maneja en CENTAVOS enteros (Q 25.00 = 2500) y
   las tasas en puntos básicos (12 % = 1200): sin errores de los
   números con decimales. Redondeo: mitad hacia arriba, al centavo.
   ============================================================ */
(function (raiz, fabrica) {
    if (typeof module === "object" && module.exports) module.exports = fabrica();
    else raiz.CalculoNomina = fabrica();
})(typeof self !== "undefined" ? self : this, function () {

    /* ---------- utilidades ---------- */
    function normalizar(texto) {
        return String(texto == null ? "" : texto)
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .toLowerCase().replace(/\s+/g, " ").replace(/[:.]+$/, "").trim();
    }

    /* Convierte "1,234.56", "Q 25", 25.5 → centavos. null si no es válido. */
    function aCentavos(valor) {
        if (valor === null || valor === undefined || valor === "") return null;
        if (typeof valor === "number") {
            if (!Number.isFinite(valor)) return null;
            return Math.round(valor * 100);
        }
        const limpio = String(valor).replace(/[Qq\s,]/g, "");
        if (!/^-?\d+(\.\d{1,2})?$/.test(limpio)) return null;
        const negativo = limpio.startsWith("-");
        const [entero, dec = ""] = limpio.replace("-", "").split(".");
        const c = Number(entero) * 100 + Number((dec + "00").slice(0, 2));
        return negativo ? -c : c;
    }

    function formatoQ(centavos) {
        const c = Math.round(Number(centavos) || 0);
        const negativo = c < 0;
        const abs = Math.abs(c);
        const entero = Math.floor(abs / 100).toLocaleString("en-US");
        const dec = String(abs % 100).padStart(2, "0");
        return (negativo ? "- " : "") + "Q " + entero + "." + dec;
    }

    /* División entera con redondeo mitad hacia arriba (positivos y negativos). */
    function dividirRedondeo(numerador, denominador) {
        const signo = (numerador < 0) !== (denominador < 0) ? -1 : 1;
        const n = Math.abs(numerador), d = Math.abs(denominador);
        return signo * Math.floor((2 * n + d) / (2 * d));
    }
    const aplicarTasa = (centavos, bp) => dividirRedondeo(centavos * bp, 10000);
    const quitarIva = (centavos, ivaBp) => dividirRedondeo(centavos * 10000, 10000 + ivaBp);
    const suma = lista => lista.reduce((a, b) => a + (Number(b) || 0), 0);

    /* ---------- actividades en el orden oficial ---------- */
    function ordenarActividades(importadas, oficiales) {
        const porClave = new Map();
        (importadas || []).forEach(a => {
            const clave = normalizar(a.nombre);
            const previa = porClave.get(clave);
            if (previa) previa.cantidad += Number(a.cantidad) || 0;
            else porClave.set(clave, { nombre: a.nombre, cantidad: Number(a.cantidad) || 0 });
        });
        const lista = oficiales.map(nombre => {
            const clave = normalizar(nombre);
            const encontrada = porClave.get(clave);
            porClave.delete(clave);
            return { nombre, clave, cantidad: encontrada ? encontrada.cantidad : 0, nueva: false };
        });
        porClave.forEach((a, clave) => lista.push({ nombre: String(a.nombre).toUpperCase().trim(), clave, cantidad: a.cantidad, nueva: true }));
        return lista;
    }

    function buscarPrecio(nombre, datos, reglas, preciosExtra) {
        const clave = normalizar(nombre);
        const deMapa = mapa => {
            if (!mapa) return null;
            for (const k of Object.keys(mapa)) if (normalizar(k) === clave) return mapa[k];
            return null;
        };
        const ajuste = deMapa(datos.precios) || {};
        const base = deMapa(reglas.precios) || deMapa(preciosExtra) || {};
        const elegir = campo => (ajuste[campo] !== undefined && ajuste[campo] !== null) ? ajuste[campo]
            : (base[campo] !== undefined && base[campo] !== null ? base[campo] : null);
        return { produccion: elegir("produccion"), bono: elegir("bono") };
    }

    /* ============================================================
       TÉCNICO (socio / no socio): pasos 3 y 4
       ============================================================ */
    function calcularTecnico(datos, reglas, oficiales, preciosExtra) {
        datos = datos || {};
        const ajustes = datos.ajustes || {};
        const importadas = (datos.importacion && datos.importacion.actividades) || [];
        const actividades = ordenarActividades(importadas, oficiales).map(a => {
            const precio = buscarPrecio(a.nombre, datos, reglas, preciosExtra);
            const pendienteProd = precio.produccion === null;
            const pendienteBono = precio.bono === null;
            return {
                ...a,
                precioProduccion: precio.produccion,
                precioBono: precio.bono,
                totalProduccion: pendienteProd ? 0 : a.cantidad * precio.produccion,
                totalBono: pendienteBono ? 0 : a.cantidad * precio.bono,
                precioPendiente: (pendienteProd || pendienteBono) && a.cantidad > 0
            };
        });

        const t = reglas.tasas;
        const conIva = suma(actividades.map(a => a.totalProduccion));
        const sinIva = quitarIva(conIva, t.iva_bp);
        const iva = conIva - sinIva;
        const isr = aplicarTasa(sinIva, t.retencion_isr_bp);
        const descuentoProduccion = iva + isr;
        const subtotalProduccion = conIva - descuentoProduccion;
        const aporteSeisa = aplicarTasa(subtotalProduccion, t.aporte_seisa_bp);
        const flotilla = aplicarTasa(subtotalProduccion, t.flotilla_bp);
        const mantenimiento = ajustes.mantenimiento_vehiculos ?? reglas.mantenimiento_vehiculos ?? 0;
        const subtotalSeisa = subtotalProduccion - aporteSeisa - flotilla - mantenimiento;

        const cargos = reglas.cargosSeisa.map(c => {
            if (c.origen === "produccion_sin_iva") return { clave: c.clave, nombre: c.nombre, monto: sinIva, editable: false, calculado: true };
            const editado = ajustes.cargos && ajustes.cargos[c.clave];
            return { clave: c.clave, nombre: c.nombre, monto: editado ?? c.monto ?? 0, editable: true, editadoManual: editado !== undefined && editado !== null };
        });
        const totalCargos = suma(cargos.filter(c => !c.calculado).map(c => c.monto));
        // fórmula del salario sugerido (configurable por tipo en nominas.config.js)
        const formula = (reglas.salario && reglas.salario.formula) || "sueldo_completo_menos_cargos";
        // (nunca negativo: si la producción no alcanza a cubrir los cargos, se sugiere 0)
        const salarioSugerido = formula === "manual" ? 0 : Math.max(0, sinIva - totalCargos);
        const salario = ajustes.salario_mes ?? salarioSugerido;

        const bono = suma(actividades.map(a => a.totalBono));
        const totalSinDescuentos = bono + salario;

        const descuentos = reglas.descuentosTrabajador.map(d => {
            const editado = ajustes[d.clave];
            return { clave: d.clave, nombre: d.nombre, monto: editado ?? d.monto ?? 0, editable: true, conMes: !!d.conMes };
        });
        (datos.descuentos_extra || []).forEach(d => descuentos.push({
            clave: "extra:" + d.id, id: d.id, nombre: d.concepto, descripcion: d.descripcion || "", monto: d.monto, manual: true
        }));
        const totalDescuentos = suma(descuentos.map(d => d.monto));

        return {
            actividades,
            totalOrdenes: suma(actividades.map(a => a.cantidad)),
            pendientes: actividades.filter(a => a.precioPendiente).map(a => a.nombre),
            produccion: { conIva, sinIva, iva, isr, descuentoProduccion, subtotalProduccion, aporteSeisa, flotilla, mantenimiento, subtotalSeisa },
            cargos, totalCargos, salarioSugerido, salario, salarioEditado: ajustes.salario_mes !== undefined && ajustes.salario_mes !== null,
            bono, totalSinDescuentos, descuentos, totalDescuentos,
            total: totalSinDescuentos - totalDescuentos
        };
    }

    /* ============================================================
       PLANILLA ADMINISTRATIVA
       ============================================================ */
    function calcularAdministrativa(datos, reglas) {
        const p = (datos && datos.planilla) || {};
        const salarioBase = p.salario_base ?? 0;
        const bonificacion = p.bonificacion ?? reglas.bonificacion_ley ?? 0;
        const otrosIngresos = p.otros_ingresos ?? 0;
        const ingresos = [
            { clave: "salario_base", nombre: "Salario base", monto: salarioBase },
            { clave: "bonificacion", nombre: "Bonificación de ley", monto: bonificacion }
        ];
        if (otrosIngresos) ingresos.push({ clave: "otros_ingresos", nombre: p.otros_ingresos_desc || "Otros ingresos", monto: otrosIngresos });
        const totalIngresos = suma(ingresos.map(i => i.monto));

        const igssSugerido = aplicarTasa(salarioBase, reglas.tasas.igss_laboral_bp);
        const igss = p.igss ?? igssSugerido;
        const isrAplica = p.isr_aplica !== false;
        const isr = isrAplica ? (p.isr ?? 0) : 0;
        const otros = p.otros_descuentos ?? 0;
        const descuentos = [
            { clave: "igss", nombre: "Cuota IGSS", monto: igss },
            { clave: "isr", nombre: "ISR", monto: isr },
            { clave: "otros_descuentos", nombre: "Otros descuentos", monto: otros, descripcion: p.otros_descuentos_desc || "" }
        ];
        (datos.descuentos_extra || []).forEach(d => descuentos.push({
            clave: "extra:" + d.id, id: d.id, nombre: d.concepto, descripcion: d.descripcion || "", monto: d.monto, manual: true
        }));
        const totalDescuentos = suma(descuentos.map(d => d.monto));
        return {
            ingresos, totalIngresos, igssSugerido, isrAplica, descuentos, totalDescuentos,
            liquido: totalIngresos - totalDescuentos, total: totalIngresos - totalDescuentos
        };
    }

    const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    function nombrePeriodo(periodo, mayusculas) {
        const [a, m] = String(periodo || "").split("-").map(Number);
        if (!a || !m) return "—";
        const texto = MESES[m - 1] + " " + a;
        return mayusculas ? texto.toUpperCase() : texto.charAt(0).toUpperCase() + texto.slice(1);
    }
    const nombreMes = periodo => {
        const m = Number(String(periodo || "").split("-")[1]);
        return m ? MESES[m - 1] : "";
    };

    return {
        normalizar, aCentavos, formatoQ, aplicarTasa, quitarIva, dividirRedondeo, suma,
        ordenarActividades, calcularTecnico, calcularAdministrativa, nombrePeriodo, nombreMes, MESES
    };
});
