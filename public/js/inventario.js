/* ============================================================
   SICORP — SEISA · módulo de INVENTARIO
   ------------------------------------------------------------
   Usa el api() de comun.js (estilo fetch: api(url, {method, body}))
   — a propósito NO se vuelve a definir api() aquí.
   ============================================================ */

let categorias = [];            // catálogo de categorías (id, nombre, color, imagen)
let resumenCategorias = [];     // categorías + conteos (para las tarjetas)
let totalUnidades = 0;          // para la tarjeta "Todos"
let recursosSelect = [];        // catálogo completo, para los <select> y la vista previa
let empleadosInv = [];
let paginaRecursos = 1;
let paginaHistorial = 1;
let categoriaFiltro = '';       // '' = Todos
let origenEntrada = 'EEGSA';
let origenEntrega = 'EEGSA';
let condicionDevolucion = 'Buen estado';
let entregaSeleccionada = null; // la "asignación" elegida en Devolución
let recursoEditando = null;     // null = registrando uno nuevo
let archivoImagenRecurso = null;
let quitarImagenRecurso = false;

const POR_PAGINA_RECURSOS = 8;
const hoyISO = () => new Date().toISOString().slice(0, 10);
const miles = n => Number(n || 0).toLocaleString('en-US');

/* ============================================================
   Encabezado de cada pestaña (migas + título + subtítulo)
   ============================================================ */
const TITULOS_VISTA = {
  'v-resumen':      { migas: ['Inventario'], titulo: 'Control de inventario', sub: 'Administra los recursos asignados al personal de SEISA.' },
  'v-recursos':     { migas: ['Inventario', 'Recursos'], titulo: 'Recursos y existencias', sub: 'Consulta la disponibilidad y asignación de los recursos.' },
  'v-nuevo-recurso':{ migas: ['Inventario', 'Recursos', 'Nuevo recurso'], titulo: 'Registrar recurso', sub: 'Agrega un nuevo recurso al catálogo, con su imagen.' },
  'v-entrada':      { migas: ['Inventario', 'Entrada'], titulo: 'Registrar entrada', sub: 'Suma existencias nuevas al inventario.' },
  'v-entrega':      { migas: ['Inventario', 'Entrega'], titulo: 'Entregar recurso', sub: 'Asigna un recurso a un trabajador.' },
  'v-devolucion':   { migas: ['Inventario', 'Devolución'], titulo: 'Registrar devolución', sub: 'Regresa un recurso asignado a las existencias.' },
  'v-conteos':      { migas: ['Inventario', 'Conteos / Historial'], titulo: 'Conteos y movimientos', sub: 'Reconciliación física del inventario e historial completo.' }
};
const VISTA_DE_MIGA = { 'Inventario': 'v-resumen', 'Recursos': 'v-recursos' };

function pintarEncabezado(idVista) {
  const datos = { ...TITULOS_VISTA[idVista] };
  if (idVista === 'v-nuevo-recurso' && recursoEditando) {
    datos.migas = ['Inventario', 'Recursos', 'Editar recurso'];
    datos.titulo = 'Editar recurso';
    datos.sub = `${recursoEditando.codigo} · ${recursoEditando.nombre}`;
  }
  const migas = document.getElementById('migasInv');
  const partes = ['<button data-ir="inicio">Inicio</button>'];
  datos.migas.forEach((m, i) => {
    const ultima = i === datos.migas.length - 1;
    partes.push(ultima
      ? `<span class="actual">${escapar(m)}</span>`
      : `<button data-ir-vista="${VISTA_DE_MIGA[m] || 'v-resumen'}">${escapar(m)}</button>`);
  });
  migas.innerHTML = partes.join(' / ');
  migas.querySelector('[data-ir="inicio"]').addEventListener('click', () => window.location.href = 'inicio.html');
  migas.querySelectorAll('[data-ir-vista]').forEach(b => b.addEventListener('click', () => irA(b.dataset.irVista)));

  document.getElementById('tituloInv').textContent = datos.titulo;
  document.getElementById('subInv').textContent = datos.sub;
  document.getElementById('btnNuevoRecurso').hidden = idVista !== 'v-recursos';
}

/* ============================================================
   Navegación entre vistas
   ============================================================ */
function irA(idVista) {
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('is-active', v.id === idVista));
  /* "Nuevo recurso" no tiene pestaña propia: deja marcada "Recursos". */
  const idTab = idVista === 'v-nuevo-recurso' ? 'v-recursos' : idVista;
  document.querySelectorAll('#tabsInventario .tab-inv').forEach(t => t.classList.toggle('is-on', t.dataset.irVista === idTab));
  pintarEncabezado(idVista);
  cerrarMenus();
  window.scrollTo({ top: 0 });

  if (idVista === 'v-recursos') cargarRecursos();
  if (idVista === 'v-conteos') { cargarConteoActual(); cargarHistorial(); }
}

document.querySelectorAll('[data-ir="inicio"]').forEach(b => {
  b.addEventListener('click', () => window.location.href = 'inicio.html');
});
document.querySelectorAll('[data-ir-vista]').forEach(b => {
  b.addEventListener('click', () => irA(b.dataset.irVista));
});
document.getElementById('btnNuevoRecurso').addEventListener('click', () => abrirFormularioRecurso(null));

/* Buscador de la barra superior: busca en el catálogo de recursos. */
const buscarGlobal = document.getElementById('buscarGlobal');
if (buscarGlobal) {
  buscarGlobal.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    document.getElementById('buscarRecurso').value = buscarGlobal.value.trim();
    paginaRecursos = 1;
    irA('v-recursos');
  });
}

/* ============================================================
   Arranque
   ============================================================ */
(async function iniciar() {
  pintarEncabezado('v-resumen');
  const datos = await sesionActual;
  if (datos && document.getElementById('eResponsable')) {
    document.getElementById('eResponsable').value = datos.nombreCompleto || datos.usuario;
  }

  document.querySelectorAll('input[type="date"]').forEach(input => {
    if (!input.readOnly) input.value = hoyISO();
  });

  await cargarCategorias();
  await cargarResumen();
  await cargarRecursosSelect();
  await cargarEmpleados();

  /* Atajo: inventario.html#recursos abre directo esa pestaña */
  const desdeHash = 'v-' + location.hash.slice(1);
  if (TITULOS_VISTA[desdeHash] && desdeHash !== 'v-nuevo-recurso') irA(desdeHash);
})();

/* ============================================================
   Imágenes: categoría y recurso
   ============================================================ */
