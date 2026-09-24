const os = require("os"); //para obtener la ipv4 e imprimirla en la consola
const express = require("express");
const session = require("express-session");
const path = require("path"); //módulo de Node.js para trabajar correctamente con rutas de archivos.

const app = express();
const PORT = 3000;

//importa la conexion desde basededatos > conexion.js
const { sql, obtenerPool } = require("./basededatos/conexion");

app.use(express.json()); //Permite recibir JSON desde fetch()

//Permite recibir datos enviados desde formularios
app.use(express.urlencoded({ extended: true }));

// =====================================
// SESIONES
// =====================================
// IMPORTANTE: esto tiene que ir ANTES de las rutas /api/* y antes de
// express.static con las páginas protegidas. Si no, cuando llega una
// petición a /api/empleados (por ejemplo), req.session todavía no
// existe y no hay forma de saber quién la está pidiendo.

app.use(
    session({
        secret: "CLAVE",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true
        }
    })
);

// =====================================
// MIDDLEWARE DE AUTENTICACIÓN
// =====================================

// Para páginas HTML normales: si no hay sesión, redirige al login.
function requiereLogin(req, res, next) {

    if (req.session && req.session.usuario) {
        next();
    } else {
        res.redirect("/");
    }
}

// Para la API (usada por fetch): si no hay sesión, responde JSON 401
// en vez de redirigir, porque el frontend espera un JSON, no HTML.
function requiereLoginAPI(req, res, next) {

    if (req.session && req.session.usuario) {
        next();
    } else {
        res.status(401).json({
            exito: false,
            mensaje: "Tu sesión expiró o no has iniciado sesión. Vuelve a entrar."
        });
    }
}

// Punto 4: cada módulo solo debe dejar entrar a quien tenga ese
// acceso asignado en su rol (tabla Rol_acceso -> Catalogo_acceso).
// Se usa así: requiereAcceso('Empleados'), requiereAcceso('Usuarios'), etc.
// El nombre debe coincidir con el de Catalogo_acceso.nombre.
function requiereAcceso(nombreAcceso) {
    return async (req, res, next) => {
        try {
            const pool = await obtenerPool();

            const resultado = await pool
                .request()
                .input("id_credencial", sql.Int, req.session.id_credencial)
                .input("nombre", sql.VarChar(50), nombreAcceso)
                .query(`
                    SELECT TOP 1 ca.id_acceso
                    FROM Rol_credencial rc
                    INNER JOIN Rol_acceso ra ON ra.id_rol = rc.id_rol
                    INNER JOIN Catalogo_acceso ca ON ca.id_acceso = ra.id_acceso
                    WHERE rc.id_credencial = @id_credencial
                      AND ca.nombre = @nombre
                `);

            if (resultado.recordset.length > 0) {
                return next();
            }

            return res.status(403).json({
                exito: false,
                mensaje: `Tu rol no tiene acceso al módulo de ${nombreAcceso}.`
            });

        } catch (error) {
            console.error(`Error verificando el acceso a "${nombreAcceso}":`, error);
            res.status(500).json({ exito: false, mensaje: "Error al verificar el acceso." });
        }
    };
}

// =====================================
// RUTAS DE LA API (protegidas)
// =====================================
// Todas requieren sesión iniciada. Así, aunque alguien copie una URL
// de la API y la abra en otro navegador (sin haber iniciado sesión
// ahí), el servidor la rechaza en vez de entregar los datos.

const credencialesRoutes = require('./rutas/credenciales.routes');
const empleadosRoutes = require("./rutas/empleados.routes");
const rolesRoutes = require("./rutas/roles.routes");
const accesosRoutes = require("./rutas/accesos.routes");
const usuariosRoutes = require("./rutas/usuarios.routes");
const puestosRoutes = require("./rutas/puestos.routes");
const unidadesRoutes = require("./rutas/unidades.routes");
const permisosRoutes = require("./rutas/permisos.routes");
const mensajesRoutes = require("./rutas/mensajes.routes");

