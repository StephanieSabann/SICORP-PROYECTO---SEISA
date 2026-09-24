const model = require("../modelos/empleados.model");

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
            activo
        } = req.body;

        const idPuesto = Number(id_puesto);

        if (!Number.isInteger(idPuesto) || idPuesto <= 0) {
            throw new Error("El id_puesto debe ser un número entero positivo.");
        }

        const emailLimpio = validarTexto(email, "El email", 60);

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)) {
            throw new Error("El email no es válido.");
        }

        const empleadoCreado = await model.crear({
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
            activo: validarActivo(activo)
        });

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
            "activo"
        ];

        const camposEnviados = camposPermitidos.filter(campo =>
            Object.prototype.hasOwnProperty.call(req.body, campo)
        );

        if (camposEnviados.length === 0) {
            throw new Error("Debes especificar al menos un campo para editar.");
        }

        const datos = {};

        for (const campo of camposEnviados) {
            if (campo === "id_puesto") {
                const idPuesto = Number(req.body.id_puesto);

                if (!Number.isInteger(idPuesto) || idPuesto <= 0) {
                    throw new Error("El id_puesto debe ser un número entero positivo.");
                }

                datos.id_puesto = idPuesto;
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
            }
        }

        const empleadoActualizado = await model.actualizar(codigoEmpleado, datos);

        if (!empleadoActualizado) {
            return res.status(404).json({
                exito: false,
                mensaje: "El empleado no existe."
            });
        }

        res.status(200).json({
            exito: true,
            mensaje: "Empleado actualizado correctamente.",
            datos: empleadoActualizado
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
    crear,
    actualizar
};