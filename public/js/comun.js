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
  'Inventario': null,
  'Nóminas': null,
  'Reportes': null
};

document.querySelectorAll('[data-modulo]').forEach(el => {
  el.addEventListener('click', () => {
    const destino = PAGINAS[el.dataset.modulo];
    if (destino) window.location.href = destino;
    else avisar('El módulo de ' + el.dataset.modulo + ' está en construcción.');
  });
});

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
  caja.textContent = momento + ', ' + document.getElementById('nombreUsuario').textContent;
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
    else if (destino === 'usuarios') window.location.href = 'usuarios.html';
    else avisar('La pantalla de cuenta todavía está en construcción.');
  });
});

document.getElementById('btnSalir').addEventListener('click', () => {
  avisar('Cerrando sesión…');
  setTimeout(() => { window.location.href = 'index.html#login'; }, 500);
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
  if (!e.target.closest('.cuenta') && !e.target.closest('.menu-fila')) cerrarMenus();
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
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.mensaje || 'Error en la solicitud.');
  return datos;
}
