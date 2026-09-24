/* ============================================================
   SICORP — SEISA · código compartido por todas las pantallas
   (barra lateral, menú de la cuenta, modales, avisos, paginación
   y la función api() para hablar con el backend)
   ============================================================ */

const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* A qué página lleva cada módulo del menú lateral.
   Cuando tengas la pantalla de inventario, nóminas o reportes,
   solo escribe aquí el nombre del archivo. */
const PAGINAS = {
  'Empleados': 'empleados.html',
  'Usuarios': 'usuarios.html',
  'Inventario': null,
  'Nóminas': null,
  'Reportes': null
};

document.querySelectorAll('[data-modulo]').forEach(el => {
  el.addEventListener('click', () => {
    if (el.classList.contains('sin-acceso')) {
      avisar('Tu rol no tiene acceso al módulo de ' + el.dataset.modulo + '.');
      return;
    }
    const destino = PAGINAS[el.dataset.modulo];
    if (destino) window.location.href = destino;
    else avisar('El módulo de ' + el.dataset.modulo + ' está en construcción.');
  });
});

/* Nombre y rol de quien inició sesión (ya no queda fijo "Jonathan").
   Se pide a /api/sesion, que usa la cookie de sesión del login para
   saber exactamente quién eres — y qué módulos le tocan según su rol. */
async function cargarSesion(){
  try {
    const respuesta = await api('/api/sesion');
    const datos = respuesta.datos;

    const nombreEl = document.getElementById('nombreUsuario');
    const rolEl = document.getElementById('rolUsuario');
    if (nombreEl) nombreEl.textContent = datos.nombre || datos.usuario;
    if (rolEl) rolEl.textContent = datos.rol;

    aplicarAccesos(datos.accesos || []);
    verificarAccesoPaginaActual(datos.accesos || []);
    return datos;
  } catch (error) {
    /* Si no hay sesión válida, el servidor ya nos hubiera mandado a
       "/" al pedir la página; esto es solo respaldo por si la sesión
       expiró mientras la página seguía abierta. */
    console.warn('No se pudo cargar la sesión:', error);
    window.location.href = '/';
    return null;
  }
}

/* Punto 4: oculta de la barra lateral y de las tarjetas del inicio
   los módulos a los que el rol de esta persona NO tiene acceso. Los
   nombres tienen que coincidir con los de Catalogo_acceso.nombre en
   la base de datos (Empleados, Usuarios, Inventario, Nóminas,
   Reportes...). Si un módulo no aparece en absoluto en el catálogo
   de accesos de nadie, mejor no lo ocultes por accidente: solo se
   esconde si YA sabemos que existe como acceso y esta persona no lo
   tiene. */
function aplicarAccesos(accesos){
  const normalizado = accesos.map(a => a.toLowerCase().trim());
  const tieneAcceso = nombreModulo => normalizado.includes(nombreModulo.toLowerCase());

  document.querySelectorAll('[data-modulo]').forEach(el => {
    const modulo = el.dataset.modulo;
    /* Si ningún acceso de ningún rol se llama así, no lo tocamos
       (evita ocultar módulos que la base de datos todavía no tiene
       registrados en Catalogo_acceso). */
    if (!MODULOS_CON_CONTROL.includes(modulo)) return;

    if (!tieneAcceso(modulo)) {
      el.classList.add('sin-acceso');
      el.setAttribute('aria-disabled', 'true');
      el.title = 'Tu rol no tiene acceso a este módulo.';
    }
  });
}

/* Los módulos que SÍ esperamos controlar por rol. Empleados y
   Usuarios ya están conectados a permisos reales; los demás se
   agregan aquí en cuanto tengan su propio acceso en el catálogo. */
const MODULOS_CON_CONTROL = ['Empleados', 'Usuarios'];

/* Mantenimiento no es un "módulo" del catálogo de accesos — se
   protege con el mismo acceso que ya exige el backend para
   /api/roles, /api/accesos, etc: "Usuarios" (nivel administrador). */
const PAGINA_A_ACCESO_REQUERIDO = { 'Mantenimiento': 'Usuarios' };

/* Si alguien entra DIRECTO a la URL de un módulo que su rol no tiene
   permitido (en vez de darle clic desde el menú), lo regresamos al
   inicio con un aviso — la API ya lo hubiera rechazado de todas
   formas (403), pero así no se queda viendo una pantalla vacía. */
