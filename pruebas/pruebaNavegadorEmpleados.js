/* ============================================================
   Prueba de navegador del módulo de Empleados
   ------------------------------------------------------------
   Esta prueba abre empleados.html en un navegador de verdad y
   comprueba, con clics reales, que los errores que reportó el
   grupo quedaron arreglados:

     1. Al editar un empleado y cambiarle el salario, el sistema
        SÍ manda la petición PATCH al servidor (antes el
        formulario se salía antes de llamar a la API porque el
        campo Puesto venía vacío y lo marcaba como incompleto).
     2. Se manda el puesto que la persona escogió.
     3. Se manda la unidad.
     4. El historial del empleado se muestra en el expediente.

   NO necesita SQL Server: levanta un servidor de mentira que
   responde las rutas de la API con datos de prueba y anota qué
   le llegó.

   Esta prueba NO va incluida en "npm test" a propósito: necesita
   Playwright y un navegador instalados, y en las computadoras
   del grupo no están. "npm test" sigue corriendo solo las
   pruebas normales.

   Cómo correrla (solo si tienes Playwright instalado):
       node pruebas/pruebaNavegadorEmpleados.js
   ============================================================ */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

/* Se puede apuntar a otra carpeta public/ con la variable
   PUBLIC_DIR. Sirvió para correr esta misma prueba contra el código
   ANTERIOR y comprobar que el error existía de verdad. */
const RUTA_PUBLICA = process.env.PUBLIC_DIR
    ? path.resolve(process.env.PUBLIC_DIR)
    : path.join(__dirname, "..", "public");
const PUERTO = 3177;

/* Lo que el navegador le mandó al "servidor". Es lo que se revisa
   al final para saber si el guardado de verdad salió. */
const recibido = { patches: [], posts: [] };

const PUESTOS = [
    { id_puesto: 2, nombre: "Técnico" },
    { id_puesto: 7, nombre: "Inspector" },
    { id_puesto: 8, nombre: "Supervisor de unidad" }
];

const UNIDADES = [
    { id_unidad: 4, codigo: "SI-01", es_activa: true, empleados: [] },
    { id_unidad: 5, codigo: "SI-02", es_activa: true, empleados: [] },
    { id_unidad: 9, codigo: "VIEJA", es_activa: false, empleados: [] }
];

const EMPLEADO = {
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
    unidad: "SI-01"
};

const TIPOS_MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml"
};

function responderJson(res, codigo, cuerpo) {
    res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(cuerpo));
}

function leerCuerpo(req) {
    return new Promise(resolve => {
        let texto = "";
        req.on("data", trozo => { texto += trozo; });
        req.on("end", () => {
            try { resolve(JSON.parse(texto || "{}")); }
            catch (_) { resolve({}); }
        });
    });
}

