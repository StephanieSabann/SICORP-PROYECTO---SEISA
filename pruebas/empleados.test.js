const test = require("node:test");
const assert = require("node:assert/strict");

/* ============================================================
   Pruebas del módulo de EMPLEADOS
   ------------------------------------------------------------
   Cubren los errores que el grupo reportó:
     1. Al editar un empleado NO se guardaba el salario.
     2. El puesto escogido en la pantalla se descartaba y se
        reemplazaba por el deducido del tipo de empleado.
     3. La unidad (cuadrilla) no se guardaba en ninguna parte.
     4. No quedaba historial de los cambios.

   No hay SQL Server en el entorno de pruebas, así que el modelo
   se reemplaza por uno de mentira (un "doble") que anota con qué
   datos lo llamaron. Así se prueba toda la lógica del
   controlador: validaciones, qué se manda a la base y qué
   renglones de historial se generan.

   Lo que NO prueban: que las consultas SQL corran de verdad
   contra SQL Server. Eso hay que probarlo en la base del grupo.
   ============================================================ */

const modelo = require("../modelos/empleados.model");
const puestosModelo = require("../modelos/puestos.model");
const controlador = require("../controlador/empleados.controller");

/* Se guardan las funciones verdaderas para devolverlas al final y
   no dejar contaminadas otras pruebas que corran después. */
const originales = { ...modelo };
const originalesPuestos = { ...puestosModelo };

const PUESTOS = {
    1: { id_puesto: 1, nombre: "Administrativo" },
    2: { id_puesto: 2, nombre: "Técnico" },
    3: { id_puesto: 3, nombre: "Auxiliar" },
    7: { id_puesto: 7, nombre: "Inspector" },
    8: { id_puesto: 8, nombre: "Supervisor de unidad" }
};

/* Empleado de ejemplo tal y como lo devuelve la API después del
   arreglo (ya con puesto y unidad incluidos). */
function empleadoBase(cambios = {}) {
    return {
        codigo_empleado: 15,
        id_puesto: 7,
        puesto: "Inspector",
        nombre: "Stephanie",
        apellido: "Sabán",
        dpi: "2985641120101",
        nit: 1234567,
        direccion: "Zona 5, Villa Nueva",
        telefono: "55512345",
        email: "stephanie@seisa.com",
        fecha_contratacion: "2024-03-01",
        activo: 1,
        fecha_nacimiento: "1999-05-10",
        tipo_empleado: "TECNICO_SOCIO",
        salario_base: 3500,
        id_unidad: 4,
        unidad: "SI-01",
        ...cambios
    };
}

/* Instala el modelo de mentira. Devuelve el "registro" con todo lo
   que el controlador le pidió a la base. */
function prepararDoble(opciones = {}) {
    const registro = {
        creado: null,
        actualizado: null,
        unidadAsignada: undefined,
        codigoRecibido: undefined,
        unidadCreada: undefined,
        historial: [],
        /* Se usa "in" y no una comparación con undefined, porque el
           caso del empleado que NO existe se prueba justamente
           mandando estadoInicial: undefined. */
        estado: "estadoInicial" in opciones ? opciones.estadoInicial : empleadoBase()
    };

    puestosModelo.obtenerPorId = async id => PUESTOS[Number(id)] || undefined;

    modelo.obtenerPorCodigo = async () => registro.estado;

    modelo.crear = async datos => {
        registro.creado = datos;
        registro.estado = empleadoBase({
            codigo_empleado: 99,
            ...datos,
            puesto: PUESTOS[datos.id_puesto] ? PUESTOS[datos.id_puesto].nombre : null,
            id_unidad: null,
            unidad: null
        });
        return 99;
    };

    modelo.actualizar = async (codigo, datos) => {
        registro.actualizado = { codigo, datos };

        if (registro.estado === undefined) {
            return undefined;
        }

        registro.estado = {
            ...registro.estado,
            ...datos,
            puesto: datos.id_puesto !== undefined
                ? (PUESTOS[datos.id_puesto] ? PUESTOS[datos.id_puesto].nombre : null)
                : registro.estado.puesto
        };

        return registro.estado;
    };

    /* Unidades que "ya existen" en la base de mentira */
    const UNIDADES_EXISTENTES = { "SI-01": 4, "SI-02": 5 };

    modelo.resolverUnidadPorCodigo = async codigo => {
        registro.codigoRecibido = codigo;

        if (UNIDADES_EXISTENTES[codigo]) {
            return UNIDADES_EXISTENTES[codigo];
        }

        registro.unidadCreada = codigo;
        return 77;
    };

    modelo.asignarUnidad = async (codigo, idUnidad) => {
        if (opciones.fallaUnidad) {
            throw new Error("falla simulada de unidad");
        }

        registro.unidadAsignada = idUnidad;
        registro.estado = {
            ...registro.estado,
            id_unidad: idUnidad,
            unidad: idUnidad === null ? null : "SI-0" + idUnidad
        };
    };

    modelo.registrarHistorial = async movimientos => {
        if (opciones.fallaHistorial) {
            throw new Error("Invalid object name 'dbo.Empleado_historial'.");
        }

        registro.historial.push(...movimientos);
    };

    modelo.obtenerHistorial = async () => opciones.historialGuardado || [];

    return registro;
}

