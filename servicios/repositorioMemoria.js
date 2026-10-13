/* ============================================================
   Repositorio de nóminas EN MEMORIA
   ------------------------------------------------------------
   Misma interfaz que modelos/nominas.model.js (SQL Server), pero
   guarda todo en variables. Se usa en las pruebas automáticas
   (pruebas/*.test.js) y en el servidor de demostración — NUNCA en
   el sistema real.
   ============================================================ */

function conflicto(mensaje) {
    const e = new Error(mensaje);
    e.status = 409;
    return e;
}

const copia = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));

function crearRepositorioMemoria({ empleados = [], perfiles = [] } = {}) {
    const nominas = new Map();
    const historial = [];
    const archivos = [];
    const precios = [];
    const perfilesPago = new Map(perfiles.map(p => [p.codigo_empleado, { ...p }]));
    let siguienteId = 1;
    let siguienteRecibo = 1000;

    const activo = n => n.estado !== "CANCELADA";

    return {
        async crear(n) {
            const nueva = { ...copia(n), id_nomina: siguienteId++, version: 1 };
            if (nueva.codigo_empleado && [...nominas.values()].some(x => activo(x) && x.tipo === nueva.tipo && x.periodo === nueva.periodo && x.codigo_empleado === nueva.codigo_empleado)) {
                throw conflicto("Ya existe una nómina para ese empleado, tipo y período.");
            }
            nominas.set(nueva.id_nomina, nueva);
            return copia(nueva);
        },
        async obtener(id) {
            return copia(nominas.get(id)) || null;
        },
        async guardar(n) {
            const actual = nominas.get(n.id_nomina);
            if (!actual) throw conflicto("La nómina ya no existe.");
            if (actual.version !== n.version) throw conflicto("La nómina fue modificada por otra persona. Recarga para ver los cambios.");
            if (actual.estado === "APROBADA") throw conflicto("La nómina ya fue aprobada.");
            if (n.codigo_empleado && n.estado !== "CANCELADA" && [...nominas.values()].some(x => x.id_nomina !== n.id_nomina && activo(x) && x.tipo === n.tipo && x.periodo === n.periodo && x.codigo_empleado === n.codigo_empleado)) {
                throw conflicto("Ya existe una nómina para ese empleado, tipo y período.");
            }
            const guardada = { ...copia(n), version: n.version + 1 };
            nominas.set(n.id_nomina, guardada);
            n.version = guardada.version;
            return copia(guardada);
        },
        async buscar({ tipo, periodo, codigo_empleado }) {
            return [...nominas.values()].filter(x => x.tipo === tipo && x.periodo === periodo && x.codigo_empleado === codigo_empleado).map(copia);
        },
        async listar(f = {}) {
            let lista = [...nominas.values()].filter(activo);
            if (f.estados) lista = lista.filter(x => f.estados.includes(x.estado));
            if (f.estado) lista = lista.filter(x => x.estado === f.estado);
            if (f.tipo) lista = lista.filter(x => x.tipo === f.tipo);
            if (f.periodo) lista = lista.filter(x => x.periodo === f.periodo);
            if (f.codigo_empleado) lista = lista.filter(x => x.codigo_empleado === Number(f.codigo_empleado));
            if (f.texto) {
                const t = String(f.texto).toLowerCase();
                lista = lista.filter(x => String(x.empleado_nombre || "").toLowerCase().includes(t) || String(x.numero_recibo || "").includes(t));
            }
            return lista.sort((a, b) => b.id_nomina - a.id_nomina).map(copia);
        },
        async registrarHistorial(entradas) { entradas.forEach(e => historial.push({ id_historial: historial.length + 1, ...copia(e) })); },
        async historial(id) { return historial.filter(h => h.id_nomina === id).map(copia).reverse(); },
        async registrarArchivo(a) { archivos.push(copia(a)); },
        async marcarArchivoEliminado(id, nombre) { archivos.filter(a => a.id_nomina === id && a.nombre_guardado === nombre).forEach(a => { a.eliminado = true; }); },
        async empleadosActivos() { return empleados.filter(e => e.activo !== false).map(copia); },
        async empleado(codigo) { return copia(empleados.find(e => e.codigo_empleado === codigo)) || null; },
        async perfilPago(codigo) { return copia(perfilesPago.get(codigo)) || null; },
        async guardarPerfilPago(p) {
            const actual = perfilesPago.get(p.codigo_empleado) || { codigo_empleado: p.codigo_empleado };
            Object.entries(p).forEach(([k, v]) => { if (v !== undefined && k !== "id_credencial") actual[k] = v; });
            perfilesPago.set(p.codigo_empleado, actual);
        },
        async preciosActividades(tipo) { return precios.filter(p => p.tipo === tipo).map(copia); },
        async guardarPrecioActividad(p) {
            const i = precios.findIndex(x => x.tipo === p.tipo && x.actividad === p.actividad);
            if (i >= 0) precios[i] = copia(p); else precios.push(copia(p));
        },
        async aprobar({ id_nomina, version, snapshot, total, fecha, paso_actual, paso_completado }) {
            // equivalente a la transacción SQL: o se hace todo o nada
            const n = nominas.get(id_nomina);
            if (!n || n.estado === "APROBADA") throw conflicto("Esta nómina ya fue aprobada.");
            if (n.version !== version) throw conflicto("La nómina cambió mientras se aprobaba. Vuelve a intentarlo.");
            const numero = siguienteRecibo++;
            Object.assign(n, {
                estado: "APROBADA", snapshot: copia(snapshot), numero_recibo: numero, total_centavos: total,
                fecha_aprobacion: fecha, aprobado_por: snapshot.idAprobador, version: n.version + 1,
                paso_actual, paso_completado
            });
            return { numero_recibo: numero };
        },
        // Comprobante aprobado eliminado: sale del historial (queda guardado para auditoría)
        async eliminarAprobada(id_nomina) {
            const n = nominas.get(id_nomina);
            if (!n || n.estado !== "APROBADA") throw conflicto("Ese comprobante ya no está en el historial.");
            Object.assign(n, { estado: "CANCELADA", version: n.version + 1 });
        },
        // solo para pruebas
        _archivos: archivos,
        _historial: historial
    };
}

module.exports = { crearRepositorioMemoria };
