function verificarSesion(req, res, next) {

    if (!req.session || !req.session.usuario) {

        return res.status(401).json({
            exito: false,
            mensaje: "No tienes una sesión activa."
        });
    }

    next();
}

module.exports = verificarSesion;