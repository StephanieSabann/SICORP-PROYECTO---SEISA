const model = require("../modelos/recursos.model");
const { rutaPublicaDeArchivo, rutaPublicaDeArchivoCategoria } = require("../utilidades/subidaImagenes");

function validarTexto(valor, campo, maximo) {
    const limpio = (valor || "").toString().trim();
    if (!limpio) throw new Error(`Escribe ${campo}.`);
    if (limpio.length > maximo) throw new Error(`${campo} no puede superar los ${maximo} caracteres.`);
    return limpio;
}

function validarColor(valor) {
    const limpio = (valor || "").toString().trim();
    if (!limpio) return null;
    if (!/^#[0-9a-fA-F]{6}$/.test(limpio)) throw new Error("El color debe tener el formato #RRGGBB.");
    return limpio.toUpperCase();
}

const ESTADOS_FISICOS = ["Nuevo", "Usado", "Semi-nuevo"];

/* El mensaje real del error se manda junto al genérico: así, si algo
   falla en la base de datos, se ve en pantalla QUÉ falló (por ejemplo
   "Invalid object name 'Recurso'") en vez de un aviso que no ayuda. */
function errorServidor(res, texto, error) {
    console.error(texto, error);
    res.status(500).json({ exito: false, mensaje: `${texto} (${error.message})` });
}

/* ======================= CATEGORÍAS ======================= */

async function obtenerCategorias(req, res) {
    try {
        const categorias = await model.obtenerCategorias();
        res.status(200).json({ exito: true, datos: categorias });
    } catch (error) {
        errorServidor(res, "No se pudieron obtener las categorías.", error);
    }
}

async function crearCategoria(req, res) {
    try {
        const nombre = validarTexto(req.body.nombre, "el nombre de la categoría", 50);
        const color = validarColor(req.body.color);
        const imagen = rutaPublicaDeArchivoCategoria(req.file);
        const creada = await model.crearCategoria({ nombre, color, imagen });
        res.status(201).json({ exito: true, mensaje: `Categoría "${creada.nombre}" creada correctamente.`, datos: creada });
    } catch (error) {
        console.error("Error al crear la categoría:", error);
        const duplicado = /violation of unique|duplicate key/i.test(error.message || "");
        res.status(400).json({ exito: false, mensaje: duplicado ? "Ya existe una categoría con ese nombre." : error.message });
    }
}

async function actualizarCategoria(req, res) {
    try {
        const id = Number(req.params.id);
        const actual = await model.obtenerCategoriaPorId(id);
        if (!actual) return res.status(404).json({ exito: false, mensaje: "No se encontró esa categoría." });

        const nombre = validarTexto(req.body.nombre ?? actual.nombre, "el nombre de la categoría", 50);
        const color = req.body.color !== undefined ? validarColor(req.body.color) : actual.color;
        const imagen = rutaPublicaDeArchivoCategoria(req.file);
        const actualizada = await model.actualizarCategoria(id, { nombre, color, imagen });
        res.status(200).json({ exito: true, mensaje: "Categoría actualizada.", datos: actualizada });
    } catch (error) {
        console.error("Error al actualizar la categoría:", error);
        const duplicado = /violation of unique|duplicate key/i.test(error.message || "");
        res.status(400).json({ exito: false, mensaje: duplicado ? "Ya existe una categoría con ese nombre." : error.message });
    }
}

/* Sube o reemplaza solo la imagen de una categoría. */
async function subirImagenCategoria(req, res) {
    try {
        const id = Number(req.params.id);
        if (!req.file) {
            return res.status(400).json({ exito: false, mensaje: "Selecciona una imagen para subir." });
        }
        const actualizada = await model.actualizarImagenCategoria(id, rutaPublicaDeArchivoCategoria(req.file));
        if (!actualizada) {
            return res.status(404).json({ exito: false, mensaje: "No se encontró esa categoría." });
        }
        res.status(200).json({ exito: true, mensaje: "Imagen de la categoría actualizada.", datos: actualizada });
    } catch (error) {
        console.error("Error al subir la imagen de la categoría:", error);
        res.status(400).json({ exito: false, mensaje: error.message || "No se pudo subir la imagen." });
    }
}

async function eliminarCategoria(req, res) {
    try {
        await model.eliminarCategoria(Number(req.params.id));
        res.status(200).json({ exito: true, mensaje: "Categoría eliminada." });
    } catch (error) {
        console.error("Error al eliminar la categoría:", error);
        res.status(400).json({ exito: false, mensaje: error.message });
    }
}

/* ======================= RESUMEN Y RECURSOS ======================= */

async function obtenerResumen(req, res) {
    try {
        const [general, porCategoria, recientes] = await Promise.all([
            model.obtenerResumenGeneral(),
            model.obtenerResumenPorCategoria(),
            model.obtenerRecientes(5)
        ]);
        res.status(200).json({ exito: true, datos: { general, porCategoria, recientes } });
    } catch (error) {
        errorServidor(res, "No se pudo obtener el resumen de inventario.", error);
    }
}

async function obtenerTodos(req, res) {
    try {
        const resultado = await model.obtenerTodos({
            texto: (req.query.texto || "").trim(),
            id_categoria: req.query.id_categoria ? Number(req.query.id_categoria) : null,
            disponibilidad: req.query.disponibilidad,
            pagina: req.query.pagina,
            porPagina: req.query.porPagina
        });
        res.status(200).json({ exito: true, ...resultado });
    } catch (error) {
        errorServidor(res, "No se pudieron obtener los recursos.", error);
    }
}

async function obtenerUno(req, res) {
    try {
        const recurso = await model.obtenerPorId(Number(req.params.id));
        if (!recurso) return res.status(404).json({ exito: false, mensaje: "No se encontró ese recurso." });
        res.status(200).json({ exito: true, datos: recurso });
    } catch (error) {
        errorServidor(res, "No se pudo obtener el recurso.", error);
    }
}

async function obtenerParaSelect(req, res) {
    try {
        const recursos = await model.obtenerParaSelect();
        res.status(200).json({ exito: true, datos: recursos });
    } catch (error) {
        errorServidor(res, "No se pudieron obtener los recursos.", error);
    }
}

async function obtenerSiguienteCodigo(req, res) {
    try {
        const codigo = await model.siguienteCodigo();
        res.status(200).json({ exito: true, datos: { codigo } });
    } catch (error) {
        errorServidor(res, "No se pudo generar el código.", error);
    }
}

async function obtenerEmpleados(req, res) {
    try {
        const empleados = await model.obtenerEmpleadosActivos();
        res.status(200).json({ exito: true, datos: empleados });
    } catch (error) {
        errorServidor(res, "No se pudieron obtener los empleados.", error);
    }
}

async function crear(req, res) {
    try {
        const codigo = validarTexto(req.body.codigo, "el código", 10).toUpperCase();
        const nombre = validarTexto(req.body.nombre, "el nombre del recurso", 100);
        const id_categoria = Number(req.body.id_categoria);
        const cantidad_total = Number(req.body.cantidad_total);
        const cantidad_minima = Number(req.body.cantidad_minima) || 0;
        const estado_fisico = req.body.estado_fisico || "Nuevo";

        if (!Number.isInteger(id_categoria) || id_categoria <= 0) throw new Error("Selecciona una categoría.");
        if (!Number.isInteger(cantidad_total) || cantidad_total < 0) throw new Error("La cantidad total debe ser un número válido.");
        if (!Number.isInteger(cantidad_minima) || cantidad_minima < 0) throw new Error("La existencia mínima debe ser un número válido.");
        if (!ESTADOS_FISICOS.includes(estado_fisico)) throw new Error("El estado físico no es válido.");

        const imagen = rutaPublicaDeArchivo(req.file);
        const creado = await model.crear({ codigo, nombre, id_categoria, cantidad_total, cantidad_minima, estado_fisico, imagen });
        res.status(201).json({ exito: true, mensaje: `Recurso ${creado.codigo} registrado correctamente.`, datos: creado });
    } catch (error) {
        console.error("Error al crear el recurso:", error);
        const duplicado = /violation of unique|duplicate key/i.test(error.message || "");
        res.status(400).json({ exito: false, mensaje: duplicado ? "Ya existe un recurso con ese código." : error.message });
    }
}

async function actualizar(req, res) {
    try {
        const id = Number(req.params.id);
        const nombre = validarTexto(req.body.nombre, "el nombre del recurso", 100);
        const id_categoria = Number(req.body.id_categoria);
        const cantidad_minima = Number(req.body.cantidad_minima) || 0;
        const estado_fisico = req.body.estado_fisico || "Nuevo";

        if (!Number.isInteger(id_categoria) || id_categoria <= 0) throw new Error("Selecciona una categoría.");
        if (!ESTADOS_FISICOS.includes(estado_fisico)) throw new Error("El estado físico no es válido.");

        const actualizado = await model.actualizar(id, {
            nombre, id_categoria, cantidad_minima, estado_fisico,
            imagen: rutaPublicaDeArchivo(req.file),
            quitarImagen: req.body.quitar_imagen === "1" || req.body.quitar_imagen === true
        });
        if (!actualizado) return res.status(404).json({ exito: false, mensaje: "No se encontró ese recurso." });
        res.status(200).json({ exito: true, mensaje: "Recurso actualizado correctamente.", datos: actualizado });
    } catch (error) {
        console.error("Error al actualizar el recurso:", error);
        res.status(400).json({ exito: false, mensaje: error.message });
    }
}

async function eliminar(req, res) {
    try {
        await model.eliminar(Number(req.params.id));
        res.status(200).json({ exito: true, mensaje: "Recurso eliminado del catálogo." });
    } catch (error) {
        console.error("Error al eliminar el recurso:", error);
        res.status(400).json({ exito: false, mensaje: "No se pudo eliminar el recurso." });
    }
}

/* Sube o reemplaza la imagen de un recurso que ya existe (desde el
   menú "⋮" de la tabla de Recursos). */
async function subirImagen(req, res) {
    try {
        const id = Number(req.params.id);
        if (!req.file) {
            return res.status(400).json({ exito: false, mensaje: "Selecciona una imagen para subir." });
        }
        const actualizado = await model.actualizarImagen(id, rutaPublicaDeArchivo(req.file));
        if (!actualizado) {
            return res.status(404).json({ exito: false, mensaje: "No se encontró ese recurso." });
        }
        res.status(200).json({ exito: true, mensaje: "Imagen actualizada.", datos: actualizado });
    } catch (error) {
        errorServidor(res, "No se pudo subir la imagen.", error);
    }
}

module.exports = {
    obtenerCategorias, crearCategoria, actualizarCategoria, subirImagenCategoria, eliminarCategoria,
    obtenerResumen, obtenerTodos, obtenerUno, obtenerParaSelect, obtenerSiguienteCodigo,
    obtenerEmpleados, crear, actualizar, eliminar, subirImagen
};
