const U = require("./util");
const A = require("./agregadores");
const CAT = require("./catalogos");

/* ============================================================
   CATÁLOGO DE REPORTES
   ------------------------------------------------------------
   Para AGREGAR un reporte nuevo basta con sumar un objeto a la
   lista REPORTES de abajo. No hay que tocar rutas, pantallas ni
   exportación: la tarjeta aparece en "Reportes disponibles", se
   puede consultar con búsqueda, orden y paginación, se exporta a
   Excel/CSV y se puede programar por correo.

   Campos de una definición:
     clave        identificador único (minúsculas_con_guion_bajo)
     modulo       "Empleados" | "Inventario" | "Nóminas"  (pestaña)
     acceso       acceso de rol que se exige (Catalogo_acceso.nombre)
     titulo / subtitulo / descripcion / icono
     conPeriodo   true si depende del período seleccionado
     columnas     [{ campo, titulo, tipo, ancho? }]
                  tipo: texto | fecha | fechahora | entero | decimal | moneda | estado
     totales      campos numéricos que se suman en la fila de totales
     filtros(ctx) lista de filtros desplegables: [{ clave, etiqueta, opciones:[{valor,etiqueta}], defecto }]
     filas(ctx)   devuelve el arreglo de filas (objetos con los campos de columnas)
   ctx = { repo, params, hoy, periodo, filtros, ahora }
   ============================================================ */

const opcionesSiNo = (...pares) => pares.map(([valor, etiqueta]) => ({ valor, etiqueta }));
const edad = (nacimiento, hoy) => { const f = U.aISO(nacimiento); return f ? U.aniosCumplidos(f, hoy) : null; };

/* ---------------------------------------------------------- EMPLEADOS */
const empleados_activos = {
    clave: "empleados_activos", modulo: "Empleados", acceso: "Empleados", icono: "personas",
    titulo: "Empleados", subtitulo: "Empleados activos",
    descripcion: "Listado del personal con su puesto, contacto, fecha de contratación y antigüedad.",
    conPeriodo: false,
    columnas: [
        { campo: "codigo", titulo: "Código", tipo: "entero" }, { campo: "nombre", titulo: "Nombre" }, { campo: "puesto", titulo: "Puesto" },
        { campo: "tipo", titulo: "Tipo" }, { campo: "telefono", titulo: "Teléfono" }, { campo: "email", titulo: "Correo" },
        { campo: "fecha_contratacion", titulo: "Contratación", tipo: "fecha" }, { campo: "antiguedad", titulo: "Antigüedad (años)", tipo: "entero" },
        { campo: "estado", titulo: "Estado", tipo: "estado" }
    ],
    async filtros({ repo }) {
        const puestos = [...new Set((await repo.empleados()).map(e => e.puesto).filter(Boolean))].sort();
        return [
            { clave: "estado", etiqueta: "Estado", defecto: "Activo", opciones: opcionesSiNo(["Activo", "Activos"], ["Inactivo", "Inactivos"], ["", "Todos"]) },
            { clave: "puesto", etiqueta: "Puesto", defecto: "", opciones: [{ valor: "", etiqueta: "Todos los puestos" }, ...puestos.map(p => ({ valor: p, etiqueta: p }))] }
        ];
    },
    async filas({ repo, filtros, hoy }) {
        const NOMBRE_TIPO = { TECNICO_SOCIO: "Técnico socio", TECNICO_NO_SOCIO: "Técnico no socio", AUXILIAR: "Auxiliar", ADMINISTRATIVO: "Administrativo" };
        return (await repo.empleados())
            .map(e => ({
                codigo: e.codigo_empleado, nombre: U.nombreCompleto(e), puesto: e.puesto || "—",
                tipo: NOMBRE_TIPO[e.tipo_empleado] || (A.esTecnico(e) ? "Sin clasificar" : "—"),
                telefono: e.telefono || "", email: e.email || "", fecha_contratacion: U.aISO(e.fecha_contratacion),
                antiguedad: U.aISO(e.fecha_contratacion) ? Math.max(0, U.aniosCumplidos(U.aISO(e.fecha_contratacion), hoy)) : null,
                estado: e.activo ? "Activo" : "Inactivo"
            }))
            .filter(f => (!filtros.estado || f.estado === filtros.estado) && (!filtros.puesto || f.puesto === filtros.puesto));
    }
};