function restaurar() {
    Object.assign(modelo, originales);
    Object.assign(puestosModelo, originalesPuestos);
}

function peticion(cuerpo, parametros = {}) {
    return {
        body: cuerpo,
        params: parametros,
        session: { id_credencial: 3, usuario: "ssaban", nombreCompleto: "Stephanie Sabán" }
    };
}

function respuesta() {
    const r = {
        codigo: null,
        cuerpo: null,
        status(valor) { r.codigo = valor; return r; },
        json(valor) { r.cuerpo = valor; return r; }
    };
    return r;
}

/* Datos mínimos válidos para crear un empleado */
function cuerpoNuevo(extra = {}) {
    return {
        nombre: "Carlos",
        apellido: "Elías",
        dpi: "1234567890123",
        email: "carlos@seisa.com",
        fecha_contratacion: "2026-01-15",
        tipo_empleado: "TECNICO_SOCIO",
        salario_base: 4200,
        ...extra
    };
}

/* ============================================================
   1. EL ERROR PRINCIPAL: el salario sí llega a la base al editar
   ============================================================ */
test("al editar, el salario sí se manda a la base de datos", async t => {
    t.after(restaurar);
    const registro = prepararDoble();
    const res = respuesta();

    await controlador.actualizar(
        peticion({ salario_base: 5100.75 }, { codigo: "15" }),
        res
    );

    assert.equal(res.codigo, 200, "debería responder 200");
    assert.equal(res.cuerpo.exito, true);
    assert.equal(
        registro.actualizado.datos.salario_base,
        5100.75,
        "el salario tiene que llegar al UPDATE"
    );
});

test("el salario acepta comas y la Q que a veces se escribe", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    await controlador.actualizar(
        peticion({ salario_base: "Q 6,250.50" }, { codigo: "15" }),
        respuesta()
    );

    assert.equal(registro.actualizado.datos.salario_base, 6250.5);
});

test("un salario con letras se rechaza con mensaje claro", async t => {
    t.after(restaurar);
    prepararDoble();
    const res = respuesta();

    await controlador.actualizar(
        peticion({ salario_base: "tres mil" }, { codigo: "15" }),
        res
    );

    assert.equal(res.codigo, 400);
    assert.match(res.cuerpo.mensaje, /sueldo base/i);
});

/* ============================================================
   2. El puesto escogido se respeta (ya no lo pisa el tipo)
   ============================================================ */
test("al editar se guarda el puesto escogido, no el deducido del tipo", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    /* Caso exacto del error: se manda el tipo TECNICO_SOCIO (que
       antes forzaba id_puesto = 2) junto con el puesto 8 que escogió
       la persona. Debe quedar el 8. */
    await controlador.actualizar(
        peticion({ tipo_empleado: "TECNICO_SOCIO", id_puesto: 8 }, { codigo: "15" }),
        respuesta()
    );

    assert.equal(
        registro.actualizado.datos.id_puesto,
        8,
        "antes este valor se sobreescribía con 2 y se perdía el puesto"
    );
});

test("si no mandan puesto, se sigue deduciendo del tipo (compatibilidad)", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    await controlador.actualizar(
        peticion({ tipo_empleado: "ADMINISTRATIVO" }, { codigo: "15" }),
        respuesta()
    );

    assert.equal(registro.actualizado.datos.id_puesto, 1, "ADMINISTRATIVO = puesto 1");
});

