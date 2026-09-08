const express = require("express");
const sql = require("mssql");
const session = require("express-session");
const path = require("path");
const empleadosRoutes = require("./src/routes/empleados.routes");
const rolesRoutes = require("./src/routes/roles.routes");
const accesosRoutes = require("./src/routes/accesos.routes");
const usuariosRoutes = require("./src/routes/usuarios.routes");

const app = express();
const PORT = 3000;

// =====================================
// CONFIGURACIÓN DE SQL SERVER
// =====================================

const dbConfig = {
    user: "sa",
    password: "HolaKoishi",
    server: "127.0.0.1",
    port: 1433,
    database: "Seisa",

    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

// =====================================
// CONEXIÓN A SQL SERVER
// =====================================

let pool;

async function conectarBD() {
    try {
        pool = await sql.connect(dbConfig);
        console.log("Conectado a SQL Server");
    } catch (error) {
        console.error("Error conectando a SQL Server:", error);
    }
}

// =====================================
// MIDDLEWARE
// =====================================

// Permite recibir JSON desde fetch()
app.use(express.json());

// Permite recibir datos enviados desde formularios
app.use(express.urlencoded({ extended: true }));

// API de empleados para los formularios del panel
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

// =====================================
// ARCHIVOS ESTÁTICOS
// =====================================

// Permite acceder a:
// /index.html
// /login.html
// /inicio.html
// /css/...
// /js/...
// /img/...
app.use(express.static(__dirname));

// =====================================
// PÁGINA INICIAL
// =====================================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

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
    if (!pool) {
        return res.status(500).json({
            exito: false,
            mensaje: "La base de datos no está disponible."
        });
    }

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

        console.log("Usuario inició sesión:", usuarioBD.usuario);

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

app.get("/inicio", requiereLogin, (req, res) => {

    res.sendFile(path.join(__dirname, "inicio.html"));

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

// =====================================
// INICIAR SERVIDOR
// =====================================

app.listen(PORT, "0.0.0.0", async () => {

    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);

    await conectarBD();

});