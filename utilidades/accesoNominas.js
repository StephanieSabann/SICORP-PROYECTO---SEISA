/* ============================================================
   Permiso del módulo de Nóminas (se valida en el BACKEND).
   El acceso del catálogo puede llamarse "Nóminas" o "Nominas".
   ============================================================ */
const normalizar = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function tieneAccesoNominas(nombresAcceso) {
    return (nombresAcceso || []).some(n => ["nominas", "nomina"].includes(normalizar(n)));
}

/* obtenerAccesos(req) → Promise<string[]> con los accesos del rol de quien pide. */
function crearMiddlewareAccesoNominas(obtenerAccesos) {
    return async function requiereAccesoNominas(req, res, next) {
        try {
            if (tieneAccesoNominas(await obtenerAccesos(req))) return next();
            res.status(403).json({ exito: false, mensaje: "Tu rol no tiene acceso al módulo de Nóminas." });
        } catch (error) {
            console.error('Error verificando el acceso a "Nóminas":', error);
            res.status(500).json({ exito: false, mensaje: "Error al verificar el acceso." });
        }
    };
}

module.exports = { tieneAccesoNominas, crearMiddlewareAccesoNominas };
