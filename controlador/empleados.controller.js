const model = require("../modelos/empleados.model");
const puestosModel = require("../modelos/puestos.model");
const { normalizarCodigoUnidad } = require("../utilidades/codigoUnidad");

function validarTexto(valor, campo, maximo, obligatorio = true) {
    if (valor === undefined || valor === null) {
        if (obligatorio) {
            throw new Error(`${campo} es obligatorio.`);
        }

        return null;
    }

    if (typeof valor !== "string") {
        throw new Error(`${campo} debe ser texto.`);
    }

    const texto = valor.trim();

    if (obligatorio && texto.length === 0) {
        throw new Error(`${campo} es obligatorio.`);
    }

    if (texto.length > maximo) {
        throw new Error(`${campo} no puede superar los ${maximo} caracteres.`);
    }

    return texto || null;
}

function validarFecha(valor, etiqueta = "") {
    if (valor === undefined || valor === null || valor === "") {
        return null;
    }

    if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        throw new Error(`La fecha ${etiqueta} debe tener el formato AAAA-MM-DD.`.replace("  ", " "));
    }

    const fecha = new Date(`${valor}T00:00:00Z`);

    if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
        throw new Error(`La fecha ${etiqueta} no es válida.`.replace("  ", " "));
    }

    return valor;
}

function validarNit(valor) {
    if (valor === undefined || valor === null || valor === "") {
        return null;
    }

    const numero = Number(valor);

    if (!Number.isInteger(numero) || numero < 0) {
        throw new Error("El NIT debe ser un número entero (sin guiones ni letras).");
    }

    return numero;
}

const TIPOS_EMPLEADO = ["TECNICO_SOCIO", "TECNICO_NO_SOCIO", "AUXILIAR", "ADMINISTRATIVO"];
/* Puesto de respaldo para cada tipo. Solo se usa cuando la pantalla
   NO manda un id_puesto (por ejemplo una llamada vieja a la API).
   Si manda id_puesto, se respeta el que escogió la persona. */
const PUESTO_POR_TIPO = { TECNICO_SOCIO: 2, TECNICO_NO_SOCIO: 2, AUXILIAR: 3, ADMINISTRATIVO: 1 };

function validarTipoEmpleado(valor) {
    if (valor === undefined || valor === null || valor === "") {
        return null;
    }

    const tipo = String(valor).trim().toUpperCase();

    if (!TIPOS_EMPLEADO.includes(tipo)) {
        throw new Error("El tipo de empleado debe ser Técnico socio, Técnico no socio, Auxiliar o Administrativo.");
    }

    return tipo;
}

function validarSalario(valor) {
    if (valor === undefined || valor === null || valor === "") {
        return null;
    }

    const numero = Number(String(valor).replace(/[,\sQq]/g, ""));

    if (!Number.isFinite(numero) || numero < 0 || numero > 9999999999) {
        throw new Error("El sueldo base debe ser un número mayor o igual a 0.");
    }

    return Math.round(numero * 100) / 100;
}

function validarActivo(valor) {
    if (valor === undefined || valor === null) {
        return 1;
    }

    if (valor === true || valor === 1 || valor === "1") {
        return 1;
    }

    if (valor === false || valor === 0 || valor === "0") {
        return 0;
    }

    throw new Error("activo debe ser un booleano o tener el valor 0 o 1.");
}

/* La unidad (cuadrilla) es opcional: los administrativos no llevan.
   Se acepta "" o null para dejar al empleado sin unidad. */
function validarUnidad(valor) {
    if (valor === undefined || valor === null || valor === "") {
        return null;
    }

    const numero = Number(valor);

    if (!Number.isInteger(numero) || numero <= 0) {
        throw new Error("La unidad seleccionada no es válida.");
    }

    return numero;
}

/* El formato del código de unidad (SI-01 ... SI-99) vive en
   utilidades/codigoUnidad.js, para que este módulo y el de
   Mantenimiento usen exactamente la misma regla. */