test("al crear se guarda el puesto escogido", async t => {
    t.after(restaurar);
    const registro = prepararDoble();
    const res = respuesta();

    await controlador.crear(peticion(cuerpoNuevo({ id_puesto: 7 })), res);

    assert.equal(res.codigo, 201);
    assert.equal(registro.creado.id_puesto, 7);
});

test("un puesto que no existe se rechaza sin error crudo de SQL", async t => {
    t.after(restaurar);
    prepararDoble();
    const res = respuesta();

    await controlador.crear(peticion(cuerpoNuevo({ id_puesto: 999 })), res);

    assert.equal(res.codigo, 400);
    assert.match(res.cuerpo.mensaje, /ya no existe en el catálogo/i);
    assert.doesNotMatch(res.cuerpo.mensaje, /FOREIGN KEY|constraint/i);
});

/* ============================================================
   3. La unidad (cuadrilla) se guarda
   ============================================================ */
test("al crear, la unidad se asigna en Unidad_empleado", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    await controlador.crear(peticion(cuerpoNuevo({ id_puesto: 7, id_unidad: 4 })), respuesta());

    assert.equal(registro.unidadAsignada, 4);
});

test("al editar se puede cambiar solo la unidad, sin tocar otros datos", async t => {
    t.after(restaurar);
    const registro = prepararDoble();
    const res = respuesta();

    await controlador.actualizar(
        peticion({ id_unidad: 6 }, { codigo: "15" }),
        res
    );

    assert.equal(res.codigo, 200, "antes esto podía romper el SET del UPDATE");
    assert.equal(registro.unidadAsignada, 6);
    /* No se manda id_unidad al UPDATE de Empleado: esa columna no
       existe en esa tabla, la unidad vive en Unidad_empleado. */
    assert.equal(registro.actualizado.datos.id_unidad, undefined);
});

test("se puede dejar al empleado sin unidad (administrativo)", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    await controlador.actualizar(
        peticion({ id_unidad: null }, { codigo: "15" }),
        respuesta()
    );

    assert.equal(registro.unidadAsignada, null);
});

/* --- Unidad escrita a mano (caja de texto con sugerencias) --- */

test("si se escribe una unidad que ya existe, se conecta a ella y NO se crea otra", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    await controlador.actualizar(
        peticion({ unidad_codigo: "SI-01" }, { codigo: "15" }),
        respuesta()
    );

    assert.equal(registro.unidadAsignada, 4, "debe usar la unidad SI-01 que ya existía");
    assert.equal(registro.unidadCreada, undefined, "no debe crear una unidad repetida");
});

test("si se escribe una unidad nueva, se crea sola", async t => {
    t.after(restaurar);
    const registro = prepararDoble();
    const res = respuesta();

    await controlador.actualizar(
        peticion({ unidad_codigo: "SI-09" }, { codigo: "15" }),
        res
    );

    assert.equal(res.codigo, 200);
    assert.equal(registro.unidadCreada, "SI-09");
    assert.equal(registro.unidadAsignada, 77);
});

test("escribir 'si - 1' se convierte en SI-01 y NO crea una repetida", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    await controlador.actualizar(
        peticion({ unidad_codigo: "  si - 1  " }, { codigo: "15" }),
        respuesta()
    );

    assert.equal(registro.codigoRecibido, "SI-01", "se limpia, se sube a mayúsculas y se rellena a 2 dígitos");
    assert.equal(registro.unidadAsignada, 4);
    assert.equal(registro.unidadCreada, undefined);
});

test("dejar la unidad en blanco deja al empleado sin unidad", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    await controlador.actualizar(
        peticion({ unidad_codigo: "" }, { codigo: "15" }),
        respuesta()
    );

    assert.equal(registro.unidadAsignada, null);
    assert.equal(registro.unidadCreada, undefined);
});

test("un código que no respeta el formato SI-NN se rechaza", async t => {
    t.after(restaurar);
    prepararDoble();
    const res = respuesta();

    await controlador.actualizar(
        peticion({ unidad_codigo: "CUADRILLA-5" }, { codigo: "15" }),
        res
    );

    assert.equal(res.codigo, 400);
    assert.match(res.cuerpo.mensaje, /SI-/);
});

test("escribir solo el número (21) lo convierte en SI-21", async t => {
    t.after(restaurar);
    const registro = prepararDoble();
    const res = respuesta();

    await controlador.actualizar(
        peticion({ unidad_codigo: "21" }, { codigo: "15" }),
        res
    );

    assert.equal(res.codigo, 200);
    assert.equal(registro.codigoRecibido, "SI-21");
});

