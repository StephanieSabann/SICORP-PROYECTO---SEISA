const sql = require("mssql");

const config = {
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

async function probarConexion() {
    try {
        console.log("Intentando conectar a SQL Server...");

        const pool = await sql.connect(config);

        console.log("Conexión exitosa a SQL Server");

        const resultado = await pool.request().query(`
            SELECT
                @@SERVERNAME AS Servidor,
                @@SERVICENAME AS Instancia,
                DB_NAME() AS BaseDeDatos,
                SUSER_SNAME() AS UsuarioSQL
        `);

        console.log("Información de la conexión:");
        console.table(resultado.recordset);

        await pool.close();

    } catch (error) {
        console.error("Error de conexión:");
        console.error(error);
    }
}

probarConexion();