const ICONOS_CATEGORIA = {
  'herramientas': '<path d="M14.7 6.3a3.6 3.6 0 0 1-4.7 4.7L4.5 16.5a1.7 1.7 0 0 0 2.4 2.4L12.4 13a3.6 3.6 0 0 1 4.7-4.7l-2.4-2z"/><path d="M9.2 4.4L7.4 3l-2 .6-.6 2 1.4 1.8"/><path d="M19.6 14.8l1.8 1.8-.6 2-2 .6-1.8-1.4"/>',
  'epp': '<path d="M4 16.5h16"/><path d="M5 16.5V14a7 7 0 0 1 14 0v2.5"/><path d="M10 7.3V5.5a2 2 0 0 1 4 0v1.8"/><path d="M3 16.5h18v2H3z"/>',
  'equipos': '<rect x="6" y="3" width="12" height="18" rx="2"/><rect x="8.5" y="5.5" width="7" height="5" rx="1"/><circle cx="12" cy="15.5" r="2.4"/>',
  'uniformes': '<path d="M9 3.5L5 5.5 2.5 10l3 1.5L7 9.5V20.5h10V9.5l1.5 2 3-1.5L19 5.5l-4-2"/><path d="M9 3.5a3 3 0 0 0 6 0"/>',
  'todos': '<rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/>'
};
const ICONO_CATEGORIA_DEFECTO = '<path d="M3 7.5L12 3l9 4.5M3 7.5v9L12 21l9-4.5v-9M3 7.5L12 12l9-4.5M12 12v9"/>';
const COLORES_DEFECTO = ['#4F7DF3', '#22C2B5', '#E3453F', '#A855F7', '#F59E0B', '#EC4899', '#10B981', '#38BDF8'];

function colorCategoria(c, indice = 0) {
  return (c && c.color) || COLORES_DEFECTO[indice % COLORES_DEFECTO.length];
}

/* Ruta pública de una imagen guardada en la BD ("img/recursos/x.jpg"). */
function rutaImagen(ruta) {
  if (!ruta) return '';
  return /^(https?:|data:|\/)/.test(ruta) ? ruta : '/' + ruta;
}

