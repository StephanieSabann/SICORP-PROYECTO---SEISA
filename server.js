const express = require("express");
const sql = require("mssql");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = 3000;

// =====================================
// CONFIGURACIÓN DE SQL SERVER
// =====================================

const dbConfig = {
    user: "sa",
    password: "Umg$2023",
    server: "127.0.0.1",
    port: 51433,
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

app.use(express.json());

//Para usar después y encriptar la sesión de ser necesario
/*
app.use(
    session({
        secret: "CAMBIA-ESTA-CLAVE-POR-UNA-LARGA-Y-ALEATORIA",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true
        }
    })
);
*/

//1. busca en el folder root
app.use(express.static(__dirname)); 

//2. para que al entrar por primera vez "sirva" el index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// =====================================
// LOGIN
// =====================================

app.post("/login", async (req, res) => {

    const { usuario, contraseña } = req.body;

    if (!usuario || !contraseña) {
        return res.status(400).json({
            exito: false,
            mensaje: "Debes introducir usuario y contraseña."
        });
    }

    try {

        const resultado = await pool
            .request()
            .input("usuario", sql.VarChar(100), usuario)
            .input("contraseña", sql.VarChar(255), contraseña)
            .query(`
                SELECT usuario
                FROM credenciales
                WHERE usuario = @usuario
                AND contrasenia = HASHBYTES('SHA2_512', @contraseña)
            `);

        if (resultado.recordset.length === 0) {

            return res.status(401).json({
                exito: false,
                mensaje: "Usuario o contraseña incorrectos."
            });
        }

        // Guardamos al usuario en la sesión
        req.session.usuario = resultado.recordset[0].usuario;

        res.json({
            exito: true
        });

    } catch (error) {

        console.error("Error de login:", error);

        res.status(500).json({
            exito: false,
            mensaje: "Error interno del servidor."
        });
    }
});

// =====================================
// MIDDLEWARE DE AUTENTICACIÓN
// =====================================

function requiereLogin(req, res, next) {

    if (req.session.usuario) {
        next();
    } else {
        res.redirect("/login.html");
    }
}

// =====================================
// PÁGINA PROTEGIDA
// =====================================

app.get("/inicio", requiereLogin, (req, res) => {

    res.sendFile(path.join(__dirname, 'inicio.html'));

});
// =====================================
// CERRAR SESIÓN
// =====================================

app.get("/logout", (req, res) => {

    req.session.destroy((error) => {

        if (error) {
            return res.status(500).send("No se pudo cerrar la sesión.");
        }

        res.redirect("/login.html");
    });
});

// =====================================
// INICIAR SERVIDOR
// =====================================
/*
app.listen(PORT, async () => {

    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);

    await conectarBD();
});
*/

//0.0.0.0 se usa para que escuche a todas las direcciones ipv4 de la red LAN
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Servidor ejecutándose en http://0.0.0.0:${PORT}`);
    await conectarBD();
});