const validarCodigoUnidad = normalizarCodigoUnidad;

/* Convierte lo que haya mandado la pantalla en un id_unidad:
   - unidad_codigo : texto escrito; si la unidad no existe, se crea.
   - id_unidad     : id directo (se sigue aceptando por compatibilidad).
   Devuelve { cambiar, idUnidad }. */
async function resolverUnidad(cuerpo) {
    if (Object.prototype.hasOwnProperty.call(cuerpo, "unidad_codigo")) {
        const codigo = validarCodigoUnidad(cuerpo.unidad_codigo);

        if (codigo === null) {
            return { cambiar: true, idUnidad: null };
        }

        return { cambiar: true, idUnidad: await model.resolverUnidadPorCodigo(codigo) };
    }

    if (Object.prototype.hasOwnProperty.call(cuerpo, "id_unidad")) {
        return { cambiar: true, idUnidad: validarUnidad(cuerpo.id_unidad) };
    }

    return { cambiar: false, idUnidad: null };
}

/* Comprueba que el puesto exista de verdad en el catálogo. Sin esto,
   un id inventado reventaría con el error crudo de llave foránea de
   SQL Server, que no le dice nada a quien usa el sistema. */
async function validarPuesto(valor) {
    const numero = Number(valor);

    if (!Number.isInteger(numero) || numero <= 0) {
        throw new Error("El id_puesto debe ser un número entero positivo.");
    }

    const puesto = await puestosModel.obtenerPorId(numero);

    if (!puesto) {
        throw new Error("El puesto seleccionado ya no existe en el catálogo. Actualiza la página y vuelve a escogerlo.");
    }

    return numero;
}

/* ============================================================
   Historial: qué campos se vigilan y cómo se escriben
   ------------------------------------------------------------
   Se comparan los datos ya "armados" (los que devuelve la API,
   con el nombre del puesto y el código de la unidad), para que
   el historial quede legible: "Puesto: Inspector → Supervisor
   de unidad" en vez de "id_puesto: 2 → 7".
   ============================================================ */
const ETIQUETAS_HISTORIAL = {
    nombre: "Nombre",
    apellido: "Apellido",
    dpi: "DPI",
    nit: "NIT",
    direccion: "Dirección",
    telefono: "Teléfono",
    email: "Correo electrónico",
    fecha_contratacion: "Fecha de ingreso",
    fecha_nacimiento: "Fecha de nacimiento",
    activo: "Estado",
    tipo_empleado: "Tipo de empleado",
    salario_base: "Salario base",
    puesto: "Puesto",
    unidad: "Unidad"
};

const NOMBRES_TIPO = {
    TECNICO_SOCIO: "Técnico socio",
    TECNICO_NO_SOCIO: "Técnico no socio",
    AUXILIAR: "Auxiliar",
    ADMINISTRATIVO: "Administrativo"
};

function comoTexto(campo, valor) {
    if (valor === null || valor === undefined || valor === "") {
        return campo === "unidad" ? "Sin unidad" : "";
    }

    if (campo === "activo") {
        return Number(valor) === 1 || valor === true ? "Activo" : "Inactivo";
    }

    if (campo === "salario_base") {
        return `Q ${Number(valor).toFixed(2)}`;
    }

    if (campo === "tipo_empleado") {
        return NOMBRES_TIPO[valor] || String(valor);
    }

    if (campo === "fecha_contratacion" || campo === "fecha_nacimiento") {
        /* mssql devuelve las fechas como objeto Date; se recorta a
           AAAA-MM-DD para que el historial no muestre la hora. */
        if (valor instanceof Date) {
            return valor.toISOString().slice(0, 10);
        }

        return String(valor).slice(0, 10);
    }

    return String(valor);
}

