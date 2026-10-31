const test = require("node:test");
const assert = require("node:assert/strict");

/* ============================================================
   Pruebas del mantenimiento de UNIDADES (cuadrillas)
   ------------------------------------------------------------
   Antes solo se podían crear, listar y activar/desactivar. No
   había forma de cambiarle el código a una unidad ni de
   borrarla: para arreglar una vieja como "S1" había que entrar
   a SQL a mano.

   Lo que se prueba aquí:
     - El formato SI-NN se aplica igual que en Empleados
     - No se puede borrar una unidad con empleados asignados
     - Un código repetido da un mensaje entendible y no el
       error crudo de SQL Server
   ============================================================ */

const modelo = require("../modelos/unidades.model");
const controlador = require("../controlador/unidades.controller");
const { normalizarCodigoUnidad } = require("../utilidades/codigoUnidad");

const originales = { ...modelo };

function prepararDoble(opciones = {}) {
    const registro = { actualizada: null, eliminada: null, creada: null };

    modelo.contarEmpleados = async () => opciones.empleadosAsignados ?? 0;

    modelo.actualizarCodigo = async (id, codigo) => {
        if (opciones.codigoRepetido) {
            throw new Error("Violation of UNIQUE KEY constraint 'UQ_Unidad_codigo'.");
        }
        registro.actualizada = { id, codigo };
        return opciones.noExiste ? undefined : { id_unidad: id, codigo };
    };

    modelo.eliminar = async id => {
        registro.eliminada = id;
        return opciones.noExiste ? undefined : { id_unidad: id, codigo: "SI-05" };
    };

    modelo.crear = async datos => {
        registro.creada = datos;
        return { id_unidad: 9, codigo: datos.codigo, empleados: [] };
    };

    return registro;
}

function restaurar() {
    Object.assign(modelo, originales);
}

function peticion(cuerpo, parametros = {}) {
    return { body: cuerpo, params: parametros };
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

/* ============================================================
   El formato SI-NN, compartido con el módulo de Empleados
   ============================================================ */
test("el formato acepta las formas de escribir que usa la gente", async () => {
    assert.equal(normalizarCodigoUnidad("21"), "SI-21");
    assert.equal(normalizarCodigoUnidad("1"), "SI-01");
    assert.equal(normalizarCodigoUnidad("si21"), "SI-21");
    assert.equal(normalizarCodigoUnidad("SI - 21"), "SI-21");
    assert.equal(normalizarCodigoUnidad("si-1"), "SI-01");
    assert.equal(normalizarCodigoUnidad("SI-21"), "SI-21");
});

test("el formato rechaza lo que no cumple", async () => {
    assert.throws(() => normalizarCodigoUnidad("XX-05"), /SI-/);
    assert.throws(() => normalizarCodigoUnidad("cuadrilla 3"), /SI-/);
    assert.throws(() => normalizarCodigoUnidad("S1"), /SI-/);
    assert.throws(() => normalizarCodigoUnidad("SI-00"), /1 al 99/);
    assert.throws(() => normalizarCodigoUnidad("SI-100"), /SI-/);
});

test("vacío significa sin unidad, no es un error", async () => {
    assert.equal(normalizarCodigoUnidad(""), null);
    assert.equal(normalizarCodigoUnidad("   "), null);
    assert.equal(normalizarCodigoUnidad(null), null);
});

/* ============================================================
   Editar el código
   ============================================================ */
test("se puede corregir una unidad vieja escribiendo solo el número", async t => {
    t.after(restaurar);
    const registro = prepararDoble();
    const res = respuesta();

    await controlador.actualizarCodigo(peticion({ codigo: "1" }, { id: "4" }), res);

    assert.equal(res.codigo, 200);
    assert.equal(registro.actualizada.codigo, "SI-01", "se guarda con formato, no como lo escribieron");
});

test("un código con formato equivocado se rechaza al editar", async t => {
    t.after(restaurar);
    const registro = prepararDoble();
    const res = respuesta();

    await controlador.actualizarCodigo(peticion({ codigo: "S1" }, { id: "4" }), res);

    assert.equal(res.codigo, 400);
    assert.match(res.cuerpo.mensaje, /SI-/);
    assert.equal(registro.actualizada, null, "no debe llegar a la base");
});

test("un código repetido da un mensaje entendible, no el error de SQL", async t => {
    t.after(restaurar);
    prepararDoble({ codigoRepetido: true });
    const res = respuesta();

    await controlador.actualizarCodigo(peticion({ codigo: "SI-01" }, { id: "4" }), res);

    assert.equal(res.codigo, 400);
    assert.match(res.cuerpo.mensaje, /Ya existe otra unidad con ese código/);
    assert.doesNotMatch(res.cuerpo.mensaje, /UNIQUE KEY|constraint/i);
});

test("editar una unidad que ya no existe responde 404", async t => {
    t.after(restaurar);
    prepararDoble({ noExiste: true });
    const res = respuesta();

    await controlador.actualizarCodigo(peticion({ codigo: "SI-07" }, { id: "4" }), res);

    assert.equal(res.codigo, 404);
});

/* ============================================================
   Borrar
   ============================================================ */
test("NO se puede borrar una unidad con empleados asignados", async t => {
    t.after(restaurar);
    const registro = prepararDoble({ empleadosAsignados: 2 });
    const res = respuesta();

    await controlador.eliminar(peticion({}, { id: "4" }), res);

    assert.equal(res.codigo, 409);
    assert.match(res.cuerpo.mensaje, /2 empleados/);
    assert.equal(registro.eliminada, null, "no debe llegar a borrarla");
});

test("el aviso está en singular cuando es un solo empleado", async t => {
    t.after(restaurar);
    prepararDoble({ empleadosAsignados: 1 });
    const res = respuesta();

    await controlador.eliminar(peticion({}, { id: "4" }), res);

    assert.match(res.cuerpo.mensaje, /hay 1 empleado asignado/);
});

test("sí se borra una unidad que no tiene a nadie", async t => {
    t.after(restaurar);
    const registro = prepararDoble({ empleadosAsignados: 0 });
    const res = respuesta();

    await controlador.eliminar(peticion({}, { id: "4" }), res);

    assert.equal(res.codigo, 200);
    assert.equal(registro.eliminada, 4);
});

test("un id inválido no llega a la base", async t => {
    t.after(restaurar);
    const registro = prepararDoble();
    const res = respuesta();

    await controlador.eliminar(peticion({}, { id: "abc" }), res);

    assert.equal(res.codigo, 400);
    assert.equal(registro.eliminada, null);
});

/* ============================================================
   Crear con el formato nuevo
   ============================================================ */
test("al crear una unidad también se exige el formato SI-NN", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    const malo = respuesta();
    await controlador.crear(peticion({ codigo: "S1" }), malo);
    assert.equal(malo.codigo, 400);
    assert.equal(registro.creada, null);

    const bueno = respuesta();
    await controlador.crear(peticion({ codigo: "7" }), bueno);
    assert.equal(bueno.codigo, 201);
    assert.equal(registro.creada.codigo, "SI-07");
});