function circuloCategoria(c, clave) {
  const nombre = (clave || (c && c.nombre) || '').toLowerCase();
  const icono = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONOS_CATEGORIA[nombre] || ICONO_CATEGORIA_DEFECTO}</svg>`;
  /* Si la imagen no carga (archivo borrado, ruta mala), se quita sola
     y queda el ícono de la categoría debajo. */
  const imagen = c && c.imagen
    ? `<img src="${escapar(rutaImagen(c.imagen))}" alt="" loading="lazy" onerror="this.remove()">`
    : '';
  return `<span class="cat-circulo">${icono}${imagen}</span>`;
}

const ICONO_CAMARA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l1.4-2.5h5.2L16 7"/><circle cx="12" cy="13.5" r="3.4"/></svg>';

/* Tarjeta de categoría como en el prototipo: círculo con la imagen,
   nombre, número grande del color de la categoría y flecha. */
function tarjetaCategoria(c, { numero, detalle, activo = false, conFoto = true, indice = 0, idAttr = '' } = {}) {
  const color = colorCategoria(c, indice);
  return `
    <div class="cat-inv ${activo ? 'is-on' : ''}" style="--c:${escapar(color)}">
      <button type="button" class="cat-inv-cuerpo" data-cat="${escapar(idAttr)}">
        ${circuloCategoria(c, idAttr === '' ? 'todos' : null)}
        <span class="cat-texto">
          <span>${escapar(c.nombre)}</span>
          <span class="cat-numero"><b>${miles(numero)}</b><i>→</i></span>
          ${detalle ? `<small>${escapar(detalle)}</small>` : ''}
        </span>
      </button>
      ${conFoto && c.id_categoria ? `<button type="button" class="btn-foto-cat" data-foto-cat="${c.id_categoria}" title="Cambiar imagen de ${escapar(c.nombre)}" aria-label="Cambiar imagen de ${escapar(c.nombre)}">${ICONO_CAMARA}</button>` : ''}
    </div>`;
}

function activarBotonesFotoCategoria(caja) {
  caja.querySelectorAll('[data-foto-cat]').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      elegirImagen(archivo => subirImagenCategoria(Number(b.dataset.fotoCat), archivo));
    });
  });
}

/* Abre el selector de archivos del sistema y entrega el archivo elegido. */
function elegirImagen(alElegir) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/gif';
  input.addEventListener('change', () => {
    const archivo = input.files[0];
    if (!archivo) return;
    if (!validarArchivoImagen(archivo)) return;
    alElegir(archivo);
  });
  input.click();
}

function validarArchivoImagen(archivo) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(archivo.type)) {
    avisar('La imagen debe ser JPG, PNG, WEBP o GIF.');
    return false;
  }
  if (archivo.size > 5 * 1024 * 1024) {
    avisar('La imagen pesa más de 5 MB. Elige una más liviana.');
    return false;
  }
  return true;
}

async function subirImagenCategoria(idCategoria, archivo) {
  try {
    const formulario = new FormData();
    formulario.append('imagen', archivo);
    await api('/api/inventario/recursos/categorias/' + idCategoria + '/imagen', { method: 'PATCH', body: formulario, headers: {} });
    avisar('Imagen de la categoría actualizada.');
    await cargarCategorias();
    await cargarResumen();
  } catch (error) {
    avisar(error.message);
  }
}

const ICONO_RECURSO_DEFECTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="8.5" cy="10.5" r="1.6"/><path d="M21 16l-5.5-5.5-3 3L9 10l-6 6"/></svg>';

function miniaturaRecurso(r) {
  if (r && r.imagen) {
    return `<span class="miniatura-recurso con-imagen" data-ver-imagen="${escapar(rutaImagen(r.imagen))}" data-titulo="${escapar(r.nombre)}" title="Ver imagen"><img src="${escapar(rutaImagen(r.imagen))}" alt="${escapar(r.nombre)}" loading="lazy"></span>`;
  }
  return `<span class="miniatura-recurso" title="Sin imagen">${ICONO_RECURSO_DEFECTO}</span>`;
}

/* Clic en una miniatura → la muestra en grande. */
document.addEventListener('click', e => {
  const mini = e.target.closest('[data-ver-imagen]');
  if (!mini) return;
  e.stopPropagation();
  const visor = document.createElement('div');
  visor.className = 'visor-imagen';
  visor.innerHTML = `<figure><img src="${mini.dataset.verImagen}" alt=""><figcaption>${escapar(mini.dataset.titulo || '')}</figcaption></figure>`;
  visor.addEventListener('click', () => visor.remove());
  document.addEventListener('keydown', function cerrar(ev) {
    if (ev.key === 'Escape') { visor.remove(); document.removeEventListener('keydown', cerrar); }
  });
  document.body.appendChild(visor);
});

/* ============================================================
   Categorías
   ============================================================ */
async function cargarCategorias() {
  try {
    const respuesta = await api('/api/inventario/recursos/categorias');
    categorias = respuesta.datos || [];

    const opciones = categorias.map(c => `<option value="${c.id_categoria}">${escapar(c.nombre)}</option>`).join('');
    const llenar = (id, primera) => {
      const select = document.getElementById(id);
      if (!select) return;
      const actual = select.value;
      select.innerHTML = primera + opciones;
      if ([...select.options].some(o => o.value === actual)) select.value = actual;
    };
    llenar('rCategoria', '<option value="">Selecciona una categoría</option>');
    llenar('eCategoria', '<option value="">Todas</option>');
    llenar('gCategoria', '<option value="">Todas</option>');
    llenar('filtroCategoria', '<option value="">Todas las categorías</option>');
  } catch (error) {
    console.error(error);
    avisar('No se pudieron cargar las categorías: ' + error.message);
  }
}

/* ============================================================
   Resumen
   ============================================================ */
function contarMiles(el, meta) {
  const desde = Number(String(el.textContent).replace(/\D/g, '')) || 0;
  if (sinMovimiento || desde === meta) { el.textContent = miles(meta); return; }
  const inicio = performance.now();
  const paso = t => {
    const p = Math.min((t - inicio) / 700, 1);
    el.textContent = miles(Math.round(desde + (meta - desde) * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

async function cargarResumen() {
  try {
    const respuesta = await api('/api/inventario/recursos/resumen');
    const { general, porCategoria, recientes } = respuesta.datos;

    totalUnidades = Number(general.total_unidades) || 0;
    contarMiles(document.getElementById('resTotalRecursos'), totalUnidades);
    contarMiles(document.getElementById('resDisponibles'), Number(general.total_disponibles) || 0);
    contarMiles(document.getElementById('resAsignados'), Number(general.total_asignadas) || 0);

    const porcentaje = totalUnidades > 0 ? Math.round((general.total_disponibles / totalUnidades) * 100) : 0;
    document.getElementById('resBarraDisp').style.width = porcentaje + '%';
    document.getElementById('resPorcentajeDisp').textContent = porcentaje + '%';

    resumenCategorias = porCategoria || [];
    pintarCategoriasResumen();
    pintarFiltrosCategoria();
    pintarRecientes(recientes || []);
  } catch (error) {
    console.error(error);
    document.getElementById('listaRecientes').innerHTML = `<p class="vacio">${escapar(error.message)}</p>`;
    avisar('No se pudo cargar el resumen: ' + error.message);
  }
}

function pintarCategoriasResumen() {
  const caja = document.getElementById('rejillaCategorias');
  if (!caja) return;
  if (!resumenCategorias.length) {
    caja.innerHTML = '<p class="vacio">Todavía no hay categorías. Créalas en Soporte y Mantenimiento → Inventario.</p>';
    return;
  }
  caja.innerHTML = resumenCategorias.map((c, i) => tarjetaCategoria(c, {
    numero: c.total_unidades,
    detalle: `${miles(c.total_disponibles)} disponibles`,
    indice: i,
    idAttr: String(c.id_categoria)
  })).join('');

  caja.querySelectorAll('.cat-inv-cuerpo').forEach(b => {
    b.addEventListener('click', () => {
      categoriaFiltro = b.dataset.cat;
      paginaRecursos = 1;
      sincronizarFiltroCategoria();
      irA('v-recursos');
    });
  });
  activarBotonesFotoCategoria(caja);
}

function estadoExistencia(disponible, minimo) {
  if (disponible <= 0) return { texto: 'Agotado', clase: 'agotado' };
  if (disponible <= minimo) return { texto: 'Existencia baja', clase: 'bajo' };
  return { texto: 'Disponible', clase: 'ok' };
}

function pintarRecientes(lista) {
  const caja = document.getElementById('listaRecientes');
  if (!caja) return;
  if (!lista.length) {
    caja.innerHTML = '<p class="vacio">Todavía no se ha registrado ningún recurso. Usa "Nuevo recurso" en la pestaña Recursos.</p>';
    return;
  }
  caja.innerHTML = lista.map((r, i) => {
    const asignado = r.cantidad_total - r.cantidad_disponible;
    const estado = estadoExistencia(r.cantidad_disponible, r.cantidad_minima);
    return `
      <div class="fila-inv" style="animation-delay:${i * 50}ms">
        <span class="celda-recurso">${miniaturaRecurso(r)}<span class="nombre">${escapar(r.nombre)}</span></span>
        <span class="centro">${miles(r.cantidad_disponible)}</span>
        <span class="centro">${miles(asignado)}</span>
        <span class="centro"><i class="pill-disp ${estado.clase}">${estado.texto}</i></span>
      </div>`;
  }).join('');
}

/* ============================================================
   Recursos y existencias
   ============================================================ */
async function cargarRecursosSelect() {
  try {
    const respuesta = await api('/api/inventario/recursos/select');
    recursosSelect = respuesta.datos || [];
    /* Vuelve a llenar los <select> de Entrada y Entrega con lo nuevo. */
    const eCat = document.getElementById('eCategoria');
    const gCat = document.getElementById('gCategoria');
    if (eCat) llenarSelectRecursoPorCategoria(document.getElementById('eRecurso'), eCat.value);
    if (gCat) llenarSelectRecursoPorCategoria(document.getElementById('gRecurso'), gCat.value);
  } catch (error) {
    console.error(error);
  }
}

async function cargarEmpleados() {
  try {
    const respuesta = await api('/api/inventario/recursos/empleados');
    empleadosInv = respuesta.datos || [];
    const opciones = empleadosInv.map(e => `<option value="${e.codigo_empleado}">${escapar(e.nombre + ' ' + e.apellido)}</option>`).join('');
    const selectEntrega = document.getElementById('gEmpleado');
    if (selectEntrega) selectEntrega.innerHTML = '<option value="">Selecciona un trabajador</option>' + opciones;
    const selectDevolucion = document.getElementById('dEmpleado');
    if (selectDevolucion) selectDevolucion.innerHTML = '<option value="">Todos los trabajadores</option>' + opciones;
  } catch (error) {
    console.error(error);
  }
}

/* Tarjetas de arriba en "Recursos": Todos + una por categoría.
   Funcionan como filtro (igual que el <select> de categorías). */
function pintarFiltrosCategoria() {
  const caja = document.getElementById('filtrosCategoria');
  if (!caja) return;
  const todos = { nombre: 'Todos', color: '#2EE05A' };
  caja.innerHTML =
    tarjetaCategoria(todos, { numero: totalUnidades, activo: categoriaFiltro === '', conFoto: false, idAttr: '' }) +
    resumenCategorias.map((c, i) => tarjetaCategoria(c, {
      numero: c.total_unidades,
      activo: String(categoriaFiltro) === String(c.id_categoria),
      indice: i,
      idAttr: String(c.id_categoria)
    })).join('');

  caja.querySelectorAll('.cat-inv-cuerpo').forEach(b => {
    b.addEventListener('click', () => {
      categoriaFiltro = b.dataset.cat;
      paginaRecursos = 1;
      sincronizarFiltroCategoria();
      cargarRecursos();
    });
  });
  activarBotonesFotoCategoria(caja);
}

function sincronizarFiltroCategoria() {
  const select = document.getElementById('filtroCategoria');
  if (select) select.value = categoriaFiltro;
  document.querySelectorAll('#filtrosCategoria .cat-inv').forEach(t => {
    t.classList.toggle('is-on', t.querySelector('.cat-inv-cuerpo').dataset.cat === String(categoriaFiltro));
  });
}

const buscarRecurso = document.getElementById('buscarRecurso');
const filtroDisponibilidad = document.getElementById('filtroDisponibilidad');
const filtroCategoria = document.getElementById('filtroCategoria');
let temporizadorBusqueda;

buscarRecurso.addEventListener('input', () => {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(() => { paginaRecursos = 1; cargarRecursos(); }, 320);
});
filtroDisponibilidad.addEventListener('change', () => { paginaRecursos = 1; cargarRecursos(); });
filtroCategoria.addEventListener('change', () => {
  categoriaFiltro = filtroCategoria.value;
  paginaRecursos = 1;
  sincronizarFiltroCategoria();
  cargarRecursos();
});

async function cargarRecursos() {
  try {
    const parametros = new URLSearchParams({ pagina: paginaRecursos, porPagina: POR_PAGINA_RECURSOS });
    if (buscarRecurso.value.trim()) parametros.set('texto', buscarRecurso.value.trim());
    if (categoriaFiltro) parametros.set('id_categoria', categoriaFiltro);
    if (filtroDisponibilidad.value) parametros.set('disponibilidad', filtroDisponibilidad.value);

    const respuesta = await api('/api/inventario/recursos?' + parametros.toString());
    pintarTablaRecursos(respuesta.datos);

    document.getElementById('sinRecursos').hidden = respuesta.datos.length > 0;
    const desde = respuesta.total ? (respuesta.pagina - 1) * respuesta.porPagina + 1 : 0;
    const hasta = (respuesta.pagina - 1) * respuesta.porPagina + respuesta.datos.length;
    document.getElementById('mostrandoRecursos').textContent =
      respuesta.total ? `Mostrando ${desde}-${hasta} de ${miles(respuesta.total)} recursos` : '';

    pintarPaginacion(
      document.getElementById('paginacionRecursos'),
      respuesta.pagina, Math.max(1, Math.ceil(respuesta.total / respuesta.porPagina)), respuesta.total,
      (n) => { paginaRecursos = n; cargarRecursos(); }
    );
  } catch (error) {
    console.error(error);
    document.getElementById('listaRecursos').innerHTML = '';
    const vacio = document.getElementById('sinRecursos');
    vacio.textContent = error.message;
    vacio.hidden = false;
    avisar('No se pudieron cargar los recursos: ' + error.message);
  }
}

function pintarTablaRecursos(lista) {
  const caja = document.getElementById('listaRecursos');
  document.getElementById('sinRecursos').textContent = 'No hay recursos que coincidan con la búsqueda.';
  caja.innerHTML = lista.map((r, i) => {
    const disp = estadoExistencia(r.cantidad_disponible, r.cantidad_minima);
    const indiceCat = categorias.findIndex(c => c.id_categoria === r.id_categoria);
    const color = r.categoria_color || colorCategoria(null, Math.max(0, indiceCat));
    return `
      <div class="fila-inv" data-id="${r.id_recurso}" style="animation-delay:${i * 40}ms">
        <span>${escapar(r.codigo)}</span>
        <span class="celda-recurso">${miniaturaRecurso(r)}<span class="nombre">${escapar(r.nombre)}</span></span>
        <span class="centro"><i class="pill-cat" style="--c:${escapar(color)}">${escapar(r.categoria)}</i></span>
        <span class="centro">${miles(r.cantidad_total)}</span>
        <span class="centro ${disp.clase !== 'ok' ? 'num-bajo' : ''}">${miles(r.cantidad_disponible)}</span>
        <span class="centro">${escapar(r.estado_fisico)}</span>
        <span class="centro">${miles(r.cantidad_minima)}</span>
        <span class="centro"><i class="pill-disp ${disp.clase}">${disp.texto}</i></span>
        <span class="der menu-fila"><button class="puntos" aria-haspopup="true" aria-expanded="false" aria-label="Acciones de ${escapar(r.nombre)}">⋮</button></span>
      </div>`;
  }).join('');

  caja.querySelectorAll('.puntos').forEach(boton => {
    boton.addEventListener('click', e => {
      e.stopPropagation();
      const id = Number(boton.closest('.fila-inv').dataset.id);
      const recurso = lista.find(r => r.id_recurso === id);
      abrirMenuAcciones(boton, [
        { texto: 'Editar recurso', accion: () => abrirFormularioRecurso(recurso) },
        { texto: recurso.imagen ? 'Cambiar imagen' : 'Subir imagen', accion: () => elegirImagen(archivo => subirImagenRecurso(id, archivo)) },
        {
          texto: 'Eliminar recurso', peligro: true, accion: () => {
            confirmar('¿Eliminar este recurso?', `"${recurso.nombre}" se quitará del catálogo de inventario.`, 'Eliminar', async () => {
              try {
                await api('/api/inventario/recursos/' + id, { method: 'DELETE' });
                avisar('Recurso eliminado.');
                cargarRecursos();
                cargarResumen();
                cargarRecursosSelect();
              } catch (error) {
                avisar(error.message);
              }
            });
          }
        }
      ]);
    });
  });
}

async function subirImagenRecurso(idRecurso, archivo) {
  try {
    const formulario = new FormData();
    formulario.append('imagen', archivo);
    await api('/api/inventario/recursos/' + idRecurso + '/imagen', { method: 'PATCH', body: formulario, headers: {} });
    avisar('Imagen del recurso actualizada.');
    cargarRecursos();
    cargarResumen();
    cargarRecursosSelect();
  } catch (error) {
    avisar(error.message);
  }
}

/* ============================================================
   Nuevo / editar recurso (con imagen)
   ============================================================ */
const formRecurso = document.getElementById('formRecurso');
const rImagen = document.getElementById('rImagen');
const zonaImagen = document.getElementById('zonaImagenRecurso');
const previaImagenRecurso = document.getElementById('previaImagenRecurso');
const btnQuitarImagen = document.getElementById('btnQuitarImagen');

function mostrarPreviaImagen(src) {
  if (src) {
    previaImagenRecurso.innerHTML = `<img src="${escapar(src)}" alt="Vista previa">`;
    zonaImagen.classList.add('con-imagen');
    btnQuitarImagen.hidden = false;
  } else {
    previaImagenRecurso.innerHTML = '';
    zonaImagen.classList.remove('con-imagen');
    btnQuitarImagen.hidden = true;
  }
}

function tomarArchivoImagen(archivo) {
  if (!archivo || !validarArchivoImagen(archivo)) return;
  archivoImagenRecurso = archivo;
  quitarImagenRecurso = false;
  const lector = new FileReader();
  lector.onload = () => mostrarPreviaImagen(lector.result);
  lector.readAsDataURL(archivo);
}

rImagen.addEventListener('change', () => { tomarArchivoImagen(rImagen.files[0]); rImagen.value = ''; });
['dragenter', 'dragover'].forEach(ev => zonaImagen.addEventListener(ev, e => { e.preventDefault(); zonaImagen.classList.add('arrastrando'); }));
['dragleave', 'drop'].forEach(ev => zonaImagen.addEventListener(ev, e => { e.preventDefault(); zonaImagen.classList.remove('arrastrando'); }));
zonaImagen.addEventListener('drop', e => tomarArchivoImagen(e.dataTransfer.files[0]));
btnQuitarImagen.addEventListener('click', () => {
  archivoImagenRecurso = null;
  quitarImagenRecurso = !!(recursoEditando && recursoEditando.imagen);
  mostrarPreviaImagen(null);
});

async function abrirFormularioRecurso(recurso) {
  recursoEditando = recurso || null;
  archivoImagenRecurso = null;
  quitarImagenRecurso = false;
  formRecurso.reset();
  formRecurso.querySelectorAll('.campo.mal').forEach(c => c.classList.remove('mal'));

  const rCodigo = document.getElementById('rCodigo');
  const rCantidad = document.getElementById('rCantidad');
  document.getElementById('notaEdicion').hidden = !recurso;
  document.getElementById('textoGuardarRecurso').textContent = recurso ? 'Guardar cambios' : 'Registrar recurso';
  rCodigo.readOnly = !!recurso;
  rCantidad.readOnly = !!recurso;

  if (recurso) {
    rCodigo.value = recurso.codigo;
    document.getElementById('rNombre').value = recurso.nombre;
    document.getElementById('rCategoria').value = recurso.id_categoria;
    rCantidad.value = recurso.cantidad_total;
    document.getElementById('rMinimo').value = recurso.cantidad_minima;
    document.getElementById('rEstado').value = recurso.estado_fisico;
    mostrarPreviaImagen(recurso.imagen ? rutaImagen(recurso.imagen) : null);
  } else {
    mostrarPreviaImagen(null);
    if (categoriaFiltro) document.getElementById('rCategoria').value = categoriaFiltro;
    try {
      const r = await api('/api/inventario/recursos/siguiente-codigo');
      if (!rCodigo.value) rCodigo.value = r.datos.codigo;
    } catch (_) { /* si falla, se escribe a mano */ }
  }
  irA('v-nuevo-recurso');
}

formRecurso.addEventListener('submit', async e => {
  e.preventDefault();
  const campos = {
    codigo: document.getElementById('rCodigo'),
    nombre: document.getElementById('rNombre'),
    id_categoria: document.getElementById('rCategoria'),
    cantidad_total: document.getElementById('rCantidad')
  };
  let valido = true;
  Object.values(campos).forEach(c => {
    const malo = !String(c.value).trim();
    c.closest('.campo').classList.toggle('mal', malo);
    if (malo) valido = false;
  });
  if (!valido) return;

  const boton = document.getElementById('btnGuardarRecurso');
  boton.disabled = true;
  try {
    const formulario = new FormData();
    /* El código va primero: el servidor lo usa para nombrar el archivo de la imagen. */
    formulario.append('codigo', campos.codigo.value.trim().toUpperCase());
    formulario.append('nombre', campos.nombre.value.trim());
    formulario.append('id_categoria', campos.id_categoria.value);
    formulario.append('cantidad_total', campos.cantidad_total.value);
    formulario.append('cantidad_minima', document.getElementById('rMinimo').value || '0');
    formulario.append('estado_fisico', document.getElementById('rEstado').value);
    if (quitarImagenRecurso) formulario.append('quitar_imagen', '1');
    if (archivoImagenRecurso) formulario.append('imagen', archivoImagenRecurso);

    const respuesta = recursoEditando
      ? await api('/api/inventario/recursos/' + recursoEditando.id_recurso, { method: 'PUT', body: formulario, headers: {} })
      : await api('/api/inventario/recursos', { method: 'POST', body: formulario, headers: {} });

    mostrarOk(recursoEditando ? 'Recurso actualizado' : 'Recurso registrado', respuesta.mensaje);
    recursoEditando = null;
    archivoImagenRecurso = null;
    formRecurso.reset();
    mostrarPreviaImagen(null);
    await cargarCategorias();
    await cargarRecursosSelect();
    await cargarResumen();
    irA('v-recursos');
  } catch (error) {
    avisar(error.message);
  } finally {
    boton.disabled = false;
  }
});

/* ============================================================
   Modal genérico de "listo" (reemplaza el texto cada vez)
   ============================================================ */
function mostrarOk(titulo, texto) {
  document.getElementById('tituloOk').textContent = titulo;
  document.getElementById('textoOk').textContent = texto;
  abrirModal('modalOk');
}
document.getElementById('btnAceptarOk').addEventListener('click', () => cerrarModal('modalOk'));

/* ============================================================
   ENTRADA
   ============================================================ */
const eCategoria = document.getElementById('eCategoria');
const eRecurso = document.getElementById('eRecurso');

function llenarSelectRecursoPorCategoria(select, idCategoria) {
  const filtrados = idCategoria ? recursosSelect.filter(r => String(r.id_categoria) === String(idCategoria)) : recursosSelect;
  const actual = select.value;
  select.innerHTML = '<option value="">Selecciona un recurso</option>' +
    filtrados.map(r => `<option value="${r.id_recurso}">${escapar(r.codigo)} — ${escapar(r.nombre)}</option>`).join('');
  if (filtrados.some(r => String(r.id_recurso) === actual)) select.value = actual;
}

eCategoria.addEventListener('change', () => { llenarSelectRecursoPorCategoria(eRecurso, eCategoria.value); calcularPreviewEntrada(); });
llenarSelectRecursoPorCategoria(eRecurso, '');

document.getElementById('eOrigenToggle').querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => {
    document.getElementById('eOrigenToggle').querySelectorAll('button').forEach(x => x.classList.remove('is-on'));
    b.classList.add('is-on');
    origenEntrada = b.dataset.origen;
    calcularPreviewEntrada();
  });
});

['eRecurso', 'eCantidad', 'eFecha'].forEach(id => {
  document.getElementById(id).addEventListener('input', calcularPreviewEntrada);
  document.getElementById(id).addEventListener('change', calcularPreviewEntrada);
});

function calcularPreviewEntrada() {
  const recurso = recursosSelect.find(r => String(r.id_recurso) === eRecurso.value);
  const cantidad = Number(document.getElementById('eCantidad').value) || 0;

  document.getElementById('pvEntradaRecurso').textContent = recurso ? recurso.nombre : '—';
  document.getElementById('pvEntradaCategoria').textContent = recurso ? recurso.categoria : '—';
  document.getElementById('pvEntradaOrigen').textContent = origenEntrada;
  document.getElementById('pvEntradaFecha').textContent = fechaBonita(document.getElementById('eFecha').value);

  const actual = recurso ? recurso.cantidad_total : 0;
  document.getElementById('pvEntradaActual').textContent = actual;
  document.getElementById('pvEntradaDelta').textContent = '+' + cantidad;
  document.getElementById('pvEntradaNuevo').textContent = actual + cantidad;
}
calcularPreviewEntrada();

async function enviarEntrada(borrador) {
  const idRecurso = eRecurso.value;
  const cantidad = Number(document.getElementById('eCantidad').value);
  let valido = true;
  if (!idRecurso) { eRecurso.closest('.campo').classList.add('mal'); valido = false; } else eRecurso.closest('.campo').classList.remove('mal');
  const campoCantidad = document.getElementById('eCantidad').closest('.campo');
  if (!cantidad || cantidad <= 0) { campoCantidad.classList.add('mal'); valido = false; } else campoCantidad.classList.remove('mal');
  if (!valido) return;

  try {
    const datos = {
      id_recurso: Number(idRecurso),
      cantidad,
      fecha: document.getElementById('eFecha').value,
      origen: origenEntrada,
      observacion: document.getElementById('eObservacion').value,
      borrador
    };
    const respuesta = await api('/api/inventario/movimientos/entrada', { method: 'POST', body: JSON.stringify(datos) });
    mostrarOk(borrador ? 'Borrador guardado' : 'Entrada confirmada', respuesta.mensaje);
    document.getElementById('formEntrada').reset();
    document.getElementById('eFecha').value = hoyISO();
    await cargarRecursosSelect();
    await cargarResumen();
    calcularPreviewEntrada();
  } catch (error) {
    avisar(error.message);
  }
}

document.getElementById('formEntrada').addEventListener('submit', e => { e.preventDefault(); enviarEntrada(false); });
document.getElementById('btnBorradorEntrada').addEventListener('click', () => enviarEntrada(true));

/* ============================================================
   ENTREGA
   ============================================================ */
const gCategoria = document.getElementById('gCategoria');
const gRecurso = document.getElementById('gRecurso');

gCategoria.addEventListener('change', () => { llenarSelectRecursoPorCategoria(gRecurso, gCategoria.value); calcularPreviewEntrega(); });
llenarSelectRecursoPorCategoria(gRecurso, '');

document.getElementById('gOrigenToggle').querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => {
    document.getElementById('gOrigenToggle').querySelectorAll('button').forEach(x => x.classList.remove('is-on'));
    b.classList.add('is-on');
    origenEntrega = b.dataset.origen;
  });
});

['gEmpleado', 'gRecurso', 'gCantidad', 'gFecha', 'gFechaPrevista'].forEach(id => {
  document.getElementById(id).addEventListener('input', calcularPreviewEntrega);
  document.getElementById(id).addEventListener('change', calcularPreviewEntrega);
});

function calcularPreviewEntrega() {
  const recurso = recursosSelect.find(r => String(r.id_recurso) === gRecurso.value);
  const empleadoSel = document.getElementById('gEmpleado');
  const empleadoTexto = empleadoSel.options[empleadoSel.selectedIndex]?.text || '—';
  const cantidad = Number(document.getElementById('gCantidad').value) || 0;

  document.getElementById('pvEntregaEmpleado').textContent = gEmpleado.value ? empleadoTexto : '—';
  document.getElementById('pvEntregaRecurso').textContent = recurso ? recurso.nombre : '—';
  document.getElementById('pvEntregaFecha').textContent = fechaBonita(document.getElementById('gFecha').value);
  document.getElementById('pvEntregaFechaPrevista').textContent = fechaBonita(document.getElementById('gFechaPrevista').value);

  const disponible = recurso ? recurso.cantidad_disponible : 0;
  document.getElementById('pvEntregaActual').textContent = disponible;
  document.getElementById('pvEntregaDelta').textContent = '-' + cantidad;
  document.getElementById('pvEntregaNuevo').textContent = Math.max(0, disponible - cantidad);
}
const gEmpleado = document.getElementById('gEmpleado');
calcularPreviewEntrega();

async function enviarEntrega(borrador) {
  const idEmpleado = gEmpleado.value;
  const idRecurso = gRecurso.value;
  const cantidad = Number(document.getElementById('gCantidad').value);
  let valido = true;
  if (!idEmpleado) { gEmpleado.closest('.campo').classList.add('mal'); valido = false; } else gEmpleado.closest('.campo').classList.remove('mal');
  if (!idRecurso) { gRecurso.closest('.campo').classList.add('mal'); valido = false; } else gRecurso.closest('.campo').classList.remove('mal');
  const campoCantidad = document.getElementById('gCantidad').closest('.campo');
  if (!cantidad || cantidad <= 0) { campoCantidad.classList.add('mal'); valido = false; } else campoCantidad.classList.remove('mal');
  if (!valido) return;

  try {
    const datos = {
      id_empleado: Number(idEmpleado),
      id_recurso: Number(idRecurso),
      cantidad,
      fecha: document.getElementById('gFecha').value,
      fecha_devolucion_prevista: document.getElementById('gFechaPrevista').value || null,
      origen: origenEntrega,
      observacion: document.getElementById('gObservacion').value,
      borrador
    };
    const respuesta = await api('/api/inventario/movimientos/entrega', { method: 'POST', body: JSON.stringify(datos) });
    mostrarOk(borrador ? 'Borrador guardado' : 'Entrega confirmada', respuesta.mensaje);
    document.getElementById('formEntrega').reset();
    document.getElementById('gFecha').value = hoyISO();
    await cargarRecursosSelect();
    await cargarResumen();
    calcularPreviewEntrega();
  } catch (error) {
    avisar(error.message);
  }
}

document.getElementById('formEntrega').addEventListener('submit', e => { e.preventDefault(); enviarEntrega(false); });
document.getElementById('btnBorradorEntrega').addEventListener('click', () => enviarEntrega(true));

/* ============================================================
   DEVOLUCIÓN
   ============================================================ */
const dEmpleado = document.getElementById('dEmpleado');
const dAsignacion = document.getElementById('dAsignacion');

dEmpleado.addEventListener('change', () => cargarEntregasAbiertas());

async function cargarEntregasAbiertas() {
  try {
    const parametros = dEmpleado.value ? ('?id_empleado=' + dEmpleado.value) : '';
    const respuesta = await api('/api/inventario/movimientos/entregas-abiertas' + parametros);
    const lista = respuesta.datos || [];
    dAsignacion.innerHTML = '<option value="">Selecciona la entrega a devolver</option>' +
      lista.map(m => `<option value="${m.id_movimiento}">${escapar(m.codigo)} — ${escapar(m.recurso)} (${escapar(m.empleado_nombre + ' ' + m.empleado_apellido)})</option>`).join('');
    dAsignacion.dataset.entregas = JSON.stringify(lista);
    entregaSeleccionada = null;
    limpiarCamposAsignacion();
  } catch (error) {
    console.error(error);
  }
}
cargarEntregasAbiertas();

function limpiarCamposAsignacion() {
  document.getElementById('dCantidadEntregada').value = '';
  document.getElementById('dFechaEntrega').value = '';
  calcularPreviewDevolucion();
}

dAsignacion.addEventListener('change', () => {
  const lista = JSON.parse(dAsignacion.dataset.entregas || '[]');
  entregaSeleccionada = lista.find(m => String(m.id_movimiento) === dAsignacion.value) || null;
  if (entregaSeleccionada) {
    document.getElementById('dCantidadEntregada').value = entregaSeleccionada.cantidad_entregada;
    document.getElementById('dCantidadDevuelta').value = entregaSeleccionada.cantidad_entregada;
    document.getElementById('dFechaEntrega').value = String(entregaSeleccionada.fecha_entrega).slice(0, 10);
    if (!dEmpleado.value) dEmpleado.value = entregaSeleccionada.id_empleado;
  } else {
    limpiarCamposAsignacion();
  }
  calcularPreviewDevolucion();
});

document.getElementById('dCondicionToggle').querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => {
    document.getElementById('dCondicionToggle').querySelectorAll('button').forEach(x => x.classList.remove('is-on'));
    b.classList.add('is-on');
    condicionDevolucion = b.dataset.condicion;
    calcularPreviewDevolucion();
  });
});

['dCantidadDevuelta', 'dFecha'].forEach(id => {
  document.getElementById(id).addEventListener('input', calcularPreviewDevolucion);
  document.getElementById(id).addEventListener('change', calcularPreviewDevolucion);
});

const CLASE_CONDICION = { 'Buen estado': 'activo', 'Dañado': 'inactivo', 'Incompleto': 'pendiente', 'Perdido': 'inactivo' };

function calcularPreviewDevolucion() {
  const recurso = entregaSeleccionada ? recursosSelect.find(r => String(r.id_recurso) === String(entregaSeleccionada.id_recurso)) : null;
  const cantidad = Number(document.getElementById('dCantidadDevuelta').value) || 0;

  document.getElementById('pvDevolucionEmpleado').textContent = entregaSeleccionada ? `${entregaSeleccionada.empleado_nombre} ${entregaSeleccionada.empleado_apellido}` : '—';
  document.getElementById('pvDevolucionRecurso').textContent = entregaSeleccionada ? entregaSeleccionada.recurso : '—';
  document.getElementById('pvDevolucionFechaEntrega').textContent = entregaSeleccionada ? fechaBonita(entregaSeleccionada.fecha_entrega) : '—';
  document.getElementById('pvDevolucionFecha').textContent = fechaBonita(document.getElementById('dFecha').value);
  document.getElementById('pvDevolucionCondicion').innerHTML = `<i class="etiqueta ${CLASE_CONDICION[condicionDevolucion] || 'activo'}">${condicionDevolucion}</i>`;

  const disponible = recurso ? recurso.cantidad_disponible : 0;
  document.getElementById('pvDevolucionActual').textContent = disponible;
  const seSuma = condicionDevolucion === 'Buen estado';
  document.getElementById('pvDevolucionDelta').textContent = seSuma ? ('+' + cantidad) : '+0';
  document.getElementById('pvDevolucionNuevo').textContent = seSuma ? disponible + cantidad : disponible;
}
calcularPreviewDevolucion();

async function enviarDevolucion(borrador) {
  if (!entregaSeleccionada) {
    dAsignacion.closest('.campo').classList.add('mal');
    return;
  }
  dAsignacion.closest('.campo').classList.remove('mal');
  const cantidad = Number(document.getElementById('dCantidadDevuelta').value);
  const campoCantidad = document.getElementById('dCantidadDevuelta').closest('.campo');
  if (!cantidad || cantidad <= 0) { campoCantidad.classList.add('mal'); return; }
  campoCantidad.classList.remove('mal');

  try {
    const datos = {
      id_recurso: entregaSeleccionada.id_recurso,
      id_empleado: entregaSeleccionada.id_empleado,
      id_movimiento_relacionado: entregaSeleccionada.id_movimiento,
      cantidad,
      fecha: document.getElementById('dFecha').value,
      condicion: condicionDevolucion,
      observacion: document.getElementById('dObservacion').value,
      borrador
    };
    const respuesta = await api('/api/inventario/movimientos/devolucion', { method: 'POST', body: JSON.stringify(datos) });
    mostrarOk(borrador ? 'Borrador guardado' : 'Devolución confirmada', respuesta.mensaje);
    document.getElementById('formDevolucion').reset();
    document.getElementById('dFecha').value = hoyISO();
    entregaSeleccionada = null;
    await cargarEntregasAbiertas();
    await cargarRecursosSelect();
    await cargarResumen();
  } catch (error) {
    avisar(error.message);
  }
}

document.getElementById('formDevolucion').addEventListener('submit', e => { e.preventDefault(); enviarDevolucion(false); });
document.getElementById('btnBorradorDevolucion').addEventListener('click', () => enviarDevolucion(true));

/* ============================================================
   CONTEOS / HISTORIAL
   ============================================================ */
document.getElementById('btnIniciarConteo').addEventListener('click', () => {
  confirmar('¿Iniciar un conteo físico?', 'Se tomará una fotografía de las existencias actuales de todos los recursos activos para compararla con el conteo manual.', 'Iniciar conteo', async () => {
    try {
      const respuesta = await api('/api/inventario/conteos', { method: 'POST', body: JSON.stringify({ fecha: hoyISO() }) });
      avisar(respuesta.mensaje);
      cargarConteoActual();
    } catch (error) {
      avisar(error.message);
    }
  });
});

async function cargarConteoActual() {
  try {
    const respuesta = await api('/api/inventario/conteos/actual');
    pintarConteoActual(respuesta.datos);
  } catch (error) {
    console.error(error);
  }
}

function pintarConteoActual(conteo) {
  const caja = document.getElementById('cuerpoConteoActual');
  const btnIniciar = document.getElementById('btnIniciarConteo');

  if (!conteo) {
    caja.innerHTML = '<p class="vacio">No hay ningún conteo físico en curso.</p>';
    btnIniciar.hidden = false;
    return;
  }
  btnIniciar.hidden = true;

  const porcentaje = conteo.total_recursos > 0 ? Math.round((conteo.contabilizados / conteo.total_recursos) * 100) : 0;
  const pendientesHtml = conteo.detalle.filter(d => d.cantidad_fisica === null);
  const diferenciasHtml = conteo.detalle.filter(d => d.cantidad_fisica !== null && d.diferencia !== 0);

  caja.innerHTML = `
    <div class="resumen-conteo">
      <span class="badge-conteo">${escapar(conteo.codigo)} <i class="etiqueta activo">En curso</i></span>
      <span>Fecha: ${fechaBonita(conteo.fecha)}</span>
      <span>Responsable: ${escapar(conteo.responsable_nombre + ' ' + conteo.responsable_apellido)}</span>
    </div>
    <div class="barra-disp" style="margin-top:14px"><div class="relleno" style="width:${porcentaje}%"></div></div>
    <p class="nota" style="margin-top:8px">${conteo.contabilizados} de ${conteo.total_recursos} recursos contabilizados</p>

    <div class="resumen-permisos" style="margin-top:14px">
      <div class="cifra activos"><b class="conteo">${conteo.sin_diferencias}</b><span>Sin diferencias</span></div>
      <div class="cifra" style="border-color:#E0A82E22"><b class="conteo" style="color:#E0A82E">${conteo.con_diferencias}</b><span>Con diferencias</span></div>
      <div class="cifra"><b class="conteo">${conteo.pendientes}</b><span>Pendientes</span></div>
    </div>

    ${pendientesHtml.length ? `
      <h3 class="titulo-seccion" style="font-size:clamp(16px,1.5vw,24px)">Capturar conteo físico</h3>
      <div class="tabla tabla-conteo">
        <div class="fila encabezado"><span>Recurso</span><span>Sistema</span><span>Físico</span><span class="der">Acción</span></div>
        ${pendientesHtml.map(d => `
          <div class="fila" data-detalle="${d.id_detalle}">
            <span>${escapar(d.recurso)} <small style="color:var(--tenue)">${escapar(d.codigo)}</small></span>
            <span>${d.cantidad_sistema}</span>
            <span><input type="number" min="0" step="1" class="input-fisico" value="${d.cantidad_sistema}"></span>
            <span class="der"><button type="button" class="btn-linea chico guardar-fisico">Guardar</button></span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${diferenciasHtml.length ? `
      <h3 class="titulo-seccion" style="font-size:clamp(16px,1.5vw,24px)">Diferencias encontradas</h3>
      <div class="tabla tabla-diferencias">
        <div class="fila encabezado"><span>Recurso</span><span>Sistema</span><span>Físico</span><span class="der">Diferencia</span></div>
        ${diferenciasHtml.map(d => `
          <div class="fila">
            <span>${escapar(d.recurso)}</span>
            <span>${d.cantidad_sistema}</span>
            <span>${d.cantidad_fisica}</span>
            <span class="der"><b style="color:${d.diferencia < 0 ? 'var(--rojo-vivo)' : 'var(--verde)'}">${d.diferencia > 0 ? '+' : ''}${d.diferencia}</b></span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="acciones-form">
      <button type="button" class="btn-rojo grande" id="btnFinalizarConteo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>
        Finalizar y ajustar inventario
      </button>
    </div>
  `;

  caja.querySelectorAll('.guardar-fisico').forEach(boton => {
    boton.addEventListener('click', async () => {
      const fila = boton.closest('.fila');
      const idDetalle = fila.dataset.detalle;
      const valor = Number(fila.querySelector('.input-fisico').value);
      if (!Number.isInteger(valor) || valor < 0) { avisar('Escribe una cantidad válida.'); return; }
      try {
        await api('/api/inventario/conteos/detalle/' + idDetalle, { method: 'PATCH', body: JSON.stringify({ cantidad_fisica: valor }) });
        avisar('Conteo guardado.');
        cargarConteoActual();
      } catch (error) {
        avisar(error.message);
      }
    });
  });

  const btnFinalizar = document.getElementById('btnFinalizarConteo');
  if (btnFinalizar) {
    btnFinalizar.addEventListener('click', () => {
      confirmar('¿Finalizar este conteo?', 'Se generarán ajustes automáticos en el inventario para las diferencias encontradas. Los recursos pendientes de contar no se modificarán.', 'Finalizar conteo', async () => {
        try {
          const respuesta = await api('/api/inventario/conteos/' + conteo.id_conteo + '/finalizar', { method: 'POST' });
          mostrarOk('Conteo finalizado', respuesta.mensaje);
          cargarConteoActual();
          cargarResumen();
          cargarRecursosSelect();
          cargarHistorial();
        } catch (error) {
          avisar(error.message);
        }
      });
    });
  }
}

const CLASE_TIPO_MOV = { 'Entrada': 'tipo-entrada', 'Entrega': 'tipo-entrega', 'Devolución': 'tipo-devolucion', 'Ajuste': 'tipo-ajuste' };
const CLASE_ESTADO_MOV = { 'Registrado': 'activo', 'Pendiente': 'pendiente', 'Realizado': 'activo' };

const filtroTipoMov = document.getElementById('filtroTipoMov');
const buscarHistorial = document.getElementById('buscarHistorial');
let temporizadorHistorial;

filtroTipoMov.addEventListener('change', () => { paginaHistorial = 1; cargarHistorial(); });
buscarHistorial.addEventListener('input', () => {
  clearTimeout(temporizadorHistorial);
  temporizadorHistorial = setTimeout(() => { paginaHistorial = 1; cargarHistorial(); }, 320);
});

async function cargarHistorial() {
  try {
    const parametros = new URLSearchParams({ pagina: paginaHistorial, porPagina: 10 });
    if (filtroTipoMov.value) parametros.set('tipo', filtroTipoMov.value);
    if (buscarHistorial.value.trim()) parametros.set('texto', buscarHistorial.value.trim());

    const respuesta = await api('/api/inventario/movimientos/historial?' + parametros.toString());
    pintarHistorial(respuesta.datos);
    document.getElementById('sinHistorial').hidden = respuesta.datos.length > 0;

    pintarPaginacion(
      document.getElementById('paginacionHistorial'),
      respuesta.pagina, Math.max(1, Math.ceil(respuesta.total / respuesta.porPagina)), respuesta.total,
      (n) => { paginaHistorial = n; cargarHistorial(); }
    );
  } catch (error) {
    console.error(error);
    avisar('No se pudo cargar el historial de movimientos.');
  }
}

function pintarHistorial(lista) {
  const caja = document.getElementById('listaHistorial');
  caja.innerHTML = lista.map(m => {
    const signo = m.tipo === 'Entrada' || m.tipo === 'Devolución' ? '+' : m.tipo === 'Entrega' ? '-' : (m.cantidad >= 0 ? '+' : '');
    return `
      <div class="fila">
        <span>${fechaBonita(m.fecha)}</span>
        <span><i class="etiqueta-mov ${CLASE_TIPO_MOV[m.tipo] || ''}">${escapar(m.tipo)}</i></span>
        <span>${escapar(m.recurso_nombre)}</span>
        <span>${m.empleado_nombre ? escapar(m.empleado_nombre + ' ' + m.empleado_apellido) : '—'}</span>
        <span>${signo}${Math.abs(m.cantidad)}</span>
        <span>${escapar(m.responsable_nombre + ' ' + m.responsable_apellido)}</span>
        <span class="der"><i class="etiqueta ${CLASE_ESTADO_MOV[m.estado] || ''}">${escapar(m.estado)}</i></span>
      </div>
    `;
  }).join('');
}