function compararCambios(antes, despues) {
    const movimientos = [];

    for (const campo of Object.keys(ETIQUETAS_HISTORIAL)) {
        const anterior = comoTexto(campo, antes ? antes[campo] : null);
        const nuevo = comoTexto(campo, despues ? despues[campo] : null);

        if (anterior !== nuevo) {
            movimientos.push({
                campo: ETIQUETAS_HISTORIAL[campo],
                valor_anterior: anterior,
                valor_nuevo: nuevo
            });
        }
    }

    return movimientos;
}

function quienEs(req) {
    const sesion = req.session || {};

    return {
        id_credencial: sesion.id_credencial ?? null,
        usuario: sesion.nombreCompleto || sesion.usuario || null
    };
}

/* El historial es un registro de apoyo: si falla al guardarse NO se
   tumba la operación principal, porque el empleado ya se guardó bien.
   Se deja constancia en la consola del servidor. */
async function anotarHistorial(req, codigoEmpleado, accion, movimientos) {
    if (!movimientos || movimientos.length === 0) {
        return;
    }

    const { id_credencial, usuario } = quienEs(req);

    try {
        await model.registrarHistorial(movimientos.map(movimiento => ({
            codigo_empleado: codigoEmpleado,
            accion,
            campo: movimiento.campo,
            valor_anterior: movimiento.valor_anterior,
            valor_nuevo: movimiento.valor_nuevo,
            id_credencial,
            usuario
        })));
    } catch (error) {
        console.error(
            "[Empleados] El empleado se guardó, pero no se pudo escribir el historial:",
            error.message,
            "\n→ Si dice \"Invalid object name\", corre basededatos/empleados.sql en la base Seisa."
        );
    }
}

async function obtenerTodos(req, res) {
    try {
        const empleados = await model.obtenerTodos();

        res.status(200).json({
            exito: true,
            datos: empleados
        });

    } catch (error) {
        console.error("Error al obtener los empleados:", error);

        res.status(500).json({
            exito: false,
            mensaje: "Error al obtener los empleados."
        });
    }
}

async function obtenerPorCodigo(req, res) {
    try {
        const codigoEmpleado = Number(req.params.codigo);

        if (!Number.isInteger(codigoEmpleado) || codigoEmpleado <= 0) {
            return res.status(400).json({
                exito: false,
                mensaje: "El código de empleado no es válido."
            });
        }

        const empleado = await model.obtenerPorCodigo(codigoEmpleado);

        if (!empleado) {
            return res.status(404).json({
                exito: false,
                mensaje: "El empleado no existe."
            });
        }

        res.status(200).json({
            exito: true,
            datos: empleado
        });
    } catch (error) {
        console.error("Error al obtener el empleado:", error);

        res.status(500).json({
            exito: false,
            mensaje: "Error al obtener el empleado."
        });
    }
}

async function obtenerHistorial(req, res) {
    try {
        const codigoEmpleado = Number(req.params.codigo);

        if (!Number.isInteger(codigoEmpleado) || codigoEmpleado <= 0) {
            return res.status(400).json({
                exito: false,
                mensaje: "El código de empleado no es válido."
            });
        }

        const historial = await model.obtenerHistorial(codigoEmpleado);

        res.status(200).json({
            exito: true,
            datos: historial
        });
    } catch (error) {
        console.error("Error al obtener el historial del empleado:", error);

        res.status(500).json({
            exito: false,
            mensaje: "No se pudo obtener el historial. Si es la primera vez, corre basededatos/empleados.sql en la base."
        });
    }
}

