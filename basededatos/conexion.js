const sql = require("mssql");
require("dotenv").config(); //para ocultar configuracion sql

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_DATABASE,

    options: {
        encrypt: false,
        trustServerCertificate: true
    },

    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let poolPromise;

function obtenerPool() {
    if (!poolPromise) {
        poolPromise = new sql.ConnectionPool(dbConfig)
            .connect()
            .then(pool => {
                console.log("Conectado a SQL Server");
                return pool;
            })
            .catch(error => {
                poolPromise = undefined;
                console.error("Error conectando a SQL Server:", error);
                throw error;
            });
    }

    return poolPromise;
}

module.exports = {
    sql,
    obtenerPool
};