const expedientes_laborales = {
    clave: "expedientes_laborales", modulo: "Empleados", acceso: "Empleados", icono: "carpeta",
    titulo: "Empleados", subtitulo: "Expedientes laborales",
    descripcion: "Datos personales y laborales de cada empleado, con el porcentaje de completitud del expediente.",
    conPeriodo: false,
    columnas: [
        { campo: "codigo", titulo: "Código", tipo: "entero" }, { campo: "nombre", titulo: "Nombre" }, { campo: "puesto", titulo: "Puesto" },
        { campo: "dpi", titulo: "DPI" }, { campo: "nit", titulo: "NIT" }, { campo: "direccion", titulo: "Dirección" },
        { campo: "fecha_nacimiento", titulo: "Nacimiento", tipo: "fecha" }, { campo: "edad", titulo: "Edad", tipo: "entero" },
        { campo: "fecha_contratacion", titulo: "Contratación", tipo: "fecha" }, { campo: "salario_base", titulo: "Salario base", tipo: "moneda" },
        { campo: "completitud", titulo: "Expediente (%)", tipo: "entero" }, { campo: "faltantes", titulo: "Datos que faltan" },
        { campo: "estado", titulo: "Estado", tipo: "estado" }
    ],
    async filtros() {
        return [
            { clave: "estado", etiqueta: "Estado", defecto: "Activo", opciones: opcionesSiNo(["Activo", "Activos"], ["Inactivo", "Inactivos"], ["", "Todos"]) },
            { clave: "expediente", etiqueta: "Expediente", defecto: "", opciones: opcionesSiNo(["", "Todos"], ["incompleto", "Solo incompletos"], ["completo", "Solo completos"]) }
        ];
    },
    async filas({ repo, filtros, hoy }) {
        return (await repo.empleados()).map(e => {
            const { pct, faltan } = A.completitudExpediente(e);
            return {
                codigo: e.codigo_empleado, nombre: U.nombreCompleto(e), puesto: e.puesto || "—", dpi: e.dpi || "", nit: e.nit ?? "",
                direccion: e.direccion || "", fecha_nacimiento: U.aISO(e.fecha_nacimiento), edad: edad(e.fecha_nacimiento, hoy),
                fecha_contratacion: U.aISO(e.fecha_contratacion), salario_base: e.salario_base,
                completitud: pct,
                faltantes: faltan.join(", "), estado: e.activo ? "Activo" : "Inactivo"
            };
        }).filter(f => (!filtros.estado || f.estado === filtros.estado)
            && (filtros.expediente !== "incompleto" || f.completitud < 100) && (filtros.expediente !== "completo" || f.completitud === 100));
    }
};

const empleados_permisos = {
    clave: "empleados_permisos", modulo: "Empleados", acceso: "Empleados", icono: "calendario",
    titulo: "Empleados", subtitulo: "Permisos y ausencias",
    descripcion: "Permisos solicitados por el personal con su tipo, fechas, duración y estado de aprobación.",
    conPeriodo: false,
    columnas: [
        { campo: "empleado", titulo: "Empleado" }, { campo: "tipo", titulo: "Tipo de permiso" }, { campo: "desde", titulo: "Desde", tipo: "fecha" },
        { campo: "hasta", titulo: "Hasta", tipo: "fecha" }, { campo: "dias", titulo: "Días", tipo: "entero" }, { campo: "motivo", titulo: "Motivo" },
        { campo: "estado", titulo: "Estado", tipo: "estado" }
    ],
    async filtros() {
        return [{ clave: "estado", etiqueta: "Estado", defecto: "", opciones: opcionesSiNo(["", "Todos"], ["pendiente", "Pendientes"], ["aprobado", "Aprobados"], ["rechazado", "Rechazados"]) }];
    },
    async filas({ repo, filtros }) {
        const porCodigo = new Map((await repo.empleados()).map(e => [e.codigo_empleado, e]));
        const texto = b => b === null || b === undefined ? "pendiente" : b ? "aprobado" : "rechazado";
        return (await repo.permisos()).map(p => {
            const e = porCodigo.get(p.id_empleado);
            const d = U.aISO(p.desde), h = U.aISO(p.hasta);
            return {
                empleado: e ? U.nombreCompleto(e) : `Empleado ${p.id_empleado}`, tipo: p.tipo_nombre || "—", desde: d, hasta: h,
                dias: d && h ? U.diasEntre(d, h) + 1 : null, motivo: p.motivo || "", estado: texto(p.estado)
            };
        }).filter(f => !filtros.estado || f.estado === filtros.estado);
    }
};