const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PUERTO}`);
    const ruta = url.pathname;

    /* ---------- API de mentira ---------- */
    if (ruta === "/api/sesion") {
        return responderJson(res, 200, {
            exito: true,
            datos: {
                id_credencial: 3,
                usuario: "ssaban",
                nombre: "Stephanie Sabán",
                rol: "Administrador",
                accesos: ["Empleados", "Usuarios", "Inventario", "Nóminas", "Reportes"]
            }
        });
    }

    if (ruta === "/api/puestos") {
        return responderJson(res, 200, { exito: true, datos: PUESTOS });
    }

    if (ruta === "/api/unidades") {
        return responderJson(res, 200, { exito: true, datos: UNIDADES });
    }

    if (ruta === "/api/empleados" && req.method === "GET") {
        return responderJson(res, 200, { exito: true, datos: [EMPLEADO] });
    }

    if (ruta === "/api/empleados/15/historial") {
        return responderJson(res, 200, {
            exito: true,
            datos: [
                {
                    id_historial: 2,
                    accion: "EDICION",
                    campo: "Salario base",
                    valor_anterior: "Q 3500.00",
                    valor_nuevo: "Q 4800.00",
                    usuario: "Stephanie Sabán",
                    fecha: "2026-10-28T21:40:00.000Z"
                },
                {
                    id_historial: 1,
                    accion: "CREACION",
                    campo: "Alta del empleado",
                    valor_anterior: null,
                    valor_nuevo: "Stephanie Sabán",
                    usuario: "Jonathan Duarte",
                    fecha: "2024-03-01T14:00:00.000Z"
                }
            ]
        });
    }

    if (ruta.startsWith("/api/empleados/") && req.method === "PATCH") {
        const cuerpo = await leerCuerpo(req);
        recibido.patches.push({ ruta, cuerpo });
        return responderJson(res, 200, {
            exito: true,
            mensaje: "Empleado actualizado correctamente.",
            datos: { ...EMPLEADO, ...cuerpo }
        });
    }

    if (ruta === "/api/empleados" && req.method === "POST") {
        const cuerpo = await leerCuerpo(req);
        recibido.posts.push({ ruta, cuerpo });
        return responderJson(res, 201, {
            exito: true,
            mensaje: "Empleado creado correctamente.",
            datos: { ...EMPLEADO, ...cuerpo, codigo_empleado: 99 }
        });
    }

    /* Rutas de permisos que la pantalla consulta al abrir el expediente */
    if (ruta === "/api/permisos/tipos") {
        return responderJson(res, 200, { exito: true, datos: [{ id_tipo: 1, nombre: "Vacaciones" }] });
    }

    if (ruta === "/api/permisos/limite") {
        return responderJson(res, 200, { exito: true, datos: { dias_asignados: 15, dias_usados: 0 } });
    }

    if (ruta === "/api/permisos") {
        return responderJson(res, 200, { exito: true, datos: [] });
    }

    if (ruta.startsWith("/api/")) {
        return responderJson(res, 200, { exito: true, datos: [] });
    }

    /* ---------- Archivos de public/ ---------- */
    const archivo = path.join(RUTA_PUBLICA, ruta === "/" ? "empleados.html" : ruta);

    if (!archivo.startsWith(RUTA_PUBLICA) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("no encontrado");
    }

    res.writeHead(200, { "Content-Type": TIPOS_MIME[path.extname(archivo)] || "application/octet-stream" });
    fs.createReadStream(archivo).pipe(res);
});

/* ============================================================ */

const resultados = [];

function revisar(titulo, condicion, detalle = "") {
    resultados.push({ titulo, bien: !!condicion, detalle });
    console.log(`${condicion ? "  ok  " : " FALLA"}  ${titulo}${condicion || !detalle ? "" : "\n          → " + detalle}`);
}

async function principal() {
    const { chromium } = require("/opt/npm-tools/node_modules/playwright");

    await new Promise(resolve => servidor.listen(PUERTO, resolve));
    console.log(`Servidor de prueba en http://localhost:${PUERTO}\n`);

    const navegador = await chromium.launch();
    const pagina = await navegador.newPage();
    const erroresJs = [];

    pagina.on("pageerror", error => erroresJs.push(error.message));

    await pagina.goto(`http://localhost:${PUERTO}/empleados.html`, { waitUntil: "networkidle" });

    console.log("--- 1. Los catálogos llegan a las listas ---");

    const opcionesPuesto = await pagina.$$eval("#fPuesto option", nodos =>
        nodos.map(n => n.textContent.trim()));
    revisar(
        "el campo Puesto ya es una lista con los puestos de la base",
        opcionesPuesto.includes("Inspector") && opcionesPuesto.includes("Supervisor de unidad"),
        "opciones encontradas: " + JSON.stringify(opcionesPuesto)
    );

    /* La unidad es una caja de texto con sugerencias (<datalist>) */
    const opcionesUnidad = await pagina.$$eval("#listaUnidades option", nodos =>
        nodos.map(n => n.value.trim()));
    revisar(
        "el campo Unidad sugiere las unidades activas",
        opcionesUnidad.includes("SI-01") && opcionesUnidad.includes("SI-02"),
        "sugerencias encontradas: " + JSON.stringify(opcionesUnidad)
    );
    revisar(
        "las unidades dadas de baja NO se sugieren",
        !opcionesUnidad.includes("VIEJA"),
        "sugerencias encontradas: " + JSON.stringify(opcionesUnidad)
    );
    revisar(
        "el campo Unidad se puede escribir a mano",
        await pagina.$eval("#fUnidad", n => n.tagName === "INPUT" && n.getAttribute("list") === "listaUnidades")
    );

    console.log("\n--- 2. La lista muestra el puesto y la unidad ---");

    const textoLista = await pagina.textContent("#v-lista");
    revisar("el puesto del empleado se ve en la lista", /Inspector/.test(textoLista));
    revisar(
        "la unidad del empleado se ve en la lista (antes decía 'Sin unidad')",
        /SI-01/.test(textoLista) && !/Sin unidad/.test(textoLista),
        "texto: " + textoLista.replace(/\s+/g, " ").slice(0, 300)
    );

    console.log("\n--- 3. EL ERROR PRINCIPAL: editar y guardar el salario ---");

    /* Se abre el empleado para editarlo igual que lo haría una
       persona: clic en su tarjeta y luego en Editar. */
    await pagina.evaluate(() => {
        abrirFormularioEmpleado(empleados.find(e => e.codigo === 15));
    });
    await pagina.waitForSelector("#v-nuevo.is-active", { timeout: 5000 });

    const puestoPrecargado = await pagina.inputValue("#fPuesto");
    revisar(
        "al abrir para editar, el Puesto viene precargado (esto era lo que bloqueaba todo)",
        puestoPrecargado === "7",
        "valor del select: " + JSON.stringify(puestoPrecargado)
    );

    const unidadPrecargada = await pagina.inputValue("#fUnidad");
    revisar(
        "al abrir para editar, la Unidad viene precargada con su código",
        unidadPrecargada === "SI-01",
        "valor del campo: " + JSON.stringify(unidadPrecargada)
    );

    /* Se cambia el salario y se guarda */
    const patchesAntes = recibido.patches.length;
    await pagina.fill("#fSalario", "4800");
    await pagina.click("#btnGuardarEmpleado");

    /* Se espera a que llegue la petición al servidor de prueba */
    const limite = Date.now() + 8000;
    while (recibido.patches.length === patchesAntes && Date.now() < limite) {
        await new Promise(r => setTimeout(r, 100));
    }

    const guardado = recibido.patches[recibido.patches.length - 1];

    revisar(
        "al guardar, el sistema SÍ manda la petición al servidor",
        recibido.patches.length > patchesAntes,
        "antes de este arreglo el formulario se salía sin llamar a la API"
    );

    if (guardado) {
        revisar(
            "el salario nuevo llega al servidor",
            Number(guardado.cuerpo.salario_base) === 4800,
            "lo que se mandó: " + JSON.stringify(guardado.cuerpo.salario_base)
        );
        revisar(
            "el puesto escogido llega al servidor (no el deducido del tipo)",
            Number(guardado.cuerpo.id_puesto) === 7,
            "lo que se mandó: " + JSON.stringify(guardado.cuerpo.id_puesto)
        );
        revisar(
            "la unidad llega al servidor como código escrito",
            guardado.cuerpo.unidad_codigo === "SI-01",
            "lo que se mandó: " + JSON.stringify(guardado.cuerpo.unidad_codigo)
        );
        revisar(
            "la petición va al empleado correcto",
            guardado.ruta === "/api/empleados/15",
            "ruta: " + guardado.ruta
        );
    }

    /* El guardado termina abriendo el modal de "Cambios guardados".
       Primero se espera a que aparezca (así se confirma que el flujo
       llegó hasta el final) y después se cierra, igual que haría la
       persona, porque si no tapa los clics que siguen. */
    await pagina.waitForSelector("#modalOk.abierto", { timeout: 8000 });
    revisar("al guardar se muestra la confirmación de 'Cambios guardados'", true);

    await pagina.evaluate(() => cerrarModal("modalOk"));
    await pagina.waitForSelector("#modalOk.abierto", { state: "hidden", timeout: 5000 });

    console.log("\n--- 3.b El formato SI-NN se aplica solo ---");

    const patchesAntesNueva = recibido.patches.length;
    await pagina.evaluate(() => {
        abrirFormularioEmpleado(empleados.find(e => e.codigo === 15));
    });
    await pagina.waitForSelector("#v-nuevo.is-active", { timeout: 5000 });
    await pagina.fill("#fUnidad", "9");
    await pagina.click("#btnGuardarEmpleado");
    await pagina.waitForSelector("#modalOk.abierto", { timeout: 8000 });

    const guardadoNueva = recibido.patches[recibido.patches.length - 1];
    revisar(
        "escribir solo el numero 9 lo manda como SI-09",
        recibido.patches.length > patchesAntesNueva && guardadoNueva.cuerpo.unidad_codigo === "SI-09",
        "lo que se mandó: " + JSON.stringify(guardadoNueva && guardadoNueva.cuerpo.unidad_codigo)
    );

    await pagina.evaluate(() => cerrarModal("modalOk"));
    await pagina.waitForSelector("#modalOk.abierto", { state: "hidden", timeout: 5000 });

    console.log("\n--- 4. Un administrativo no lleva unidad ---");

    await pagina.evaluate(() => abrirFormularioEmpleado(null));
    await pagina.waitForSelector("#v-nuevo.is-active");
    await pagina.click('#segmentadoTipo [data-tipo="ADMINISTRATIVO"]');

    const unidadApagada = await pagina.isDisabled("#fUnidad");
    revisar("al escoger Administrativo, la lista de unidad se apaga", unidadApagada);

    console.log("\n--- 5. El historial se ve en el expediente ---");

    await pagina.evaluate(() => abrirExpediente(15, false));
    await pagina.waitForSelector("#v-expediente.is-active", { timeout: 5000 });
    await pagina.waitForFunction(
        () => !/Cargando historial/.test(document.getElementById("cajaActividad").textContent),
        null,
        { timeout: 5000 }
    );

    const textoHistorial = await pagina.textContent("#cajaActividad");
    revisar(
        "el historial muestra el cambio de salario con el antes y el después",
        /Salario base/.test(textoHistorial) && /3500/.test(textoHistorial) && /4800/.test(textoHistorial),
        "texto: " + textoHistorial.replace(/\s+/g, " ").slice(0, 300)
    );
    revisar(
        "el historial dice quién hizo el cambio",
        /Stephanie Sabán/.test(textoHistorial),
        "texto: " + textoHistorial.replace(/\s+/g, " ").slice(0, 300)
    );
    revisar(
        "el historial muestra el alta del empleado",
        /Alta del empleado/.test(textoHistorial)
    );

    const puestoExpediente = await pagina.inputValue("#dPuesto");
    revisar(
        "en el expediente el Puesto es una lista con el valor correcto",
        puestoExpediente === "7",
        "valor: " + JSON.stringify(puestoExpediente)
    );

    const unidadExpediente = await pagina.inputValue("#dUnidad");
    revisar(
        "en el expediente la Unidad muestra su código",
        unidadExpediente === "SI-01",
        "valor: " + JSON.stringify(unidadExpediente)
    );

    console.log("\n--- 6. Sin errores de JavaScript ---");
    revisar(
        "la pantalla no lanzó errores de JavaScript",
        erroresJs.length === 0,
        erroresJs.join(" | ")
    );

    await navegador.close();
    servidor.close();

    const fallaron = resultados.filter(r => !r.bien);
    console.log("\n============================================");
    console.log(`  ${resultados.length - fallaron.length} de ${resultados.length} comprobaciones pasaron`);
    console.log("============================================");

    if (fallaron.length > 0) {
        console.log("\nFallaron:");
        fallaron.forEach(r => console.log(" - " + r.titulo));
        process.exit(1);
    }
}

principal().catch(error => {
    console.error("\nLa prueba se cayó:", error);
    servidor.close();
    process.exit(1);
});
