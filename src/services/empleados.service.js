const repository = require("../repositories/empleados.repository");

async function obtenerTodos() {
    return repository.obtenerTodos();
}

module.exports = {
    obtenerTodos
};