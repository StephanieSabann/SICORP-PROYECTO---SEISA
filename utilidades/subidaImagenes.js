const multer = require("multer");
const path = require("path");
const fs = require("fs");

/* ============================================================
   Subida de imágenes del módulo de Inventario.
   ------------------------------------------------------------
   Hay dos tipos de imagen, cada una en su propia carpeta dentro
   de "public" (así express.static ya las sirve sin configurar
   nada extra):

     - Recursos individuales  -> public/img/recursos/
     - Categorías (EPP, Herramientas, Equipos, Uniformes...)
                               -> public/img/categorias/

   En ambos casos se guarda la RUTA RELATIVA (ej. "img/recursos/
   REC-001-1733500000000.jpg") en la base de datos — el archivo en
   sí queda guardado de verdad en disco, no es nada decorativo.
   ============================================================ */

const CARPETA_RECURSOS = path.join(__dirname, "..", "public", "img", "recursos");
const CARPETA_CATEGORIAS = path.join(__dirname, "..", "public", "img", "categorias");

[CARPETA_RECURSOS, CARPETA_CATEGORIAS].forEach(carpeta => {
    if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true });
});

const TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function filtroArchivo(req, file, cb) {
    if (!TIPOS_PERMITIDOS.includes(file.mimetype)) {
        return cb(new Error("La imagen debe ser JPG, PNG, WEBP o GIF."));
    }
    cb(null, true);
}

/* Envuelve el middleware de multer para que sus errores (tipo de
   archivo inválido, archivo muy pesado) salgan como JSON con el
   mismo formato que el resto de la API, en vez de romper con HTML. */
function envolver(subir) {
    return function middlewareImagen(req, res, next) {
        subir(req, res, (error) => {
            if (error) {
                return res.status(400).json({ exito: false, mensaje: error.message || "No se pudo subir la imagen." });
            }
            next();
        });
    };
}

/* ---------------- Imagen de un recurso individual ---------------- */
const almacenamientoRecurso = multer.diskStorage({
    destination: (req, file, cb) => cb(null, CARPETA_RECURSOS),
    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase() || ".jpg";
        const base = (req.body.codigo || "recurso").toString().trim().toUpperCase().replace(/[^A-Z0-9-]/g, "") || "RECURSO";
        cb(null, `${base}-${Date.now()}${extension}`);
    }
});

const middlewareImagenRecurso = envolver(
    multer({ storage: almacenamientoRecurso, fileFilter: filtroArchivo, limits: { fileSize: 5 * 1024 * 1024 } }).single("imagen")
);

function rutaPublicaDeArchivo(file) {
    if (!file) return null;
    return `img/recursos/${file.filename}`;
}

/* ---------------- Imagen de una categoría ---------------- */
const almacenamientoCategoria = multer.diskStorage({
    destination: (req, file, cb) => cb(null, CARPETA_CATEGORIAS),
    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase() || ".jpg";
        const id = (req.params.id || "categoria").toString().replace(/[^A-Za-z0-9-]/g, "");
        cb(null, `CAT-${id}-${Date.now()}${extension}`);
    }
});

const middlewareImagenCategoria = envolver(
    multer({ storage: almacenamientoCategoria, fileFilter: filtroArchivo, limits: { fileSize: 5 * 1024 * 1024 } }).single("imagen")
);

function rutaPublicaDeArchivoCategoria(file) {
    if (!file) return null;
    return `img/categorias/${file.filename}`;
}

module.exports = {
    middlewareImagenRecurso, rutaPublicaDeArchivo,
    middlewareImagenCategoria, rutaPublicaDeArchivoCategoria
};
