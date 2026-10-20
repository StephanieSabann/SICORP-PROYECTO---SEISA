/* ============================================================
   SICORP — SEISA · Reglas del módulo de NÓMINAS
   ------------------------------------------------------------
   ÚNICO lugar donde viven tasas, precios y montos por defecto.
   Ningún componente (frontend o backend) debe tener estos números
   escritos a mano: todos los leen de aquí.

   - Montos en CENTAVOS (enteros) para no tener errores de
     redondeo: Q 25.00 = 2500.
   - Tasas en PUNTOS BÁSICOS: 12 % = 1200, 4.83 % = 483.

   Cada tipo de nómina tiene su propia "estrategia". El técnico NO
   socio arranca como copia del socio, pero es un objeto aparte:
   para cambiar sus porcentajes, precios o cargos basta con editar
   TECNICO_NO_SOCIO más abajo, sin tocar al socio.
   ============================================================ */

/* Orden oficial de actividades EEGSA (siempre se muestran así).
   Las actividades nuevas que traiga el Excel se agregan al final. */
const ACTIVIDADES_OFICIALES = [
    "INSPECCIÓN",
    "INSPECCIÓN ARO TAPADO",
    "ORDEN NO EJECUTADA",
    "RETIRO DE ACOMETIDA",
    "RETIRO DE MEDIDOR",
    "RETIRO Y COLOCACIÓN DE MEDIDOR",
    "RETIRO Y COLOCACIÓN DE MEDIDOR CON ARO TAPADO",
    "VISITA",
    "PRUEBAS DE EXACTITUD DE MEDIDOR",
    "RETIRO Y COLOCACIÓN DE MEDIDOR AMI",
    "HABILITACIÓN USUARIO ATP"
];

/* Precio por actividad: "produccion" = lo que se paga por la orden
   (paso 3, Producción SEISA) y "bono" = bono de producción del
   técnico (paso 4). null = precio pendiente. */
function preciosBase(produccion, bono) {
    const precios = {};
    ACTIVIDADES_OFICIALES.forEach(a => { precios[a] = { produccion, bono }; });
    precios["ORDEN NO EJECUTADA"] = { produccion: 0, bono: 0 };
    return precios;
}

const TECNICO_SOCIO = {
    clave: "TECNICO_SOCIO",
    nombre: "Técnico socio",
    descripcion: "Nómina basada en la producción reportada por EEGSA y las condiciones aplicables a socios.",
    requiereEEGSA: true,
    pasos: ["Importar EEGSA", "Validar datos", "Producción SEISA", "Calcular nómina", "Aprobar", "Comprobantes"],
    tasas: {
        iva_bp: 1200,              // IVA incluido en la producción (12 %)
        retencion_isr_bp: 700,     // Retención ISR sobre producción sin IVA (7 %)
        aporte_seisa_bp: 1000,     // Aporte para el funcionamiento de SEISA (10 %)
        flotilla_bp: 500           // Aporte para renovación de flotilla (5 %)
    },
    mantenimiento_vehiculos: 0,    // monto fijo (editable en "Calcular nómina")
    precios: preciosBase(2500, 500),
    /* "Descuentos SEISA": cargos que SEISA cubre con la producción del
       técnico. El primero sale del cálculo; los demás son montos fijos
       editables con el lápiz. */
    cargosSeisa: [
        { clave: "sueldo_completo", nombre: "Sueldo de auxiliar y técnico completo", origen: "produccion_sin_iva" },
        { clave: "bono_extra", nombre: "Bono extra para técnico y auxiliar", monto: 0 },
        { clave: "cuota_patronal_tecnico", nombre: "Cuota patronal IGSS, IRTRA, INTECAP Técnico", monto: 50707 },
        { clave: "cuota_patronal_auxiliar", nombre: "Cuota patronal IGSS, IRTRA, INTECAP Auxiliar", monto: 50707 },
        { clave: "bono14", nombre: "Bono 14 Técnico/Auxiliar", monto: 66705 },
        { clave: "vacaciones", nombre: "Vacaciones Técnico/Auxiliar", monto: 66705 },
        { clave: "aguinaldo", nombre: "Aguinaldo Técnico/Auxiliar", monto: 66705 },
        { clave: "gps", nombre: "GPS", monto: 15800 },
        { clave: "seguro_vehiculos", nombre: "Seguro de vehículos (Aseguradora General)", monto: 36064 },
        { clave: "combustible", nombre: "Combustibles Shell (mes actual)", monto: 0 }
    ],
    /* Salario del mes sugerido = Sueldo completo − suma de los demás
       cargos SEISA. Siempre se puede reemplazar con el lápiz.
       Opciones: "sueldo_completo_menos_cargos" | "manual" (arranca en 0). */
    salario: { formula: "sueldo_completo_menos_cargos" },
    descuentosTrabajador: [
        { clave: "penalizaciones_eegsa", nombre: "Penalizaciones EEGSA", monto: 0 },
        { clave: "penalizaciones_seisa", nombre: "Penalizaciones SEISA", monto: 0 },
        { clave: "isr", nombre: "ISR", monto: 0, conMes: true }
    ]
};

/* Por ahora igual al socio — sus reglas propias se definen aquí. */
const TECNICO_NO_SOCIO = {
    ...JSON.parse(JSON.stringify(TECNICO_SOCIO)),
    clave: "TECNICO_NO_SOCIO",
    nombre: "Técnico no socio",
    descripcion: "Nómina basada en producción EEGSA y las condiciones del técnico contratado."
};

const ADMINISTRATIVA = {
    clave: "ADMINISTRATIVA",
    nombre: "Planilla administrativa",
    subtitulo: "Auxiliares y personal administrativo",
    descripcion: "Salario base, bonificación y descuentos. No utiliza producción de EEGSA.",
    requiereEEGSA: false,
    pasos: ["Preparar planilla", "Aprobar", "Comprobante"],
    tasas: {
        igss_laboral_bp: 483       // Cuota laboral IGSS (4.83 % del salario base)
    },
    bonificacion_ley: 25000        // Bonificación incentivo (Decreto 78-89) por defecto
};

const TIPOS = { TECNICO_SOCIO, TECNICO_NO_SOCIO, ADMINISTRATIVA };

const EMPRESA = {
    nombre: "SEISA",
    nombreLegal: "Sistemas Eléctricos Integrados, S.A.",
    sistema: "SICORP — SEISA",
    formaPagoDefecto: "Pago en línea"
};

const ARCHIVO = {
    extensiones: [".xlsx", ".xls"],
    tamanoMaximo: 10 * 1024 * 1024
};

module.exports = { TIPOS, ACTIVIDADES_OFICIALES, EMPRESA, ARCHIVO };