async function crear(req, res) {
    try {
        const {
            id_puesto,
            nombre,
            apellido,
            dpi,
            nit,
            direccion,
            telefono,
            email,
            fecha_contratacion,
            fecha_nacimiento,
            activo,
            tipo_empleado,
            salario_base
        } = req.body;

        const tipoEmpleado = validarTipoEmpleado(tipo_empleado);

        /* El puesto que escogió la persona manda. Solo si la pantalla
           no mandó ninguno se deduce del tipo de empleado. */
        const vinoPuesto = id_puesto !== undefined && id_puesto !== null && id_puesto !== "";
        const idPuesto = vinoPuesto
            ? await validarPuesto(id_puesto)
            : await validarPuesto(PUESTO_POR_TIPO[tipoEmpleado]);

        const { idUnidad } = await resolverUnidad(req.body);
        const emailLimpio = validarTexto(email, "El email", 60);

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)) {
            throw new Error("El email no es válido.");
        }

        const codigoEmpleado = await model.crear({
            id_puesto: idPuesto,
            nombre: validarTexto(nombre, "El nombre", 50),
            apellido: validarTexto(apellido, "El apellido", 50),
            dpi: validarTexto(dpi, "El DPI", 13),
            nit: validarNit(nit),
            direccion: validarTexto(direccion, "La dirección", 100, false),
            telefono: validarTexto(telefono, "El teléfono", 20, false),
            email: emailLimpio,
            fecha_contratacion: validarFecha(fecha_contratacion, "de contratación"),
            fecha_nacimiento: validarFecha(fecha_nacimiento, "de nacimiento"),
            activo: validarActivo(activo),
            tipo_empleado: tipoEmpleado,
            salario_base: validarSalario(salario_base)
        });

        if (!codigoEmpleado) {
            throw new Error("No se pudo crear el empleado.");
        }

        if (idUnidad !== null) {
            try {
                await model.asignarUnidad(codigoEmpleado, idUnidad);
            } catch (error) {
                throw new Error("El empleado se creó, pero no se pudo asignar la unidad: " + error.message);
            }
        }

        const empleadoCreado = await model.obtenerPorCodigo(codigoEmpleado);

        /* Al crear se deja constancia del alta y de los datos laborales
           con los que entró, que es lo que después se va a comparar. */
        await anotarHistorial(req, codigoEmpleado, "CREACION", [
            { campo: "Alta del empleado", valor_anterior: null, valor_nuevo: comoTexto("nombre", `${empleadoCreado.nombre} ${empleadoCreado.apellido}`.trim()) },
            { campo: ETIQUETAS_HISTORIAL.puesto, valor_anterior: null, valor_nuevo: comoTexto("puesto", empleadoCreado.puesto) },
            { campo: ETIQUETAS_HISTORIAL.unidad, valor_anterior: null, valor_nuevo: comoTexto("unidad", empleadoCreado.unidad) },
            { campo: ETIQUETAS_HISTORIAL.salario_base, valor_anterior: null, valor_nuevo: comoTexto("salario_base", empleadoCreado.salario_base) },
            { campo: ETIQUETAS_HISTORIAL.tipo_empleado, valor_anterior: null, valor_nuevo: comoTexto("tipo_empleado", empleadoCreado.tipo_empleado) }
        ]);

        res.status(201).json({
            exito: true,
            mensaje: "Empleado creado correctamente.",
            datos: empleadoCreado
        });
    } catch (error) {
        console.error("Error al crear el empleado:", error);

        res.status(400).json({
            exito: false,
            mensaje: error.message
        });
    }
}

