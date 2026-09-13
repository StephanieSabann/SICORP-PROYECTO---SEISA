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

//DEFINIR RUTAS
const credencialesRoutes = require('./rutas/credenciales.routes');
const empleadosRoutes = require("./rutas/empleados.routes");
const rolesRoutes = require("./rutas/roles.routes");
const accesosRoutes = require("./rutas/accesos.routes");
const usuariosRoutes = require("./rutas/usuarios.routes");
app.use('/api/credenciales', credencialesRoutes);
app.use("/api/empleados", empleadosRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/accesos", accesosRoutes);
app.use("/api/usuarios", usuariosRoutes);

// =====================================
// SESIONES
// =====================================

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
                SELECT id_credencial, usuario
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
// MIDDLEWARE DE AUTENTICACIÓN
// =====================================

function requiereLogin(req, res, next) {

    if (req.session && req.session.usuario) {
        next();
    } else {
        res.redirect("/");
    }
}

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