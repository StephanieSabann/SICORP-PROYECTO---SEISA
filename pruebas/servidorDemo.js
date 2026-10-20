/* ============================================================
   Servidor de DEMOSTRACIÓN (sin SQL Server): sirve la carpeta public/
   con datos de ejemplo en memoria para ver los Reportes y el
   Mantenimiento de Nómina. Reloj fijo: 30 de junio de 2026.
     npm run demo      →  http://localhost:3100/reportes.html
   NO es para producción: los datos viven solo mientras corre.
   ============================================================ */
const express = require("express");
const path = require("path");
const { crearServicioReportes } = require("../servicios/reportes.servicio");
const { crearRepositorioReportesMemoria, crearDatosDemo } = require("../servicios/repositorioReportesMemoria");
const { crearRutasReportes } = require("../rutas/reportes.routes");
const { crearServicioNominasMantenimiento } = require("../servicios/nominasMantenimiento.servicio");
const { crearRutasNominasMantenimiento } = require("../rutas/nominasMantenimiento.routes");
const { crearRepositorioMemoria } = require("../servicios/repositorioMemoria");

const PUERTO = Number(process.env.PUERTO_DEMO || 3100);
const reloj = { valor: new Date(2026, 5, 30, 10, 0) };
const ahora = () => reloj.valor;
const ACCESOS = (process.env.ACCESOS_DEMO || "Empleados,Inventario,Nóminas,Reportes,Usuarios").split(",");

const usuario = { id_credencial: 1, nombre: "Jonathan Administrador" };
const app = express();
app.use(express.json());

app.get("/api/sesion", (req, res) => res.json({ exito: true, datos: { id_credencial: 1, usuario: "jonathan", nombre: "Jonathan", rol: "Administrador", accesos: ACCESOS } }));

const repoReportes = crearRepositorioReportesMemoria(crearDatosDemo("2026-06-30"), { ahora });
const correos = [];
const servicioReportes = crearServicioReportes({ repo: repoReportes, ahora, enviarCorreo: async m => { correos.push(m); return { enviado: true }; } });
const rutas = crearRutasReportes(servicioReportes, async () => usuario, async () => ACCESOS);
app.use("/api/reportes", rutas.reportes);
app.use("/api/mantenimiento/reportes", rutas.mantenimiento);

/* Mantenimiento de nómina con un repositorio en memoria */
const repoNom = crearRepositorioMemoria({ empleados: [] });
const bitacora = []; let id = 1;
Object.assign(repoNom, {
    async listarParametros(tipo) { return repoNom._parametros.filter(p => p.tipo === tipo).map(p => ({ ...p })); },
    async guardarParametro(p) {
        const i = repoNom._parametros.findIndex(x => x.tipo === p.tipo && x.clave === p.clave && x.vigente_desde === p.vigente_desde);
        const previo = i >= 0 ? repoNom._parametros[i].valor : null;
        const fila = { id_parametro: id++, tipo: p.tipo, clave: p.clave, valor: p.valor, vigente_desde: p.vigente_desde, motivo: p.motivo };
        if (i >= 0) repoNom._parametros[i] = fila; else repoNom._parametros.push(fila);
        return previo;
    },
    async eliminarParametro({ tipo, clave, vigente_desde }) {
        const i = repoNom._parametros.findIndex(x => x.tipo === tipo && x.clave === clave && x.vigente_desde === vigente_desde);
        return i < 0 ? null : repoNom._parametros.splice(i, 1)[0].valor;
    },
    async registrarBitacoraParametro(b) { bitacora.unshift({ ...b, id_bitacora: bitacora.length + 1, fecha: ahora() }); },
    async bitacoraParametros() { return { filas: bitacora, total: bitacora.length }; },
    async estadoPeriodos() {
        return { conteos: [{ periodo: "2026-06", estado: "EN_PREPARACION", total: 7 }, { periodo: "2026-06", estado: "APROBADA", total: 31 }, { periodo: "2026-05", estado: "APROBADA", total: 38 }],
            cierres: repoNom._cerrados.map(p => ({ periodo: p, estado: "CERRADO", usuario: "Jonathan Administrador", fecha: ahora(), motivo: null })) };
    },
    async marcarPeriodo({ periodo, estado }) {
        const i = repoNom._cerrados.indexOf(periodo);
        if (estado === "CERRADO" && i < 0) repoNom._cerrados.push(periodo);
        if (estado === "ABIERTO" && i >= 0) repoNom._cerrados.splice(i, 1);
    },
    async historialGeneral() { return { filas: [], total: 0 }; }
});
const servicioNom = crearServicioNominasMantenimiento({ repo: repoNom, ahora });
app.use("/api/mantenimiento/nominas", crearRutasNominasMantenimiento(servicioNom, async () => usuario));

app.use(express.static(path.join(__dirname, "..", "public")));
if (require.main === module) {
    app.listen(PUERTO, () => console.log(`Demo de Reportes en http://localhost:${PUERTO}/reportes.html`));
}
module.exports = { app };