test("el número 0 no es una unidad válida", async t => {
    t.after(restaurar);
    prepararDoble();
    const res = respuesta();

    await controlador.actualizar(
        peticion({ unidad_codigo: "SI-00" }, { codigo: "15" }),
        res
    );

    assert.equal(res.codigo, 400);
    assert.match(res.cuerpo.mensaje, /1 al 99/i);
});

test("un prefijo distinto de SI- se rechaza", async t => {
    t.after(restaurar);
    prepararDoble();
    const res = respuesta();

    await controlador.actualizar(
        peticion({ unidad_codigo: "XX-05" }, { codigo: "15" }),
        res
    );

    assert.equal(res.codigo, 400);
    assert.match(res.cuerpo.mensaje, /SI-/);
});

test("al crear un empleado también se puede escribir la unidad", async t => {
    t.after(restaurar);
    const registro = prepararDoble();
    const res = respuesta();

    await controlador.crear(
        peticion(cuerpoNuevo({ id_puesto: 7, unidad_codigo: "SI-01" })),
        res
    );

    assert.equal(res.codigo, 201);
    assert.equal(registro.unidadAsignada, 4);
});

test("una unidad con valor inválido se rechaza", async t => {
    t.after(restaurar);
    prepararDoble();
    const res = respuesta();

    await controlador.actualizar(
        peticion({ id_unidad: "SI-01" }, { codigo: "15" }),
        res
    );

    assert.equal(res.codigo, 400);
    assert.match(res.cuerpo.mensaje, /unidad/i);
});

/* ============================================================
   4. Historial
   ============================================================ */
test("el historial anota el cambio de salario en forma legible", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    await controlador.actualizar(
        peticion({ salario_base: 5000 }, { codigo: "15" }),
        respuesta()
    );

    const movimiento = registro.historial.find(h => h.campo === "Salario base");

    assert.ok(movimiento, "debe existir un renglón de Salario base");
    assert.equal(movimiento.accion, "EDICION");
    assert.equal(movimiento.valor_anterior, "Q 3500.00");
    assert.equal(movimiento.valor_nuevo, "Q 5000.00");
    assert.equal(movimiento.codigo_empleado, 15);
    assert.equal(movimiento.usuario, "Stephanie Sabán", "debe quedar quién lo cambió");
    assert.equal(movimiento.id_credencial, 3);
});

test("el historial anota el puesto con nombres, no con números", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    await controlador.actualizar(
        peticion({ id_puesto: 8 }, { codigo: "15" }),
        respuesta()
    );

    const movimiento = registro.historial.find(h => h.campo === "Puesto");

    assert.ok(movimiento);
    assert.equal(movimiento.valor_anterior, "Inspector");
    assert.equal(movimiento.valor_nuevo, "Supervisor de unidad");
});

test("el historial anota el cambio de unidad", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    await controlador.actualizar(
        peticion({ id_unidad: 2 }, { codigo: "15" }),
        respuesta()
    );

    const movimiento = registro.historial.find(h => h.campo === "Unidad");

    assert.ok(movimiento);
    assert.equal(movimiento.valor_anterior, "SI-01");
    assert.equal(movimiento.valor_nuevo, "SI-02");
});

test("el historial anota la baja del empleado como Estado", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    await controlador.actualizar(
        peticion({ activo: false }, { codigo: "15" }),
        respuesta()
    );

    const movimiento = registro.historial.find(h => h.campo === "Estado");

    assert.ok(movimiento);
    assert.equal(movimiento.valor_anterior, "Activo");
    assert.equal(movimiento.valor_nuevo, "Inactivo");
});

test("si nada cambió, no se escribe basura en el historial", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    /* Se manda el MISMO salario que ya tenía */
    await controlador.actualizar(
        peticion({ salario_base: 3500 }, { codigo: "15" }),
        respuesta()
    );

    assert.equal(registro.historial.length, 0);
});

test("al crear se deja constancia del alta", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    await controlador.crear(peticion(cuerpoNuevo({ id_puesto: 7 })), respuesta());

    assert.ok(registro.historial.length > 0);
    assert.ok(registro.historial.every(h => h.accion === "CREACION"));
    assert.ok(registro.historial.some(h => h.campo === "Alta del empleado"));
});