/* ---------------------------------------------------------- INVENTARIO */
const inventario_existencias = {
    clave: "inventario_existencias", modulo: "Inventario", acceso: "Inventario", icono: "caja",
    titulo: "Inventario", subtitulo: "Existencias y alertas",
    descripcion: "Existencias de cada recurso con su disponibilidad, mínimo, valor documentado y alerta de stock.",
    conPeriodo: false,
    columnas: [
        { campo: "codigo", titulo: "Código" }, { campo: "recurso", titulo: "Recurso" }, { campo: "categoria", titulo: "Categoría" },
        { campo: "total", titulo: "Total", tipo: "entero" }, { campo: "disponible", titulo: "Disponible", tipo: "entero" },
        { campo: "asignado", titulo: "Asignado", tipo: "entero" }, { campo: "minimo", titulo: "Mínimo", tipo: "entero" },
        { campo: "estado_fisico", titulo: "Estado físico" }, { campo: "costo_unitario", titulo: "Costo unitario", tipo: "moneda" },
        { campo: "valor", titulo: "Valor total", tipo: "moneda" }, { campo: "alerta", titulo: "Alerta", tipo: "estado" }
    ],
    totales: ["total", "disponible", "asignado", "valor"],
    async filtros({ repo }) {
        const cats = await repo.categorias();
        return [
            { clave: "categoria", etiqueta: "Categoría", defecto: "", opciones: [{ valor: "", etiqueta: "Todas las categorías" }, ...cats.map(c => ({ valor: c.nombre, etiqueta: c.nombre }))] },
            { clave: "alerta", etiqueta: "Alerta", defecto: "", opciones: opcionesSiNo(["", "Todas"], ["Agotado", "Agotados"], ["Stock bajo", "Stock bajo"], ["Disponible", "Disponibles"]) }
        ];
    },
    async filas({ repo, filtros }) {
        return (await repo.recursos()).map(r => ({
            codigo: r.codigo, recurso: r.nombre, categoria: r.categoria, total: Number(r.cantidad_total) || 0,
            disponible: Number(r.cantidad_disponible) || 0, asignado: Math.max(0, (Number(r.cantidad_total) || 0) - (Number(r.cantidad_disponible) || 0)),
            minimo: Number(r.cantidad_minima) || 0, estado_fisico: r.estado_fisico || "", costo_unitario: r.costo_unitario,
            valor: r.costo_unitario === null || r.costo_unitario === undefined ? null : U.redondear2((Number(r.cantidad_total) || 0) * r.costo_unitario),
            alerta: A.estadoStock(r)
        })).filter(f => (!filtros.categoria || f.categoria === filtros.categoria) && (!filtros.alerta || f.alerta === filtros.alerta));
    }
};

const inventario_movimientos = {
    clave: "inventario_movimientos", modulo: "Inventario", acceso: "Inventario", icono: "camion",
    titulo: "Inventario", subtitulo: "Movimientos, pérdidas y devoluciones",
    descripcion: "Entradas, entregas, devoluciones y ajustes del período, con la condición en que regresó cada recurso.",
    conPeriodo: true,
    columnas: [
        { campo: "fecha", titulo: "Fecha", tipo: "fecha" }, { campo: "tipo", titulo: "Movimiento", tipo: "estado" }, { campo: "recurso", titulo: "Recurso" },
        { campo: "categoria", titulo: "Categoría" }, { campo: "cantidad", titulo: "Cantidad", tipo: "entero" }, { campo: "empleado", titulo: "Empleado" },
        { campo: "condicion", titulo: "Condición", tipo: "estado" }, { campo: "origen", titulo: "Origen" }, { campo: "responsable", titulo: "Registró" },
        { campo: "observacion", titulo: "Observación" }
    ],
    totales: ["cantidad"],
    async filtros() {
        return [{ clave: "tipo", etiqueta: "Movimiento", defecto: "", opciones: opcionesSiNo(["", "Todos"], ["Entrada", "Entradas"], ["Entrega", "Entregas"], ["Devolución", "Devoluciones"], ["Ajuste", "Ajustes"], ["Pérdidas y daños", "Pérdidas y daños"]) }];
    },
    async filas({ repo, periodo, filtros }) {
        const r = U.rangoPeriodo(periodo);
        return (await repo.movimientos(r)).map(m => ({
            fecha: U.aISO(m.fecha), tipo: m.tipo, recurso: `${m.recurso_codigo} · ${m.recurso_nombre}`, categoria: m.categoria || "",
            cantidad: Number(m.cantidad) || 0, empleado: m.id_empleado ? U.nombreCompleto({ nombre: m.empleado_nombre, apellido: m.empleado_apellido }) : "",
            condicion: m.condicion || "", origen: m.origen || "", responsable: U.nombreCompleto({ nombre: m.responsable_nombre, apellido: m.responsable_apellido }),
            observacion: m.observacion || "", _perdida: A.esPerdida(m)
        })).filter(f => !filtros.tipo || (filtros.tipo === "Pérdidas y daños" ? f._perdida : f.tipo === filtros.tipo))
            .map(({ _perdida, ...resto }) => resto);
    }
};