app.use('/api/credenciales', requiereLoginAPI, requiereAcceso('Usuarios'), credencialesRoutes);
app.use("/api/empleados", requiereLoginAPI, requiereAcceso('Empleados'), empleadosRoutes);
app.use("/api/roles", requiereLoginAPI, requiereAcceso('Usuarios'), rolesRoutes);
app.use("/api/accesos", requiereLoginAPI, requiereAcceso('Usuarios'), accesosRoutes);
app.use("/api/usuarios", requiereLoginAPI, requiereAcceso('Usuarios'), usuariosRoutes);
app.use("/api/puestos", requiereLoginAPI, requiereAcceso('Empleados'), puestosRoutes);
app.use("/api/unidades", requiereLoginAPI, requiereAcceso('Empleados'), unidadesRoutes);
app.use("/api/permisos", requiereLoginAPI, requiereAcceso('Empleados'), permisosRoutes);

/* /api/mensajes es especial: el formulario de contacto de la landing
   lo usa SIN haber iniciado sesión (POST, para guardar un mensaje
   nuevo). Ver/marcar/borrar mensajes sí requiere sesión y acceso de
   Usuarios (se trata como parte del mantenimiento). */
app.use("/api/mensajes", (req, res, next) => {
    if (req.method === "POST") return next();
    requiereLoginAPI(req, res, () => requiereAcceso('Usuarios')(req, res, next));
}, mensajesRoutes);

// Quién soy: la usan las páginas para saber el nombre, el rol Y los
// módulos a los que tiene acceso la persona que inició sesión (así
// ya no sale "Jonathan" fijo, y el menú solo muestra lo que le
// corresponde a su rol — punto 4).
app.get("/api/sesion", requiereLoginAPI, async (req, res) => {
    try {
        const pool = await obtenerPool();

        const resultado = await pool
            .request()
            .input("id_credencial", sql.Int, req.session.id_credencial)
            .query(`
                SELECT
                    c.id_credencial,
                    c.usuario,
                    e.nombre,
                    e.apellido,
                    e.codigo_empleado,
                    r.id_rol,
                    r.nombre AS rol
                FROM credenciales c
                INNER JOIN Empleado e ON c.codigo_empleado = e.codigo_empleado
                LEFT JOIN Rol_credencial rc ON rc.id_credencial = c.id_credencial
                LEFT JOIN Rol r ON r.id_rol = rc.id_rol
                WHERE c.id_credencial = @id_credencial
            `);

        const fila = resultado.recordset[0];

        if (!fila) {
            return res.status(404).json({ exito: false, mensaje: "No se encontró la sesión." });
        }

        const accesosResultado = await pool
            .request()
            .input("id_credencial", sql.Int, req.session.id_credencial)
            .query(`
                SELECT DISTINCT ca.nombre
                FROM Rol_credencial rc
                INNER JOIN Rol_acceso ra ON ra.id_rol = rc.id_rol
                INNER JOIN Catalogo_acceso ca ON ca.id_acceso = ra.id_acceso
                WHERE rc.id_credencial = @id_credencial
            `);

        res.json({
            exito: true,
            datos: {
                id_credencial: fila.id_credencial,
                usuario: fila.usuario,
                nombre: fila.nombre,
                apellido: fila.apellido,
                nombreCompleto: `${fila.nombre} ${fila.apellido}`.trim(),
                codigo_empleado: fila.codigo_empleado,
                id_rol: fila.id_rol,
                rol: fila.rol || "Sin rol asignado",
                accesos: accesosResultado.recordset.map(a => a.nombre)
            }
        });

    } catch (error) {
        console.error("Error al obtener la sesión:", error);
        res.status(500).json({ exito: false, mensaje: "Error al obtener la sesión." });
    }
});