function verificarAccesoPaginaActual(accesos){
  const pagina = document.body.dataset.pagina;
  const accesoRequerido = PAGINA_A_ACCESO_REQUERIDO[pagina] || pagina;
  if (!pagina || (!MODULOS_CON_CONTROL.includes(pagina) && !PAGINA_A_ACCESO_REQUERIDO[pagina])) return;

  const normalizado = accesos.map(a => a.toLowerCase().trim());
  if (!normalizado.includes(accesoRequerido.toLowerCase())) {
    window.location.href = 'inicio.html?sinacceso=' + encodeURIComponent(pagina);
  }
}

const sesionActual = cargarSesion();

/* Marca en la barra lateral el módulo en el que estás */
(function marcarModulo(){
  const pagina = document.body.dataset.pagina;
  const item = document.querySelector(`.menu-item[data-modulo="${pagina}"]`);
  if (item) item.classList.add('is-on');
})();

/* Saludo según la hora, si la página lo tiene */
(function saludar(){
  const caja = document.getElementById('saludoTexto');
  if (!caja) return;
  const h = new Date().getHours();
  const momento = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  /* Se espera a que /api/sesion responda para poner el nombre real;
     mientras tanto se deja solo el saludo sin nombre. */
  caja.textContent = momento + '…';
  sesionActual.then(datos => {
    if (datos) caja.textContent = `${momento}, ${datos.nombre}`;
  });
})();

/* ============================================================
   Menú de la cuenta
   ============================================================ */
const btnCuenta = document.getElementById('btnCuenta');

btnCuenta.addEventListener('click', e => {
  e.stopPropagation();
  const menu = document.getElementById('menuCuenta');
  const abierto = menu.classList.toggle('abierto');
  btnCuenta.classList.toggle('abierto', abierto);
  btnCuenta.setAttribute('aria-expanded', abierto ? 'true' : 'false');
});

document.querySelectorAll('#menuCuenta [data-ir]').forEach(b => {
  b.addEventListener('click', () => {
    const destino = b.dataset.ir;
    cerrarMenus();
    if (destino === 'inicio') window.location.href = 'inicio.html';
    else if (destino === 'mantenimiento') window.location.href = 'mantenimiento.html';
    else avisar('La pantalla de cuenta todavía está en construcción.');
  });
});

document.getElementById('btnSalir').addEventListener('click', () => {
  avisar('Cerrando sesión…');
  /* Antes esto solo redirigía sin avisarle al servidor: la sesión
     seguía viva ahí (la cookie seguía siendo válida). Ahora sí se
     llama a /logout para destruirla de verdad. */
  window.location.href = '/logout';
});