const inventario_entregas_pendientes = {
    clave: "inventario_entregas_pendientes", modulo: "Inventario", acceso: "Inventario", icono: "reloj",
    titulo: "Inventario", subtitulo: "Entregas sin devolver",
    descripcion: "Herramienta y equipo que está en manos del personal, con los días de retraso de cada devolución.",
    conPeriodo: false,
    columnas: [
        { campo: "empleado", titulo: "Empleado" }, { campo: "recurso", titulo: "Recurso" }, { campo: "cantidad", titulo: "Cantidad", tipo: "entero" },
        { campo: "fecha_entrega", titulo: "Entregado", tipo: "fecha" }, { campo: "fecha_prevista", titulo: "Devolución prevista", tipo: "fecha" },
        { campo: "dias_retraso", titulo: "Días de retraso", tipo: "entero" }, { campo: "estado", titulo: "Estado", tipo: "estado" }
    ],
    totales: ["cantidad"],
    async filtros() {
        return [{ clave: "estado", etiqueta: "Estado", defecto: "", opciones: opcionesSiNo(["", "Todos"], ["Vencida", "Vencidas"], ["En plazo", "En plazo"], ["Sin fecha", "Sin fecha prevista"]) }];
    },
    async filas({ repo, filtros, hoy, params }) {
        return (await repo.entregasPendientes()).map(e => {
            const prevista = U.aISO(e.fecha_devolucion_prevista);
            const retraso = prevista ? Math.max(0, U.diasEntre(prevista, hoy)) : null;
            return {
                empleado: U.nombreCompleto({ nombre: e.empleado_nombre, apellido: e.empleado_apellido }) || "—",
                recurso: `${e.recurso_codigo} · ${e.recurso_nombre}`, cantidad: Number(e.cantidad) || 0, fecha_entrega: U.aISO(e.fecha_entrega),
                fecha_prevista: prevista, dias_retraso: retraso,
                estado: !prevista ? "Sin fecha" : A.entregaVencida(e, hoy, params.dias_gracia_devolucion) ? "Vencida" : "En plazo"
            };
        }).filter(f => !filtros.estado || f.estado === filtros.estado)
            .sort((a, b) => (b.dias_retraso || 0) - (a.dias_retraso || 0));
    }
};

/* ---------------------------------------------------------- NÓMINAS */
const NOMBRE_TIPO_NOMINA = { TECNICO_SOCIO: "Técnico socio", TECNICO_NO_SOCIO: "Técnico no socio", ADMINISTRATIVA: "Planilla administrativa" };