async function actualizar(req, res) {
    try {
        const codigoEmpleado = Number(req.params.codigo);

        if (!Number.isInteger(codigoEmpleado) || codigoEmpleado <= 0) {
            throw new Error("El código de empleado no es válido.");
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "codigo_empleado")) {
            throw new Error("El código de empleado no se puede editar.");
        }

        const camposPermitidos = [
            "id_puesto",
            "nombre",
            "apellido",
            "dpi",
            "nit",
            "direccion",
            "telefono",
            "email",
            "fecha_contratacion",
            "fecha_nacimiento",
            "activo",
            "tipo_empleado",
            "salario_base",
            "id_unidad",
            "unidad_codigo"
        ];

        const camposEnviados = camposPermitidos.filter(campo =>
            Object.prototype.hasOwnProperty.call(req.body, campo)
        );

        if (camposEnviados.length === 0) {
            throw new Error("Debes especificar al menos un campo para editar.");
        }

        /* Se lee cómo estaba ANTES para poder comparar y para saber si
           el empleado existe (si no, se responde 404 sin tocar nada). */
        const antes = await model.obtenerPorCodigo(codigoEmpleado);

        if (!antes) {
            return res.status(404).json({
                exito: false,
                mensaje: "El empleado no existe."
            });
        }

        const datos = {};

        /* La unidad se resuelve aparte: no es columna de Empleado y
           puede venir como código escrito o como id. */
        const { cambiar: cambiarUnidad, idUnidad } = await resolverUnidad(req.body);

        for (const campo of camposEnviados) {
            if (campo === "id_puesto") {
                datos.id_puesto = await validarPuesto(req.body.id_puesto);
            } else if (campo === "id_unidad" || campo === "unidad_codigo") {
                /* ya se resolvió arriba */
            } else if (campo === "nombre") {
                datos.nombre = validarTexto(req.body.nombre, "El nombre", 50);
            } else if (campo === "apellido") {
                datos.apellido = validarTexto(req.body.apellido, "El apellido", 50);
            } else if (campo === "dpi") {
                datos.dpi = validarTexto(req.body.dpi, "El DPI", 13);
            } else if (campo === "nit") {
                datos.nit = validarNit(req.body.nit);
            } else if (campo === "direccion") {
                datos.direccion = validarTexto(req.body.direccion, "La dirección", 100, false);
            } else if (campo === "telefono") {
                datos.telefono = validarTexto(req.body.telefono, "El teléfono", 20, false);
            } else if (campo === "email") {
                const email = validarTexto(req.body.email, "El email", 60);

                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    throw new Error("El email no es válido.");
                }

                datos.email = email;
            } else if (campo === "fecha_contratacion") {
                datos.fecha_contratacion = validarFecha(req.body.fecha_contratacion, "de contratación");
            } else if (campo === "fecha_nacimiento") {
                datos.fecha_nacimiento = validarFecha(req.body.fecha_nacimiento, "de nacimiento");
            } else if (campo === "activo") {
                datos.activo = validarActivo(req.body.activo);
            } else if (campo === "tipo_empleado") {
                datos.tipo_empleado = validarTipoEmpleado(req.body.tipo_empleado);
            } else if (campo === "salario_base") {
                datos.salario_base = validarSalario(req.body.salario_base);
            }
        }

        /* Antes el puesto SIEMPRE se sobreescribía con el del tipo de
           empleado, y por eso el puesto escogido en la pantalla nunca
           se guardaba. Ahora solo se deduce si no mandaron puesto. */
        if (datos.tipo_empleado && datos.id_puesto === undefined) {
            datos.id_puesto = await validarPuesto(PUESTO_POR_TIPO[datos.tipo_empleado]);
        }

        const actualizado = await model.actualizar(codigoEmpleado, datos);

        if (!actualizado) {
            return res.status(404).json({
                exito: false,
                mensaje: "El empleado no existe."
            });
        }

        if (cambiarUnidad) {
            try {
                await model.asignarUnidad(codigoEmpleado, idUnidad);
            } catch (error) {
                throw new Error("Los demás datos se guardaron, pero no se pudo cambiar la unidad: " + error.message);
            }
        }

        /* Se vuelve a leer para comparar con el estado final real
           (incluida la unidad, que se guarda en su propia tabla). */
        const despues = cambiarUnidad
            ? await model.obtenerPorCodigo(codigoEmpleado)
            : actualizado;

        await anotarHistorial(req, codigoEmpleado, "EDICION", compararCambios(antes, despues));

        res.status(200).json({
            exito: true,
            mensaje: "Empleado actualizado correctamente.",
            datos: despues
        });
    } catch (error) {
        console.error("Error al actualizar el empleado:", error);

        res.status(400).json({
            exito: false,
            mensaje: error.message
        });
    }
}

module.exports = {
    obtenerTodos,
    obtenerPorCodigo,
    obtenerHistorial,
    crear,
    actualizar,
    /* Se exportan para las pruebas */
    _internos: { compararCambios, comoTexto, ETIQUETAS_HISTORIAL }
};