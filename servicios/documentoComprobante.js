const { formatoQ, nombrePeriodo, nombreMes } = require("../public/js/nominas-calculo");

/* ============================================================
   Arma el COMPROBANTE a partir del snapshot aprobado.
   La vista en pantalla, la impresión, el PDF y el historial usan
   este mismo objeto: así los montos nunca pueden diferir.
   ============================================================ */

function enmascararCuenta(cuenta) {
    const limpia = String(cuenta || "").replace(/\s+/g, "");
    if (!limpia) return "—";
    if (limpia.length <= 4) return limpia;
    return "•••• " + limpia.slice(-4);
}

function armarDocumento(snapshot, numeroRecibo, fechaGeneracion) {
    const s = snapshot;
    const c = s.calculo;
    const mes = nombreMes(s.periodo);
    const doc = {
        numeroRecibo,
        fechaGeneracion,
        tipo: s.tipo,
        tipoNombre: s.tipoNombre,
        periodo: s.periodo,
        periodoNombre: nombrePeriodo(s.periodo),
        empleado: s.empleado,
        inspector: s.inspector || null,
        aprobadoPor: s.aprobadoPor,
        fechaAprobacion: s.fechaAprobacion,
        observaciones: (s.observaciones || "").trim(),
        pago: {
            forma: (s.pago && s.pago.forma_pago) || "—",
            banco: (s.pago && s.pago.banco) || "—",
            cuenta: enmascararCuenta(s.pago && s.pago.cuenta)
        },
        actividades: null,
        secciones: [],
        liquido: c.total,
        liquidoTexto: formatoQ(c.total)
    };

    const fila = (concepto, monto, extra = {}) => ({ concepto, monto, montoTexto: formatoQ(monto), ...extra });

    if (s.tipo === "ADMINISTRATIVA") {
        doc.secciones.push({
            clave: "ingresos", titulo: "Ingresos",
            filas: c.ingresos.map(i => fila(i.nombre, i.monto)),
            total: fila("Total de ingresos", c.totalIngresos)
        });
        doc.secciones.push({
            clave: "descuentos", titulo: "Descuentos",
            filas: c.descuentos.map(d => fila(d.nombre, d.monto, { detalle: d.descripcion || "", manual: !!d.manual })),
            total: fila("Total de descuentos", c.totalDescuentos)
        });
    } else {
        doc.actividades = c.actividades.map(a => ({
            nombre: a.nombre, cantidad: a.cantidad, nueva: a.nueva,
            precioProduccion: a.precioProduccion, totalProduccion: a.totalProduccion,
            precioBono: a.precioBono, totalBono: a.totalBono
        }));
        doc.totalOrdenes = c.totalOrdenes;
        const p = c.produccion;
        doc.secciones.push({
            clave: "produccion", titulo: "Producción SEISA",
            filas: [
                fila("Total de producción con IVA", p.conIva),
                fila("Total de producción sin IVA", p.sinIva),
                fila("IVA de la producción", p.iva),
                fila("Retención ISR", p.isr),
                fila("Descuento a la producción (IVA, ISR)", p.descuentoProduccion),
                fila("Subtotal", p.subtotalProduccion),
                fila("Aporte para el funcionamiento de SEISA", p.aporteSeisa),
                fila("Aporte para renovación de flotilla de vehículos", p.flotilla),
                fila("Mantenimiento de vehículos", p.mantenimiento)
            ],
            total: fila("Subtotal producción SEISA", p.subtotalSeisa)
        });
        doc.secciones.push({
            clave: "cargos", titulo: "Descuentos SEISA (cargos cubiertos con la producción)",
            filas: c.cargos.map(x => fila(x.nombre, x.monto)),
            total: null
        });
        doc.secciones.push({
            clave: "ingresos", titulo: "Bonificación y salario",
            filas: [
                fila(`Bono de producción mes de ${mes} ${s.periodo.slice(0, 4)}`, c.bono),
                fila("Total de bonificación", c.bono),
                fila(`Salario mes de ${mes} ${s.periodo.slice(0, 4)}`, c.salario)
            ],
            total: fila("Total a recibir de bonificación + salario (sin descuentos)", c.totalSinDescuentos)
        });
        doc.secciones.push({
            clave: "descuentos", titulo: "Descuentos",
            filas: c.descuentos.map(d => fila(d.conMes ? `${d.nombre} ${s.periodo.slice(0, 4)} mes de ${mes}` : d.nombre, d.monto, { detalle: d.descripcion || "", manual: !!d.manual })),
            total: fila("Total de descuentos", c.totalDescuentos)
        });
    }
    return doc;
}

function nombreArchivoPdf(doc) {
    const limpio = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return `COMPROBANTE_${limpio(doc.empleado && doc.empleado.nombre)}_${limpio(doc.periodoNombre)}.pdf`;
}

module.exports = { armarDocumento, nombreArchivoPdf, enmascararCuenta };
