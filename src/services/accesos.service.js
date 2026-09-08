const repository = require("../repositories/catalogo-acceso.repository");

async function obtenerTodos() {
    return repository.obtenerTodos();
}

module.exports = {
    obtenerTodos
};