function cerrarMenus(){
  document.getElementById('menuCuenta').classList.remove('abierto');
  btnCuenta.classList.remove('abierto');
  btnCuenta.setAttribute('aria-expanded', 'false');
  document.querySelectorAll('.opciones.abierto').forEach(o => o.classList.remove('abierto'));
  document.querySelectorAll('.fila.encima').forEach(f => f.classList.remove('encima'));
  /* Los menús de "⋮" se agregan sueltos al final de <body> (ver
     abrirMenuAcciones), así que también hay que quitarlos de ahí. */
  document.querySelectorAll('.opciones.flotante').forEach(m => m.remove());
  document.querySelectorAll('.puntos[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}

/* ============================================================
   Menú de "⋮" (editar / activar / eliminar, etc.)
   ------------------------------------------------------------
   Antes este menú vivía DENTRO de la tarjeta o de la fila de la
   tabla, y como esos contenedores recortan su contenido (para que
   las esquinas redondeadas se vean bien), el menú quedaba cortado
   — sobre todo en las últimas filas, donde además no cabía hacia
   abajo. Ahora el menú se agrega suelto al final de <body> y se
   posiciona con "fixed" justo encima del botón que lo abrió,
   calculando si hay espacio para abrirlo hacia abajo o si es mejor
   abrirlo hacia arriba.

   Uso:
     abrirMenuAcciones(boton, [
       { texto:'Editar usuario', accion: () => ... },
       { texto:'Eliminar', peligro:true, accion: () => ... },
     ]);
   ============================================================ */
function abrirMenuAcciones(boton, opciones){
  cerrarMenus();

  const menu = document.createElement('div');
  menu.className = 'opciones abierto flotante';
  menu.setAttribute('role', 'menu');

  opciones.forEach(o => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = o.texto;
    b.setAttribute('role', 'menuitem');
    if (o.peligro) b.classList.add('peligro');
    b.addEventListener('click', ev => {
      ev.stopPropagation();
      cerrarMenus();
      o.accion();
    });
    menu.appendChild(b);
  });

  document.body.appendChild(menu);

  const r = boton.getBoundingClientRect();
  const alto = menu.offsetHeight;
  const ancho = menu.offsetWidth;
  const espacioAbajo = window.innerHeight - r.bottom;
  const abrirArriba = espacioAbajo < alto + 12 && r.top > alto + 12;

  let izquierda = r.right - ancho;
  izquierda = Math.max(8, Math.min(izquierda, window.innerWidth - ancho - 8));
  const arriba = abrirArriba ? r.top - alto - 8 : r.bottom + 8;

  menu.style.left = izquierda + 'px';
  menu.style.top = arriba + 'px';

  boton.setAttribute('aria-expanded', 'true');

  const alHacerClickFuera = ev => {
    if (menu.contains(ev.target) || ev.target === boton) return;
    menu.remove();
    boton.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', alHacerClickFuera);
  };
  setTimeout(() => document.addEventListener('click', alHacerClickFuera), 0);

  return menu;
}

document.addEventListener('click', e => {
  /* Este oyente es para cerrar el menú de la cuenta cuando se hace
     clic afuera. Los menús "⋮" (creados con abrirMenuAcciones) ya
     manejan su propio cierre por su cuenta — si este oyente también
     los cerrara, se cerrarían en el MISMO clic que los abre (porque
     el clic en el botón "⋮" burbujea hasta aquí). Por eso se excluye
     cualquier clic sobre un botón disparador de esos menús: todos
     llevan aria-expanded, sea cual sea su nombre de clase/atributo. */
  if (!e.target.closest('.cuenta') && !e.target.closest('.menu-fila') && !e.target.closest('[aria-expanded]')) {
    cerrarMenus();
  }
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const abierto = document.querySelector('.fondo-modal.abierto');
  if (abierto) cerrarModal(abierto.id); else cerrarMenus();
});

/* ============================================================
   Modales y avisos
   ============================================================ */
let focoPrevio = null;

function abrirModal(id){
  focoPrevio = document.activeElement;
  document.getElementById(id).classList.add('abierto');
  document.body.style.overflow = 'hidden';
  const boton = document.querySelector('#' + id + ' .btn-rojo, #' + id + ' .btn-descarga');
  if (boton) boton.focus();
}

function cerrarModal(id){
  document.getElementById(id).classList.remove('abierto');
  document.body.style.overflow = '';
  if (focoPrevio) focoPrevio.focus();
}

document.querySelectorAll('.fondo-modal').forEach(f => {
  f.addEventListener('click', e => { if (e.target === f) cerrarModal(f.id); });
});

/* Confirmación reutilizable: le pasas qué hacer si dicen que sí */
let alConfirmar = null;

function confirmar(titulo, texto, textoBoton, accion){
  document.getElementById('tituloConfirmar').textContent = titulo;
  document.getElementById('textoConfirmar').textContent = texto;
  document.getElementById('btnSi').textContent = textoBoton;
  alConfirmar = accion;
  abrirModal('modalConfirmar');
}

document.getElementById('btnSi').addEventListener('click', () => {
  const accion = alConfirmar;
  alConfirmar = null;
  cerrarModal('modalConfirmar');
  if (accion) accion();
});

document.getElementById('btnNo').addEventListener('click', () => {
  alConfirmar = null;
  cerrarModal('modalConfirmar');
});

let tiempoAviso;
function avisar(texto){
  const caja = document.getElementById('aviso');
  caja.textContent = texto;
  caja.classList.add('visible');
  clearTimeout(tiempoAviso);
  tiempoAviso = setTimeout(() => caja.classList.remove('visible'), 2800);
}

/* ============================================================
   Utilidades
   ============================================================ */
function escapar(t){
  return String(t ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}

/* Números que suben poco a poco */
function contar(el, meta){
  const desde = parseInt(el.textContent, 10) || 0;
  if (sinMovimiento || desde === meta){ el.textContent = meta; return; }
  const inicio = performance.now();
  const paso = t => {
    const p = Math.min((t - inicio) / 700, 1);
    el.textContent = Math.round(desde + (meta - desde) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

function fechaBonita(iso){
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  if (!d) return iso;
  return `${d}/${m}/${a}`;
}

function diasEntre(desde, hasta){
  if (!desde || !hasta) return 0;
  const a = new Date(desde), b = new Date(hasta);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

/* ============================================================
   Paginación
   Dibuja los botones y avisa a qué página quiere ir la persona.
   ============================================================ */
function pintarPaginacion(contenedor, pagina, paginas, total, alCambiar){
  contenedor.innerHTML = '';
  if (total === 0) return;

  const info = document.createElement('span');
  info.className = 'cuantos';
  info.textContent = `${total} registro${total === 1 ? '' : 's'}`;
  contenedor.appendChild(info);

  const texto = document.createElement('span');
  texto.textContent = `Página ${pagina} de ${paginas}`;
  contenedor.appendChild(texto);

  const flecha = (dir, activo, destino) => {
    const b = document.createElement('button');
    b.innerHTML = dir === 'ant'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
    b.disabled = !activo;
    b.setAttribute('aria-label', dir === 'ant' ? 'Página anterior' : 'Página siguiente');
    if (activo) b.addEventListener('click', () => alCambiar(destino));
    return b;
  };

  contenedor.appendChild(flecha('ant', pagina > 1, pagina - 1));

  /* Máximo 5 números, moviéndose alrededor de la página actual */
  let inicio = Math.max(1, pagina - 2);
  let fin = Math.min(paginas, inicio + 4);
  inicio = Math.max(1, fin - 4);

  for (let n = inicio; n <= fin; n++){
    const b = document.createElement('button');
    b.textContent = n;
    b.classList.toggle('is-on', n === pagina);
    b.addEventListener('click', () => alCambiar(n));
    contenedor.appendChild(b);
  }

  contenedor.appendChild(flecha('sig', pagina < paginas, pagina + 1));
}

/* ============================================================
   Comunicación con el backend
   ============================================================ */
async function api(url, opciones = {}){
  const respuesta = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones
  });

  const tipo = respuesta.headers.get('content-type') || '';
  if (!tipo.includes('application/json')) {
    /* Si el servidor responde HTML (normalmente la página de error
       404 de Express) en vez de JSON, es casi siempre porque esa
       ruta todavía no existe en el server.js/rutas/controlador que
       tienes corriendo — un archivo quedó desactualizado. Este
       mensaje lo dice claro en vez del críptico "Unexpected token
       '<'" que da JSON.parse al intentar leer HTML como si fuera JSON. */
    throw new Error(
      `El servidor respondió algo que no es JSON (código ${respuesta.status}) en "${url}". ` +
      `Es muy probable que esa ruta no exista todavía en tu server.js/rutas — revisa que tengas ` +
      `los archivos más recientes y reinicia el servidor (Ctrl+C y node server.js de nuevo).`
    );
  }

  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.mensaje || 'Error en la solicitud.');
  return datos;
}

/* Si llegamos aquí porque nos rebotaron de un módulo sin permiso
   (ver verificarAccesoPaginaActual, arriba), mostramos el aviso una
   vez y limpiamos la URL para que un refresh no lo repita. Esto va
   HASTA ABAJO del archivo a propósito: usa avisar(), que se define
   más arriba pero después del punto donde se carga la sesión. */
(function avisarSinAcceso(){
  const parametros = new URLSearchParams(location.search);
  const modulo = parametros.get('sinacceso');
  if (!modulo) return;
  avisar('Tu rol no tiene acceso al módulo de ' + modulo + '.');
  parametros.delete('sinacceso');
  const resto = parametros.toString();
  history.replaceState(null, '', location.pathname + (resto ? '?' + resto : ''));
})();

/* Que se pueda abrir el calendario haciendo clic en CUALQUIER parte
   del campo de fecha, no solo en el iconito chiquito de la derecha
   (que además ahora vino más grande, ver panel.css). Chrome/Edge
   soportan showPicker(); si el navegador no lo tiene, no truena, el
   campo simplemente sigue funcionando como cualquier input normal
   (haciendo clic en el ícono, como siempre). Esto se vuelve a
   ejecutar automáticamente cada vez que la página agrega inputs de
   fecha nuevos (por ejemplo, al abrir el formulario de un empleado
   o el expediente), gracias al MutationObserver de abajo. */
function activarClicEnFechas(raiz){
  raiz.querySelectorAll('input[type="date"]:not([data-click-fecha])').forEach(input => {
    input.dataset.clickFecha = '1';
    input.addEventListener('click', () => {
      if (input.readOnly || input.disabled) return;
      if (typeof input.showPicker === 'function') {
        try { input.showPicker(); } catch (e) { /* algunos navegadores lo bloquean sin foco previo */ }
      }
    });
  });
}
activarClicEnFechas(document);
new MutationObserver(() => activarClicEnFechas(document)).observe(document.body, { childList:true, subtree:true });