const sql = require("mssql");

const dbConfig = {
    user: "sa",
    password: "PASS",
    server: "IPV4",
    port: 51433,
    database: "DB",

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