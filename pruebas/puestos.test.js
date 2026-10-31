const test = require("node:test");
const assert = require("node:assert/strict");

/* ============================================================
   Pruebas del mantenimiento de PUESTOS
   ------------------------------------------------------------
   Antes solo se podían crear y ver puestos: las funciones de
   editar y borrar estaban escritas en el modelo pero no tenían
   controlador ni ruta, así que no se podían usar.

   Lo más importante que se prueba aquí: NO se puede borrar un
   puesto que tenga empleados asignados. Si se permitiera, esos
   empleados quedarían apuntando a un puesto inexistente y la
   pantalla no podría mostrar su puesto.

   El modelo se reemplaza por uno de mentira, así que no hace
   falta SQL Server.
   ============================================================ */

const modelo = require("../modelos/puestos.model");
const controlador = require("../controlador/puestos.controller");

const originales = { ...modelo };

function prepararDoble(opciones = {}) {
    const registro = { actualizado: null, eliminado: null };

    modelo.contarEmpleados = async () => opciones.empleadosQueLoUsan ?? 0;

    modelo.actualizar = async (id, datos) => {
        registro.actualizado = { id, datos };
        return opciones.noExiste ? undefined : { id_puesto: id, ...datos };
    };

    modelo.eliminar = async id => {
        registro.eliminado = id;
        return opciones.noExiste ? undefined : { id_puesto: id, nombre: "Inspector" };
    };

    modelo.obtenerTodos = async () => opciones.lista || [];

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
   Borrar: la protección
   ============================================================ */
test("NO se puede borrar un puesto que tiene empleados asignados", async t => {
    t.after(restaurar);
    const registro = prepararDoble({ empleadosQueLoUsan: 3 });
    const res = respuesta();

    await controlador.eliminar(peticion({}, { id: "7" }), res);

    assert.equal(res.codigo, 409);
    assert.match(res.cuerpo.mensaje, /3 empleados/);
    assert.equal(registro.eliminado, null, "no debe llegar a borrarlo");
});

test("el aviso está en singular cuando es un solo empleado", async t => {
    t.after(restaurar);
    prepararDoble({ empleadosQueLoUsan: 1 });
    const res = respuesta();

    await controlador.eliminar(peticion({}, { id: "7" }), res);

    assert.match(res.cuerpo.mensaje, /hay 1 empleado con este puesto/);
    assert.doesNotMatch(res.cuerpo.mensaje, /empleados/);
});

test("sí se borra un puesto que no usa nadie", async t => {
    t.after(restaurar);
    const registro = prepararDoble({ empleadosQueLoUsan: 0 });
    const res = respuesta();

    await controlador.eliminar(peticion({}, { id: "7" }), res);

    assert.equal(res.codigo, 200);
    assert.equal(registro.eliminado, 7);
});

test("borrar un puesto que ya no existe responde 404", async t => {
    t.after(restaurar);
    prepararDoble({ empleadosQueLoUsan: 0, noExiste: true });
    const res = respuesta();

    await controlador.eliminar(peticion({}, { id: "7" }), res);

    assert.equal(res.codigo, 404);
});

test("un id inválido no llega a la base", async t => {
    t.after(restaurar);
    const registro = prepararDoble();
    const res = respuesta();

    await controlador.eliminar(peticion({}, { id: "abc" }), res);

    assert.equal(res.codigo, 400);
    assert.equal(registro.eliminado, null);
});

/* ============================================================
   Editar
   ============================================================ */
test("se puede cambiar el nombre de un puesto", async t => {
    t.after(restaurar);
    const registro = prepararDoble();
    const res = respuesta();

    await controlador.actualizar(
        peticion({ nombre: "  Seguridad Industrial  " }, { id: "7" }),
        res
    );

    assert.equal(res.codigo, 200);
    assert.equal(registro.actualizado.datos.nombre, "Seguridad Industrial", "se recortan los espacios");
});

test("un nombre de más de 24 caracteres se rechaza", async t => {
    t.after(restaurar);
    const registro = prepararDoble();
    const res = respuesta();

    await controlador.actualizar(
        peticion({ nombre: "Supervisor general de operaciones de campo" }, { id: "7" }),
        res
    );

    assert.equal(res.codigo, 400);
    assert.match(res.cuerpo.mensaje, /24 caracteres/);
    assert.equal(registro.actualizado, null, "no debe llegar a la base y reventar por el largo de la columna");
});

test("un nombre vacío se rechaza", async t => {
    t.after(restaurar);
    prepararDoble();
    const res = respuesta();

    await controlador.actualizar(peticion({ nombre: "   " }, { id: "7" }), res);

    assert.equal(res.codigo, 400);
});

test("una descripción de más de 64 caracteres se rechaza", async t => {
    t.after(restaurar);
    prepararDoble();
    const res = respuesta();

    await controlador.actualizar(
        peticion({ descripcion: "x".repeat(65) }, { id: "7" }),
        res
    );

    assert.equal(res.codigo, 400);
    assert.match(res.cuerpo.mensaje, /64 caracteres/);
});

test("una descripción vacía se guarda como nula, no como texto vacío", async t => {
    t.after(restaurar);
    const registro = prepararDoble();

    await controlador.actualizar(peticion({ descripcion: "" }, { id: "7" }), respuesta());

    assert.equal(registro.actualizado.datos.descripcion, null);
});

test("editar un puesto que ya no existe responde 404", async t => {
    t.after(restaurar);
    prepararDoble({ noExiste: true });
    const res = respuesta();

    await controlador.actualizar(peticion({ nombre: "Técnico" }, { id: "7" }), res);

    assert.equal(res.codigo, 404);
});

/* ============================================================
   Listado
   ============================================================ */
test("la lista dice cuántos empleados usan cada puesto", async t => {
    t.after(restaurar);
    prepararDoble({
        lista: [
            { id_puesto: 1, nombre: "Técnico", descripcion: null, empleados: 4 },
            { id_puesto: 2, nombre: "Gerente general", descripcion: null, empleados: 0 }
        ]
    });
    const res = respuesta();

    await controlador.obtenerTodos(peticion({}), res);

    assert.equal(res.codigo, 200);
    assert.equal(res.cuerpo.datos[0].empleados, 4);
    assert.equal(res.cuerpo.datos[1].empleados, 0);
});
