const sql = require("mssql");

const dbConfig = {
    user: "sa",
    password: "HolaKoishi",
    server: "127.0.0.1",
    port: 1433,
    database: "Seisa",

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

const poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(pool => {
        console.log("Conectado a SQL Server");
        return pool;
    })
    .catch(error => {
        console.error("Error conectando a SQL Server:", error);
        throw error;
    });

module.exports = {
    sql,
    poolPromise
};