// =====================================
// PÁGINAS PROTEGIDAS (HTML)
// =====================================
// Sin esto, cualquiera podía escribir la URL de empleados.html o
// usuarios.html directamente y verla sin haber iniciado sesión,
// porque express.static las entrega tal cual a quien las pida.

const PAGINAS_PROTEGIDAS = [
    "/inicio.html",
    "/empleados.html",
    "/usuarios.html",
    "/mantenimiento.html"
];

app.use((req, res, next) => {

    if (PAGINAS_PROTEGIDAS.includes(req.path)) {
        return requiereLogin(req, res, next);
    }

    next();
});

//Indica que los archivos estáticos están en la carpeta "public"
//es para servirlos al iniciar 
//Express busca "index.html" por defecto en esta carpeta al entrar a "/"
app.use(express.static(path.join(__dirname, 'public')));

// =====================================
// LOGIN
// =====================================

app.post("/login", async (req, res) => {

    const { usuario, contraseña } = req.body;

    // Validar datos recibidos
    if (!usuario || !contraseña) {
        return res.status(400).json({
            exito: false,
            mensaje: "Debes introducir usuario y contraseña."
        });
    }

    // Comprobar que la BD esté conectada
    const pool = await obtenerPool();

    try {

        const resultado = await pool
            .request()
            .input("usuario", sql.VarChar(80), usuario)
            .input("contraseña", sql.VarChar(255), contraseña)
            .query(`
                SELECT id_credencial, usuario, Activo
                FROM credenciales
                WHERE usuario = @usuario
                AND contrasenia = HASHBYTES('SHA2_512', @contraseña)
            `);

        // Usuario o contraseña incorrectos
        if (resultado.recordset.length === 0) {
            return res.status(401).json({
                exito: false,
                mensaje: "Usuario o contraseña incorrectos."
            });
        }

        // Usuario encontrado
        const usuarioBD = resultado.recordset[0];

        // Cuenta desactivada: no debe poder entrar aunque la
        // contraseña sea correcta.
        if (usuarioBD.Activo === false || usuarioBD.Activo === 0) {
            return res.status(403).json({
                exito: false,
                mensaje: "Esta cuenta está desactivada. Contacta a un administrador."
            });
        }

        // Guardamos información en la sesión
        req.session.usuario = usuarioBD.usuario;
        req.session.id_credencial = usuarioBD.id_credencial;

        console.log("Usuario inició sesión:", usuarioBD.usuario); //notifica el inico de sesion

        return res.json({
            exito: true,
            mensaje: "Inicio de sesión correcto."
        });

    } catch (error) {

        console.error("Error de login:", error);

        return res.status(500).json({
            exito: false,
            mensaje: "Error interno del servidor."
        });
    }
});

// =====================================
// PÁGINA PROTEGIDA: INICIO
// =====================================
//Es la pagina a la que se envia despues del login, en este caso queremos que sea inicio
app.get("/inicio", requiereLogin, (req, res) => {

    res.sendFile(path.join(__dirname, "public/inicio.html"));

});

// =====================================
// CERRAR SESIÓN
// =====================================

app.get("/logout", (req, res) => {

    req.session.destroy((error) => {

        if (error) {
            console.error("Error destruyendo sesión:", error);

            return res.status(500).send(
                "No se pudo cerrar la sesión."
            );
        }

        res.redirect("/");
    });
});


//OBTENER IPV4 PARA CONSOLA-------------------------------------------------------
function obtenerIPV4() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            // Skip over non-IPv4 and internal (127.0.0.1) addresses
            if (net.family === 'V4' || net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}


//INICIAR SERVIDOR------------------------------------------------
app.listen(PORT, "0.0.0.0", async () => { //0.0.0.0 significa que esta escuchando todas las direcciones
    const ip = obtenerIPV4();
    console.log(`Servidor ejecutándose en http://${ip}:${PORT}`);

});