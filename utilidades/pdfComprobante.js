const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const { EMPRESA } = require("../configuracion/nominas.config");
const { formatoQ } = require("../public/js/nominas-calculo");

/* ============================================================
   PDF del comprobante de pago (A4 vertical)
   Se arma SIEMPRE desde el documento del snapshot aprobado
   (servicios/documentoComprobante.js), nunca desde el borrador.
   ============================================================ */

const LOGO = path.join(__dirname, "..", "public", "img", "logo.png");
const AZUL = "#1D4E89", ROJO = "#B3312F", VERDE = "#14833B", GRIS = "#5B6670", LINEA = "#C9D2DB";

function fechaLarga(f) {
    const d = f ? new Date(f) : new Date();
    if (isNaN(d)) return "—";
    return d.toLocaleDateString("es-GT", { day: "2-digit", month: "long", year: "numeric" }) + " " +
        d.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
}

function generarPdfComprobante(doc) {
    return new Promise((resolver, rechazar) => {
        const pdf = new PDFDocument({ size: "A4", margin: 42, info: { Title: `Comprobante de pago ${doc.numeroRecibo}`, Author: EMPRESA.sistema } });
        const partes = [];
        pdf.on("data", p => partes.push(p));
        pdf.on("end", () => resolver(Buffer.concat(partes)));
        pdf.on("error", rechazar);

        const izq = pdf.page.margins.left;
        const ancho = pdf.page.width - izq - pdf.page.margins.right;
        const limiteY = () => pdf.page.height - pdf.page.margins.bottom - 20;
        const espacio = alto => { if (pdf.y + alto > limiteY()) pdf.addPage(); };

        // ---------- encabezado ----------
        if (fs.existsSync(LOGO)) pdf.image(LOGO, izq, 34, { width: 150 });
        pdf.font("Helvetica-Bold").fontSize(9).fillColor(GRIS)
            .text(EMPRESA.nombreLegal, izq, 40, { width: ancho, align: "right" })
            .font("Helvetica").text(EMPRESA.sistema, { width: ancho, align: "right" })
            .text(`Generado: ${fechaLarga(doc.fechaGeneracion)}`, { width: ancho, align: "right" });

        pdf.moveDown(2.2);
        pdf.y = Math.max(pdf.y, 112);
        pdf.font("Helvetica-Bold").fontSize(18).fillColor("#111").text("COMPROBANTE DE PAGO", izq, pdf.y, { width: ancho, align: "center" });
        pdf.font("Helvetica-Bold").fontSize(12.5).fillColor(AZUL).text(`Recibo No. ${doc.numeroRecibo}`, izq, pdf.y, { width: ancho, align: "center" });
        pdf.moveDown(0.6);

        // ---------- datos del empleado ----------
        const y0 = pdf.y;
        const datos = [
            ["Empleado No.", String(doc.empleado.codigo_empleado ?? "—")],
            ["Nombre", doc.empleado.nombre || "—"],
            ["Puesto", doc.empleado.puesto || "—"],
            ["Período", doc.periodoNombre],
            ["Tipo de nómina", doc.tipoNombre],
            ["Inspector", doc.inspector || "—"]
        ].filter(([k]) => k !== "Inspector" || doc.inspector);
        const col = ancho / 3;
        datos.forEach(([k, v], i) => {
            const x = izq + (i % 3) * col + 10;
            const y = y0 + 10 + Math.floor(i / 3) * 34;
            pdf.font("Helvetica").fontSize(8).fillColor(GRIS).text(k.toUpperCase(), x, y, { width: col - 20 });
            pdf.font("Helvetica-Bold").fontSize(10.5).fillColor("#111").text(v, x, y + 11, { width: col - 20 });
        });
        const altoDatos = 14 + Math.ceil(datos.length / 3) * 34;
        pdf.roundedRect(izq, y0, ancho, altoDatos, 6).lineWidth(0.8).strokeColor(LINEA).stroke();
        pdf.y = y0 + altoDatos + 14;

        // ---------- actividades (técnicos) ----------
        if (doc.actividades) {
            espacio(60);
            pdf.font("Helvetica-Bold").fontSize(11).fillColor(AZUL).text("Producción y actividades", izq, pdf.y);
            pdf.moveDown(0.3);
            const cols = [
                { t: "Actividad", w: ancho * 0.40, a: "left" },
                { t: "Órdenes", w: ancho * 0.10, a: "right" },
                { t: "Precio", w: ancho * 0.12, a: "right" },
                { t: "Producción", w: ancho * 0.14, a: "right" },
                { t: "Precio bono", w: ancho * 0.11, a: "right" },
                { t: "Bono", w: ancho * 0.13, a: "right" }
            ];
            const filaTabla = (valores, negrita, fondo) => {
                const alto = Math.max(14, pdf.font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).heightOfString(valores[0], { width: cols[0].w - 6 }) + 5);
                espacio(alto);
                const y = pdf.y;
                if (fondo) pdf.rect(izq, y - 2, ancho, alto).fill(fondo);
                let x = izq;
                valores.forEach((v, i) => {
                    pdf.font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor("#111")
                        .text(v, x + 3, y + 1, { width: cols[i].w - 6, align: cols[i].a });
                    x += cols[i].w;
                });
                pdf.y = y + alto;
                pdf.moveTo(izq, pdf.y - 1).lineTo(izq + ancho, pdf.y - 1).lineWidth(0.4).strokeColor(LINEA).stroke();
            };
            filaTabla(cols.map(c => c.t), true, "#E9EEF4");
            doc.actividades.forEach(a => filaTabla([
                a.nombre + (a.nueva ? "  (nueva)" : ""), String(a.cantidad),
                a.precioProduccion === null ? "—" : formatoQ(a.precioProduccion), formatoQ(a.totalProduccion),
                a.precioBono === null ? "—" : formatoQ(a.precioBono), formatoQ(a.totalBono)
            ], false));
            const sumaProd = doc.actividades.reduce((s, a) => s + a.totalProduccion, 0);
            const sumaBono = doc.actividades.reduce((s, a) => s + a.totalBono, 0);
            filaTabla(["TOTAL", String(doc.totalOrdenes), "", formatoQ(sumaProd), "", formatoQ(sumaBono)], true, "#F3F5F8");
            pdf.moveDown(0.8);
        }

        // ---------- secciones ----------
        doc.secciones.forEach(s => {
            espacio(40 + s.filas.length * 13);
            pdf.font("Helvetica-Bold").fontSize(10.5).fillColor(s.clave === "descuentos" ? ROJO : AZUL).text(s.titulo.toUpperCase(), izq, pdf.y);
            pdf.moveDown(0.2);
            s.filas.forEach(f => {
                espacio(14);
                const y = pdf.y;
                const concepto = f.concepto + (f.detalle ? ` — ${f.detalle}` : "") + (f.manual ? " (agregado)" : "");
                pdf.font("Helvetica").fontSize(9).fillColor("#111").text(concepto, izq + 8, y, { width: ancho * 0.72 });
                const yFin = pdf.y;
                pdf.text(f.montoTexto, izq, y, { width: ancho, align: "right" });
                pdf.y = Math.max(yFin, y + 12);
            });
            if (s.total) {
                espacio(18);
                pdf.moveTo(izq, pdf.y + 1).lineTo(izq + ancho, pdf.y + 1).lineWidth(0.6).strokeColor(LINEA).stroke();
                const y = pdf.y + 4;
                pdf.font("Helvetica-Bold").fontSize(9.5).fillColor(s.clave === "descuentos" ? ROJO : AZUL).text(s.total.concepto.toUpperCase(), izq + 8, y, { width: ancho * 0.72 });
                pdf.text(s.total.montoTexto, izq, y, { width: ancho, align: "right" });
                pdf.y = y + 14;
            }
            pdf.moveDown(0.6);
        });

        // ---------- resumen de pago ----------
        espacio(110);
        const yR = pdf.y;
        pdf.roundedRect(izq, yR, ancho, 92, 8).lineWidth(1.2).strokeColor(VERDE).stroke();
        pdf.font("Helvetica").fontSize(9).fillColor(GRIS).text("LÍQUIDO A RECIBIR", izq + 14, yR + 12);
        pdf.font("Helvetica-Bold").fontSize(24).fillColor(VERDE).text(doc.liquidoTexto, izq + 14, yR + 26);
        const xP = izq + ancho * 0.52;
        [["Forma de pago", doc.pago.forma], ["Banco", doc.pago.banco], ["Cuenta", doc.pago.cuenta]].forEach(([k, v], i) => {
            pdf.font("Helvetica").fontSize(9).fillColor(GRIS).text(k + ":", xP, yR + 14 + i * 22, { width: 80 });
            pdf.font("Helvetica-Bold").fontSize(9.5).fillColor("#111").text(v || "—", xP + 80, yR + 14 + i * 22, { width: ancho * 0.48 - 90 });
        });
        pdf.y = yR + 104;

        // ---------- observaciones (solo si hay) ----------
        if (doc.observaciones) {
            espacio(50);
            pdf.font("Helvetica-Bold").fontSize(10).fillColor(AZUL).text("Observaciones", izq, pdf.y);
            pdf.font("Helvetica").fontSize(9).fillColor("#111").text(doc.observaciones, izq, pdf.y + 2, { width: ancho });
            pdf.moveDown(1);
        }

        // ---------- firmas ----------
        espacio(80);
        const yF = Math.max(pdf.y + 34, pdf.y);
        const anchoFirma = ancho / 2 - 30;
        [[izq, "Firma del empleado (conformidad)"], [izq + ancho / 2 + 30, `Aprobado por: ${doc.aprobadoPor || "—"}`]].forEach(([x, t]) => {
            pdf.moveTo(x, yF).lineTo(x + anchoFirma, yF).lineWidth(0.8).strokeColor("#333").stroke();
            pdf.font("Helvetica").fontSize(8.5).fillColor(GRIS).text(t, x, yF + 5, { width: anchoFirma, align: "center" });
        });
        pdf.font("Helvetica").fontSize(7.5).fillColor(GRIS)
            .text(`Comprobante generado con los valores aprobados el ${fechaLarga(doc.fechaAprobacion)}. No puede modificarse.`, izq, yF + 30, { width: ancho, align: "center" });

        pdf.end();
    });
}

module.exports = { generarPdfComprobante };