const nominas_planilla = {
    clave: "nominas_planilla", modulo: "Nóminas", acceso: "Nóminas", icono: "documento",
    titulo: "Nóminas", subtitulo: "Planilla mensual",
    descripcion: "Todas las nóminas del período con su estado, ingresos, descuentos y líquido a recibir.",
    conPeriodo: true,
    columnas: [
        { campo: "empleado", titulo: "Empleado" }, { campo: "tipo", titulo: "Tipo de nómina" }, { campo: "estado", titulo: "Estado", tipo: "estado" },
        { campo: "recibo", titulo: "Recibo", tipo: "entero" }, { campo: "bruto", titulo: "Ingresos", tipo: "moneda" },
        { campo: "bonificaciones", titulo: "Bonificaciones", tipo: "moneda" }, { campo: "descuentos", titulo: "Descuentos", tipo: "moneda" },
        { campo: "liquido", titulo: "Líquido", tipo: "moneda" }, { campo: "fecha_aprobacion", titulo: "Aprobada", tipo: "fechahora" }
    ],
    totales: ["bruto", "bonificaciones", "descuentos", "liquido"],
    async filtros({ repo }) {
        return [
            { clave: "estado", etiqueta: "Estado", defecto: "", opciones: opcionesSiNo(["", "Todos los estados"], ["APROBADA", "Aprobadas"], ["PENDIENTE_APROBACION", "En revisión"], ["EN_PREPARACION", "En preparación"]) },
            { clave: "tipo", etiqueta: "Tipo", defecto: "", opciones: await CAT.opcionesTipoNomina(repo) }
        ];
    },
    async filas({ repo, periodo, filtros }) {
        return (await repo.nominas({ desdePeriodo: periodo, hastaPeriodo: periodo }))
            .filter(n => (!filtros.estado || n.estado === filtros.estado) && (!filtros.tipo || n.tipo === filtros.tipo))
            .map(n => {
                const m = n.estado === "APROBADA" ? A.montosNomina(n) : { bruto: null, bonificaciones: null, descuentos: null, liquido: null };
                return {
                    empleado: n.empleado_nombre || (n.snapshot && n.snapshot.empleado && n.snapshot.empleado.nombre) || "Sin empleado asignado",
                    tipo: NOMBRE_TIPO_NOMINA[n.tipo] || n.tipo, estado: A.ESTADO_NOMINA[n.estado] || n.estado, recibo: n.numero_recibo || null,
                    ...m, fecha_aprobacion: U.aISOHora(n.fecha_aprobacion)
                };
            });
    }
};

const nominas_historial = {
    clave: "nominas_historial", modulo: "Nóminas", acceso: "Nóminas", icono: "tarjeta",
    titulo: "Nóminas", subtitulo: "Historial de pagos",
    descripcion: "Comprobantes aprobados de los últimos meses, con el recibo, el líquido y quién aprobó cada uno.",
    conPeriodo: true,
    columnas: [
        { campo: "periodo", titulo: "Período" }, { campo: "recibo", titulo: "Recibo", tipo: "entero" }, { campo: "empleado", titulo: "Empleado" },
        { campo: "tipo", titulo: "Tipo de nómina" }, { campo: "bruto", titulo: "Ingresos", tipo: "moneda" }, { campo: "descuentos", titulo: "Descuentos", tipo: "moneda" },
        { campo: "liquido", titulo: "Líquido", tipo: "moneda" }, { campo: "forma_pago", titulo: "Forma de pago" },
        { campo: "fecha_aprobacion", titulo: "Aprobada", tipo: "fechahora" }, { campo: "aprobado_por", titulo: "Aprobó" }
    ],
    totales: ["bruto", "descuentos", "liquido"],
    async filtros({ repo }) {
        return [
            { clave: "meses", etiqueta: "Rango", defecto: "12", opciones: opcionesSiNo(["1", "Solo el período"], ["3", "Últimos 3 meses"], ["6", "Últimos 6 meses"], ["12", "Últimos 12 meses"], ["24", "Últimos 24 meses"]) },
            { clave: "tipo", etiqueta: "Tipo", defecto: "", opciones: await CAT.opcionesTipoNomina(repo) }
        ];
    },
    async filas({ repo, periodo, filtros }) {
        const meses = Math.max(1, Math.min(60, Number(filtros.meses) || 12));
        return (await repo.nominas({ desdePeriodo: U.sumarMeses(periodo, -(meses - 1)), hastaPeriodo: periodo }))
            .filter(n => n.estado === "APROBADA" && (!filtros.tipo || n.tipo === filtros.tipo))
            .map(n => {
                const m = A.montosNomina(n);
                const s = n.snapshot || {};
                return {
                    periodo: n.periodo, recibo: n.numero_recibo || null,
                    empleado: n.empleado_nombre || (s.empleado && s.empleado.nombre) || "—", tipo: NOMBRE_TIPO_NOMINA[n.tipo] || n.tipo,
                    bruto: m.bruto, descuentos: m.descuentos, liquido: m.liquido, forma_pago: (s.pago && s.pago.forma_pago) || "",
                    fecha_aprobacion: U.aISOHora(n.fecha_aprobacion), aprobado_por: s.aprobadoPor || ""
                };
            });
    }
};

const REPORTES = [
    empleados_activos, expedientes_laborales, empleados_permisos,
    inventario_existencias, inventario_movimientos, inventario_entregas_pendientes,
    nominas_planilla, nominas_historial
];

const porClave = Object.fromEntries(REPORTES.map(r => [r.clave, r]));

module.exports = { REPORTES, porClave };
