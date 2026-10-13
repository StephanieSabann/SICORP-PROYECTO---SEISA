const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

/* ============================================================
   Archivos de EEGSA importados en Nóminas.
   Se guardan en almacen/nominas (FUERA de "public"): no se pueden
   descargar escribiendo una URL ni se expone la ruta del servidor.
   El nombre se limpia y se le agrega un identificador único.
   ============================================================ */

function crearAlmacen(carpeta = path.join(__dirname, "..", "almacen", "nominas")) {
    const asegurar = fs.mkdir(carpeta, { recursive: true });

    function limpiarNombre(nombre) {
        const base = path.basename(String(nombre || "archivo"))
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_").slice(-80);
        return base || "archivo.xlsx";
    }

    return {
        carpeta,
        limpiarNombre,
        async guardar(buffer, nombreOriginal) {
            await asegurar;
            const nombre = `EEGSA-${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${limpiarNombre(nombreOriginal)}`;
            await fs.writeFile(path.join(carpeta, nombre), buffer, { flag: "wx" });
            return nombre;
        },
        async eliminar(nombreGuardado) {
            if (!nombreGuardado) return;
            const seguro = path.basename(nombreGuardado);   // nunca sale de la carpeta
            await fs.unlink(path.join(carpeta, seguro)).catch(e => { if (e.code !== "ENOENT") throw e; });
        }
    };
}

module.exports = { crearAlmacen };