test("si el historial falla, el empleado IGUAL se guarda", async t => {
    t.after(restaurar);
    /* Simula que la tabla Empleado_historial todavía no existe en la
       base (el caso real del grupo: faltan tablas). El guardado del
       empleado no se debe caer por eso. */
    prepararDoble({ fallaHistorial: true });
    const res = respuesta();

    await controlador.actualizar(
        peticion({ salario_base: 7000 }, { codigo: "15" }),
        res
    );

    assert.equal(res.codigo, 200, "el salario se guardó aunque el historial fallara");
    assert.equal(res.cuerpo.exito, true);
});

/* ============================================================
   5. Errores y casos límite
   ============================================================ */
test("si el empleado no existe se responde 404 y no se toca nada", async t => {
    t.after(restaurar);
    const registro = prepararDoble({ estadoInicial: undefined });
    const res = respuesta();

    await controlador.actualizar(
        peticion({ salario_base: 999 }, { codigo: "12345" }),
        res
    );

    assert.equal(res.codigo, 404);
    assert.equal(registro.actualizado, null, "no debe intentar el UPDATE");
});

test("si falla la asignación de unidad se avisa, no se queda callado", async t => {
    t.after(restaurar);
    prepararDoble({ fallaUnidad: true });
    const res = respuesta();

    await controlador.actualizar(
        peticion({ id_unidad: 4 }, { codigo: "15" }),
        res
    );

    assert.equal(res.codigo, 400);
    assert.match(res.cuerpo.mensaje, /no se pudo cambiar la unidad/i);
});

test("no se permite cambiar el código de empleado", async t => {
    t.after(restaurar);
    prepararDoble();
    const res = respuesta();

    await controlador.actualizar(
        peticion({ codigo_empleado: 77 }, { codigo: "15" }),
        res
    );

    assert.equal(res.codigo, 400);
    assert.match(res.cuerpo.mensaje, /no se puede editar/i);
});

test("el email sigue siendo obligatorio y validado al crear", async t => {
    t.after(restaurar);
    prepararDoble();

    const sinEmail = respuesta();
    const cuerpo = cuerpoNuevo({ id_puesto: 7 });
    delete cuerpo.email;
    await controlador.crear(peticion(cuerpo), sinEmail);
    assert.equal(sinEmail.codigo, 400);

    const malEmail = respuesta();
    await controlador.crear(peticion(cuerpoNuevo({ id_puesto: 7, email: "noesuncorreo" })), malEmail);
    assert.equal(malEmail.codigo, 400);
    assert.match(malEmail.cuerpo.mensaje, /email/i);
});

test("el historial se puede consultar por empleado", async t => {
    t.after(restaurar);
    prepararDoble({
        historialGuardado: [
            { id_historial: 2, campo: "Salario base", valor_anterior: "Q 3500.00", valor_nuevo: "Q 5000.00" }
        ]
    });
    const res = respuesta();

    await controlador.obtenerHistorial(peticion({}, { codigo: "15" }), res);

    assert.equal(res.codigo, 200);
    assert.equal(res.cuerpo.datos.length, 1);
    assert.equal(res.cuerpo.datos[0].campo, "Salario base");
});

test("un código de empleado inválido no llega a la base", async t => {
    t.after(restaurar);
    prepararDoble();
    const res = respuesta();

    await controlador.obtenerHistorial(peticion({}, { codigo: "abc" }), res);

    assert.equal(res.codigo, 400);
});

/* ============================================================
   6. Formato de los valores del historial
   ============================================================ */
test("las fechas del historial se muestran sin la hora", async t => {
    t.after(restaurar);
    const { comoTexto } = controlador._internos;

    assert.equal(
        comoTexto("fecha_contratacion", new Date("2024-03-01T00:00:00Z")),
        "2024-03-01"
    );
});

test("un valor vacío de unidad se lee como 'Sin unidad'", async t => {
    t.after(restaurar);
    const { comoTexto } = controlador._internos;

    assert.equal(comoTexto("unidad", null), "Sin unidad");
    assert.equal(comoTexto("direccion", null), "");
});

test("el tipo de empleado se guarda con su nombre bonito", async t => {
    t.after(restaurar);
    const { comoTexto } = controlador._internos;

    assert.equal(comoTexto("tipo_empleado", "TECNICO_NO_SOCIO"), "Técnico no socio");
});
