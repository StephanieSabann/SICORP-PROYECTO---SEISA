const repository = require("../repositories/roles.repository");

async function obtenerTodos() {
    return repository.obtenerTodosLosRoles();
}

async function obtenerAccesosPorRolId(idRol) {
    if (!Number.isInteger(idRol) || idRol <= 0) {
        throw new Error("El ID del rol no es válido.");
    }

    return repository.obtenerAccesosPorRolId(idRol);
}

module.exports = {
    obtenerTodos,
    obtenerAccesosPorRolId
};
