/* ============================================================
   SICORP — SEISA · módulo de NÓMINAS (pantallas)
   ------------------------------------------------------------
   - Toda regla y todo total final los decide el SERVIDOR
     (/api/nominas, servicios/nominas.servicio.js).
   - Aquí solo se muestra lo que responde y, mientras se escribe en
     un campo, se recalcula al instante con el MISMO archivo de
     cálculo (js/nominas-calculo.js) para no esperar al servidor.
   - La URL guarda dónde vas (#nomina=12 / #historial), así al
     recargar la página se recupera el mismo paso.
   ============================================================ */

const Calc = window.CalculoNomina;
const Q = Calc.formatoQ;

const estado = {
  reglas: null,
  empleados: [],
  periodo: periodoActual(),
  anioPopover: new Date().getFullYear(),
  vista: null,          // nómina abierta (respuesta de GET /api/nominas/:id)
  documento: null,      // comprobante aprobado (GET /api/nominas/:id/comprobante)
  editando: null,       // campo con el lápiz abierto
  ocupado: false
};

function periodoActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const esTecnico = tipo => tipo === 'TECNICO_SOCIO' || tipo === 'TECNICO_NO_SOCIO';
const $ = id => document.getElementById(id);
const centavosATexto = c => (c === null || c === undefined) ? '' : (c / 100).toFixed(2);

/* ============================================================
   Comunicación con el servidor
   ============================================================ */
async function pedir(url, opciones = {}) {
  let respuesta;
  const esFormulario = opciones.body instanceof FormData;
  try {
    respuesta = await fetch(url, {
      method: opciones.method || 'GET',
      headers: esFormulario ? {} : { 'Content-Type': 'application/json' },
      body: opciones.body === undefined ? undefined : (esFormulario ? opciones.body : JSON.stringify(opciones.body))
    });
  } catch (_) {
    const e = new Error('Error de red: no se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
    e.red = true;
    throw e;
  }
  const tipo = respuesta.headers.get('content-type') || '';
  if (!tipo.includes('application/json')) {
    throw new Error(`El servidor respondió algo inesperado (código ${respuesta.status}). Reinicia el servidor con los archivos nuevos.`);
  }
  const datos = await respuesta.json();
  if (!respuesta.ok || datos.exito === false) {
    const e = new Error(datos.mensaje || 'No se pudo completar la acción.');
    e.status = respuesta.status;
    e.extra = datos;
    throw e;
  }
  return datos.datos;
}

/* Botón en estado "cargando": deshabilitado y con texto de espera. */
async function conBoton(boton, textoCargando, accion) {
  if (estado.ocupado) return;
  estado.ocupado = true;
  const original = boton ? boton.innerHTML : null;
  if (boton) {
    boton.disabled = true;
    boton.classList.add('cargando');
    boton.innerHTML = `<span class="spinner" aria-hidden="true"></span>${escapar(textoCargando)}`;
  }
  try {
    return await accion();
  } finally {
    estado.ocupado = false;
    if (boton && document.body.contains(boton)) {
      boton.disabled = false;
      boton.classList.remove('cargando');
      boton.innerHTML = original;
    }
  }
}

/* ============================================================
   Íconos
   ============================================================ */
const ICONO = {
  subir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.8h8l4.2 4.2v14.2H6z"/><path d="M14 2.8v4.2h4.2"/><path d="M12 18v-6.5M9.2 14.2L12 11.4l2.8 2.8"/></svg>',
  validar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4"/><path d="M8.8 13l2.2 2.2 4.4-4.6"/></svg>',
  produccion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M7 19v-6M12 19V7M17 19v-9"/></svg>',
  calcular: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2.8" width="14" height="18.4" rx="2"/><rect x="7.8" y="5.6" width="8.4" height="3.6" rx=".6"/><path d="M8.5 12.5h.01M12 12.5h.01M15.5 12.5h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01M8.5 18.4h.01M12 18.4h.01M15.5 18.4h.01"/></svg>',
  aprobar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6z"/><path d="M8.8 12.2l2.2 2.2 4.4-4.6"/></svg>',
  comprobante: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.8h8l4.2 4.2v14.2H6z"/><path d="M14 2.8v4.2h4.2M9 12.5h6M9 15.5h6M9 18.5h4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  checkCirculo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.2"/><path d="M8 12.3l2.6 2.6L16 9.4"/></svg>',
  alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.2M12 17v.01"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9.2"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9.2"/><path d="M12 7.5v.01M12 11v5.5"/></svg>',
  lapiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  persona: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8.3" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/></svg>',
  calendario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18"/><circle cx="16.5" cy="16" r="2.4"/></svg>',
  descargar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 17v2.5h15V17"/></svg>',
  imprimir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 8V3.5h10V8"/><rect x="3.5" y="8" width="17" height="8.5" rx="2"/><path d="M7 14h10v6.5H7z"/></svg>',
  mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  menos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9.2"/><path d="M8 12h8"/></svg>',
  masCirculo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9.2"/><path d="M12 8v8M8 12h8"/></svg>',
  portapapeles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4M8.5 10h7M8.5 13.5h7M8.5 17h4"/></svg>',
  excel: '<svg viewBox="0 0 40 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M4 3h22l10 10v32H4z"/><path d="M26 3v10h10"/><path d="M11 22h18M11 29h18M11 36h18M20 22v14" stroke-linecap="round"/></svg>',
  reintentar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/></svg>',
  mas: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
  basura: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  casco: '<svg viewBox="0 0 64 48" fill="currentColor"><path d="M8 34a24 24 0 0 1 48 0z"/><rect x="2" y="34" width="60" height="7" rx="3.5"/><rect x="26" y="8" width="12" height="16" rx="3" fill="#0B121B"/></svg>'
};
const ICONOS_PASO_TECNICO = [ICONO.subir, ICONO.validar, ICONO.produccion, ICONO.calcular, ICONO.aprobar, ICONO.comprobante];

/* ============================================================
   Arranque y navegación (#nomina=ID / #historial / tipos)
   ============================================================ */
(async function iniciar() {
  pintarPeriodo();
  try {
    const [reglas, empleados] = await Promise.all([
      pedir('/api/nominas/reglas'),
      pedir('/api/nominas/empleados').catch(() => [])
    ]);
    estado.reglas = reglas;
    estado.empleados = empleados || [];
    $('hPeriodo').max = periodoMaximo();   // el filtro del historial tampoco pasa del mes actual
  } catch (error) {
    $('rejillaTipos').innerHTML = `<p class="vacio">${escapar(error.message)}</p>`;
    avisar(error.message);
    return;
  }
  llenarFiltrosHistorial();
  await navegar();
})();

window.addEventListener('hashchange', () => navegar());

function hashActual() {
  const h = location.hash.replace(/^#/, '');
  const m = h.match(/^nomina=(\d+)$/);
  if (m) return { vista: 'proceso', id: Number(m[1]) };
  if (h.startsWith('historial')) return { vista: 'historial' };
  return { vista: 'tipos' };
}

function irA(hash) {
  if (location.hash === '#' + hash || (!hash && !location.hash)) navegar();
  else location.hash = hash;
}

async function navegar() {
  const destino = hashActual();
  cerrarEdicion();
  if (destino.vista === 'proceso') return abrirNomina(destino.id);
  estado.vista = null;
  estado.documento = null;
  if (destino.vista === 'historial') return mostrarHistorial();
  return mostrarTipos();
}

function mostrarSeccion(id) {
  ['v-tipos', 'v-proceso', 'v-historial'].forEach(v => { $(v).hidden = v !== id; });
  window.scrollTo({ top: 0 });
}

document.querySelectorAll('[data-ir="inicio"]').forEach(b => b.addEventListener('click', () => window.location.href = 'inicio.html'));
document.querySelectorAll('[data-ir-historial]').forEach(b => b.addEventListener('click', () => irA('historial')));
$('btnBorrarTodos').addEventListener('click', borrarTodosBorradores);
$('btnHistorialVolver').addEventListener('click', () => irA(''));
document.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => cerrarModal(b.dataset.cerrar)));

const buscarGlobal = $('buscarGlobal');
if (buscarGlobal) {
  buscarGlobal.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    $('hTexto').value = buscarGlobal.value.trim();
    irA('historial');
    if (hashActual().vista === 'historial') cargarHistorialNom();
  });
}

/* ============================================================
   Encabezado: migas, título, período y estado
   ============================================================ */
const TEXTO_ESTADO = {
  EN_PREPARACION: ['En preparación', 'preparacion'],
  PENDIENTE_APROBACION: ['Pendiente de aprobación', 'pendiente'],
  APROBADA: ['Nómina aprobada', 'aprobada']
};

function pintarEncabezado({ migas = [], sub, estadoNomina = null, conPeriodo = true, conEstado = true }) {
  const partes = ['<button data-ir="inicio">Inicio</button>'];
  const todas = ['Nóminas', ...migas];
  todas.forEach((m, i) => {
    const ultima = i === todas.length - 1;
    partes.push(ultima ? `<span class="actual">${escapar(m)}</span>` : (i === 0 ? '<button data-ir-nominas>Nóminas</button>' : `<span>${escapar(m)}</span>`));
  });
  $('migasNom').innerHTML = partes.join(' / ');
  $('migasNom').querySelector('[data-ir="inicio"]').addEventListener('click', () => window.location.href = 'inicio.html');
  const aNominas = $('migasNom').querySelector('[data-ir-nominas]');
  if (aNominas) aNominas.addEventListener('click', () => irA(''));
  $('subNom').textContent = sub;
  const [texto, clase] = TEXTO_ESTADO[estadoNomina] || ['Sin iniciar', 'sin-iniciar'];
  const badge = $('estadoNom');
  badge.textContent = texto;
  badge.className = 'estado-nom ' + clase;
  badge.hidden = !conEstado;
  $('selectorPeriodo').hidden = !conPeriodo;
  pintarPeriodo();
}

/* ---------------- selector de período ---------------- */
function pintarPeriodo() {
  const periodo = estado.vista ? estado.vista.periodo : estado.periodo;
  $('textoPeriodo').textContent = Calc.nombrePeriodo(periodo);
  const aviso = $('periodoAviso');
  if (aviso) aviso.textContent = Calc.nombrePeriodo(estado.periodo);
}

/* Último mes que se puede procesar: lo manda el servidor (reloj del servidor);
   si todavía no llegó la respuesta se usa el del navegador. */
const periodoMaximo = () => (estado.reglas && estado.reglas.periodoMaximo) || periodoActual();
const esFuturo = periodo => periodo > periodoMaximo();

function pintarMesesPopover() {
  const actual = estado.vista ? estado.vista.periodo : estado.periodo;
  $('anioPeriodo').textContent = estado.anioPopover;
  $('anioSiguiente').disabled = estado.anioPopover >= Number(periodoMaximo().slice(0, 4));
  $('mesesPeriodo').innerHTML = Calc.MESES.map((m, i) => {
    const valor = `${estado.anioPopover}-${String(i + 1).padStart(2, '0')}`;
    const futuro = esFuturo(valor);
    return `<button type="button" data-periodo="${valor}" class="${valor === actual ? 'is-on' : ''}${futuro ? ' futuro' : ''}"${futuro ? ' disabled aria-disabled="true" title="Este mes todavía no ha llegado"' : ''}>${m.slice(0, 3)}</button>`;
  }).join('');
  $('mesesPeriodo').querySelectorAll('[data-periodo]:not([disabled])').forEach(b => b.addEventListener('click', () => {
    cerrarPopoverPeriodo();
    elegirPeriodo(b.dataset.periodo);
  }));
}

$('btnPeriodo').addEventListener('click', e => {
  e.stopPropagation();
  const pop = $('popoverPeriodo');
  const abrir = pop.hidden;
  if (abrir) {
    estado.anioPopover = Number((estado.vista ? estado.vista.periodo : estado.periodo).slice(0, 4));
    pintarMesesPopover();
  }
  pop.hidden = !abrir;
  $('btnPeriodo').setAttribute('aria-expanded', abrir ? 'true' : 'false');
});
$('anioAnterior').addEventListener('click', e => { e.stopPropagation(); estado.anioPopover--; pintarMesesPopover(); });
$('anioSiguiente').addEventListener('click', e => { e.stopPropagation(); if (estado.anioPopover >= Number(periodoMaximo().slice(0, 4))) return; estado.anioPopover++; pintarMesesPopover(); });
$('popoverPeriodo').addEventListener('click', e => e.stopPropagation());
document.addEventListener('click', cerrarPopoverPeriodo);
function cerrarPopoverPeriodo() {
  $('popoverPeriodo').hidden = true;
  $('btnPeriodo').setAttribute('aria-expanded', 'false');
}

/* Cambiar de mes: dentro de una nómina abre (o crea) la del mismo
   tipo y empleado para ese período — nunca mezcla meses. */
function elegirPeriodo(periodo) {
  if (esFuturo(periodo)) { avisar(`${Calc.nombrePeriodo(periodo)} todavía no ha llegado. El último período disponible es ${Calc.nombrePeriodo(periodoMaximo())}.`); return; }
  const v = estado.vista;
  if (!v) {
    estado.periodo = periodo;
    pintarPeriodo();
    if (hashActual().vista === 'tipos') mostrarTipos();
    return;
  }
  if (periodo === v.periodo) return;
  const ir = async () => {
    estado.editando = null;
    try {
      const r = await pedir('/api/nominas', { method: 'POST', body: { tipo: v.tipo, periodo, codigo_empleado: v.codigo_empleado || null } });
      estado.periodo = periodo;
      if (r.existente) avisar(r.aprobada ? `Ya existe una nómina aprobada para ${Calc.nombrePeriodo(periodo)}; se abrió ese registro.` : `Se abrió la nómina en preparación de ${Calc.nombrePeriodo(periodo)}.`);
      irA('nomina=' + r.id_nomina);
    } catch (error) { avisar(error.message); }
  };
  if (estado.editando) {
    confirmar('¿Cambiar de período?', 'Tienes un valor sin guardar; si cambias de mes se perderá ese cambio.', 'Cambiar período', ir);
  } else {
    ir();
  }
}

/* ============================================================
   VISTA: tipos de nómina + borradores
   ============================================================ */
const ICONO_TIPO = {
  TECNICO_SOCIO: `<span class="icono-tipo">${ICONO.casco}<span class="sello sello-escudo">${ICONO.aprobar}</span></span>`,
  TECNICO_NO_SOCIO: `<span class="icono-tipo">${ICONO.casco}<span class="sello sello-persona">${ICONO.persona}</span></span>`,
  ADMINISTRATIVA: `<span class="icono-tipo icono-planilla"><svg viewBox="0 0 48 56" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><rect x="5" y="7" width="38" height="45" rx="5"/><rect x="15" y="2.5" width="18" height="9" rx="2.5" fill="#0B121B"/><circle cx="24" cy="30" r="9"/><path d="M27 26.5c-.8-1-2-1.5-3.2-1.5-1.8 0-3 .9-3 2.2 0 3 6.4 1.6 6.4 4.8 0 1.4-1.4 2.4-3.3 2.4-1.4 0-2.7-.6-3.5-1.6M24 22.8v2.2M24 34.8v2.4" stroke-linecap="round" stroke-width="2"/></svg></span>`
};

async function mostrarTipos() {
  mostrarSeccion('v-tipos');
  pintarEncabezado({ sub: 'Selecciona el tipo de planilla que deseas preparar' });
  const tipos = Object.values(estado.reglas.tipos);
  $('rejillaTipos').innerHTML = tipos.map(t => `
    <article class="tarjeta-tipo">
      ${ICONO_TIPO[t.clave] || ''}
      <h3>${escapar(t.nombre)}</h3>
      ${t.subtitulo ? `<small class="subtitulo-tipo">${escapar(t.subtitulo)}</small>` : ''}
      <p>${escapar(t.descripcion)}</p>
      <div class="datos-tipo">
        <span class="${t.requiereEEGSA ? '' : 'tachado'}">${ICONO.comprobante}${t.requiereEEGSA ? 'Requiere<br>reporte EEGSA' : 'No requiere<br>reporte EEGSA'}</span>
        <span><b class="circulo-pasos">${t.pasos.length}</b>Pasos</span>
      </div>
      <button type="button" class="btn-nom-rojo grande" data-tipo="${t.clave}">${t.requiereEEGSA ? 'Procesar nómina' : 'Preparar planilla'}</button>
    </article>`).join('');
  $('rejillaTipos').querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => conBoton(b, 'Abriendo…', async () => {
    try {
      const r = await pedir('/api/nominas', { method: 'POST', body: { tipo: b.dataset.tipo, periodo: estado.periodo } });
      irA('nomina=' + r.id_nomina);
    } catch (error) { avisar(error.message); }
  })));
  cargarBorradores();
}

/* "Borrar todos": descarta de una vez todas las nóminas en preparación
   (las aprobadas no se tocan). */
function borrarTodosBorradores() {
  confirmar('¿Borrar todas las nóminas en preparación?',
    'Se descartarán todos los borradores de la lista (de todos los tipos y períodos) junto con sus archivos importados. Las nóminas aprobadas y sus comprobantes NO se tocan.',
    'Borrar todos', async () => {
      try {
        const r = await pedir('/api/nominas/borradores', { method: 'DELETE' });
        avisar(r.borrados === 1 ? 'Se borró 1 nómina en preparación.' : `Se borraron ${r.borrados} nóminas en preparación.`);
      } catch (error) { avisar(error.message); }
      cargarBorradores();
      if (!$('v-historial').hidden) cargarHistorialNom();
    });
}

async function cargarBorradores() {
  try {
    const lista = await pedir('/api/nominas?borradores=1');
    $('cajaBorradores').hidden = !lista.length;
    $('btnBorrarTodos').textContent = '';
    $('btnBorrarTodos').insertAdjacentHTML('beforeend', `${ICONO.basura} Borrar todos (${lista.length})`);
    $('pieHistorial').hidden = !!lista.length;
    $('listaBorradores').innerHTML = lista.map(n => {
      const [txtEstado, clase] = TEXTO_ESTADO[n.estado] || ['', ''];
      return `
      <div class="fila-borrador">
        <span class="b-tipo">${escapar(n.tipoNombre)}</span>
        <span>${escapar(n.periodoNombre)}</span>
        <span>${n.empleado ? escapar(n.empleado) : '<i class="tenue">Sin empleado todavía</i>'}</span>
        <span>Paso ${n.paso_actual}</span>
        <span><i class="estado-nom mini ${clase}">${txtEstado}</i></span>
        <span class="acciones-borrador">
          <button type="button" class="btn-nom-linea chico" data-abrir="${n.id_nomina}">Continuar</button>
          <button type="button" class="btn-icono" data-descartar="${n.id_nomina}" title="Descartar borrador" aria-label="Descartar borrador">${ICONO.basura}</button>
        </span>
      </div>`;
    }).join('');
    $('listaBorradores').querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => irA('nomina=' + b.dataset.abrir)));
    $('listaBorradores').querySelectorAll('[data-descartar]').forEach(b => b.addEventListener('click', () => {
      confirmar('¿Descartar este borrador?', 'Se quitará de la lista y se borrará el archivo importado. Las nóminas aprobadas no se tocan.', 'Descartar', async () => {
        try { await pedir('/api/nominas/' + b.dataset.descartar, { method: 'DELETE' }); avisar('Borrador descartado.'); cargarBorradores(); }
        catch (error) { avisar(error.message); }
      });
    }));
  } catch (error) {
    $('cajaBorradores').hidden = true;
  }
}

/* ============================================================
   VISTA: proceso de una nómina
   ============================================================ */
async function abrirNomina(id, { silencioso = false } = {}) {
  mostrarSeccion('v-proceso');
  if (!silencioso) $('contenidoPaso').innerHTML = '<p class="cargando-nom"><span class="spinner"></span>Cargando nómina…</p>';
  try {
    const v = await pedir('/api/nominas/' + id);
    estado.vista = v;
    estado.periodo = v.periodo;
    estado.documento = null;
    pintarProceso();
    if (v.periodoFuturo && v.estado !== 'APROBADA') avisar(`Esta nómina es de ${v.periodoNombre}, un mes que todavía no ha llegado. No se puede editar ni aprobar; solo descartarla.`);
  } catch (error) {
    $('contenidoPaso').innerHTML = `<div class="tarjeta-nom"><p class="vacio">${escapar(error.message)}</p><div class="pie-pasos"><button class="btn-nom-linea" onclick="irA('')">← Volver a tipos de nómina</button></div></div>`;
    $('stepper').innerHTML = '';
  }
}

function actualizarVista(v) {
  estado.vista = v;
  estado.documento = null;
  estado.editando = null;
  pintarProceso();
}

function subtituloProceso(v) {
  if (esTecnico(v.tipo)) return 'Importa, valida y procesa la nómina de SEISA paso a paso.';
  return ['Registra el salario y descuentos del personal auxiliar o administrativo.',
    'Revisa los importes antes de autorizar el pago.',
    'Consulta y descarga el comprobante aprobado.'][v.paso_actual - 1];
}

function pintarProceso() {
  const v = estado.vista;
  pintarEncabezado({
    migas: [esTecnico(v.tipo) ? v.tipoNombre : 'Planilla Administrativa'],
    sub: subtituloProceso(v),
    estadoNomina: v.estado
  });
  pintarStepper();
  const pasos = esTecnico(v.tipo)
    ? [pasoImportar, pasoValidar, pasoProduccion, pasoCalcular, pasoAprobar, pasoComprobante]
    : [pasoPreparar, pasoAprobarPlanilla, pasoComprobantePlanilla];
  const caja = $('contenidoPaso');
  caja.innerHTML = pasos[v.paso_actual - 1](v);
  caja.classList.toggle('bloqueado', v.estado === 'APROBADA');
  activarEventosPaso(caja);
  if ((v.paso_actual === v.pasos.length) && v.estado === 'APROBADA') cargarDocumento();
}

/* ---------------- indicador de pasos ---------------- */
function puedeAbrirPaso(v, paso) {
  if (v.estado === 'APROBADA') return paso >= v.pasos.length - 1;
  return paso <= v.paso_completado + 1;
}

function pintarStepper() {
  const v = estado.vista;
  const tecnico = esTecnico(v.tipo);
  const ol = $('stepper');
  ol.className = 'stepper ' + (tecnico ? 'stepper-tecnico' : 'stepper-planilla');
  ol.innerHTML = v.pasos.map((nombre, i) => {
    const n = i + 1;
    const completado = n <= v.paso_completado || (v.estado === 'APROBADA' && n < v.pasos.length) || (v.estado === 'APROBADA' && n === v.pasos.length && false);
    const actual = n === v.paso_actual;
    const clase = actual ? 'actual' : (completado ? 'completo' : 'pendiente');
    const abrible = puedeAbrirPaso(v, n) && !actual;
    const circulo = tecnico
      ? `<span class="paso-circulo">${completado && !actual ? ICONO.check : ICONOS_PASO_TECNICO[i]}</span>`
      : `<span class="paso-circulo">${completado && !actual ? ICONO.check : n}</span>`;
    return `
      <li class="paso ${clase} ${abrible ? 'abrible' : ''}">
        <button type="button" data-paso="${n}" ${abrible ? '' : 'disabled'} aria-current="${actual ? 'step' : 'false'}" title="${abrible ? 'Ir a ' + escapar(nombre) : (actual ? 'Paso actual' : 'Completa los pasos anteriores')}">
          ${tecnico ? `<span class="paso-numero">${n}</span>` : ''}
          ${circulo}
          <span class="paso-nombre">${escapar(nombre)}</span>
        </button>
      </li>`;
  }).join('');
  ol.querySelectorAll('[data-paso]:not([disabled])').forEach(b => b.addEventListener('click', () => irAPaso(Number(b.dataset.paso))));
}

async function irAPaso(paso) {
  if (estado.editando) cerrarEdicion();
  try {
    actualizarVista(await pedir(`/api/nominas/${estado.vista.id_nomina}/pasos/${paso}/ir`, { method: 'POST' }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) { avisar(error.message); }
}

async function completarPaso(paso, boton, textoCargando) {
  await conBoton(boton, textoCargando || 'Guardando…', async () => {
    try {
      actualizarVista(await pedir(`/api/nominas/${estado.vista.id_nomina}/pasos/${paso}/completar`, { method: 'POST' }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      avisar(error.message);
      if (error.status === 409) abrirNomina(estado.vista.id_nomina, { silencioso: true });
    }
  });
}

/* ============================================================
   Utilidades de plantillas
   ============================================================ */
const nombreEmpleado = v => (v.empleado && v.empleado.nombre) || (v.importacion && v.importacion.inspector) || '—';
const mesMayus = v => Calc.nombreMes(v.periodo).toUpperCase();
const mesTitulo = v => { const m = Calc.nombreMes(v.periodo); return m.charAt(0).toUpperCase() + m.slice(1); };
const anio = v => v.periodo.slice(0, 4);

/* Cantidades: enteros con separador de miles; decimales SIEMPRE a 2. */
function cantidad(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return escapar(String(v));
  return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function tamanoBonito(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
function fechaHora(f) {
  if (!f) return '—';
  const d = new Date(f);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
}

/* Monto con lápiz: al darle clic se vuelve un campo numérico con ✓ / ✕. */
function montoEditable(campo, monto, { editable = true, vacio = false, clase = '' } = {}) {
  const bloqueado = estado.vista.estado === 'APROBADA';
  const texto = vacio && (monto === null || monto === undefined) ? '<i class="pendiente-precio">Precio pendiente</i>' : escapar(Q(monto));
  return `<span class="editable ${clase}" data-campo="${escapar(campo)}" data-valor="${monto ?? ''}">
      <span class="valor" data-monto="${escapar(campo)}">${texto}</span>
      ${editable && !bloqueado ? `<button type="button" class="btn-lapiz" title="Editar" aria-label="Editar">${ICONO.lapiz}</button>` : ''}
    </span>`;
}

function piePasos(izquierda, derecha) {
  return `<div class="pie-pasos"><div>${izquierda || ''}</div><div class="pie-derecha">${derecha || ''}</div></div>`;
}
const btnVolver = (texto, paso) => `<button type="button" class="btn-nom-linea" data-accion="ir-paso" data-paso="${paso}">← ${escapar(texto)}</button>`;
const btnContinuar = (texto, paso, { deshabilitado = false, razon = '' } = {}) =>
  `<button type="button" class="btn-nom-rojo" data-accion="completar" data-paso="${paso}" ${deshabilitado ? 'disabled' : ''} title="${escapar(razon)}">${escapar(texto)} →</button>`;

/* ============================================================
   TÉCNICO · PASO 1 — Importar EEGSA
   ============================================================ */
function pasoImportar(v) {
  const imp = v.importacion;
  const bloqueado = v.estado === 'APROBADA';
  if (!imp) {
    return `
      <div class="tarjeta-nom">
        <h2 class="titulo-paso">1. Importar reporte de EEGSA</h2>
        <div class="fila-archivo vacio-archivo">
          <span class="icono-archivo gris">${ICONO.excel}</span>
          <div><b>Reporte de producción EEGSA</b><small>Todavía no se ha cargado ningún archivo para ${escapar(v.periodoNombre)}.</small></div>
          <button type="button" class="btn-nom-blanco" data-accion="cargar">Cargar archivo ${ICONO.subir}</button>
        </div>
        <button type="button" class="zona-vacia" data-accion="cargar">
          ${ICONO.excel}
          <b>Carga el reporte de producción de EEGSA</b>
          <span>Archivo .xlsx o .xls de máximo 10 MB. Debe traer el inspector, las actividades y el total general.</span>
        </button>
      </div>
      ${piePasos('<button type="button" class="btn-nom-linea" data-accion="tipos">← Volver a tipos de nómina</button>', btnContinuar('Continuar a validación', 1, { deshabilitado: true, razon: 'Primero carga el archivo' }))}`;
  }
  const errores = v.validacion ? v.validacion.errores.length : 0;
  const detalle = imp.formato === 'detalle';
  const sinTecnico = detalle && !imp.inspectorSeleccionado;
  const areas = imp.columnasAreas || [];
  const conAreas = areas.length > 0;
  const columnas = conAreas ? `minmax(0,1fr) repeat(${areas.length}, minmax(52px,.18fr)) minmax(90px,.25fr)` : '';
  const estiloFila = conAreas ? ` style="grid-template-columns:${columnas}"` : '';
  const filas = imp.actividades.map(a => `
      <div class="fila-tabla"${estiloFila}>
        <span>${escapar(a.nombre || '—')}${a.deHoja ? ` <i class="chip-nueva">Hoja ${escapar(a.deHoja)}</i>` : ''}</span>
        ${conAreas ? areas.map(x => `<span class="centro tenue-num">${a.areas && a.areas[x] ? cantidad(a.areas[x]) : '—'}</span>`).join('') : ''}
        <span class="centro">${cantidad(a.cantidad)}</span>
      </div>`).join('');

  // Solo se ofrecen los técnicos del MISMO tipo que la nómina (socio / no socio),
  // según el "Tipo de empleado" de su expediente en Empleados.
  const tipoNomina = estado.vista.tipoNombre ? estado.vista.tipoNombre.toLowerCase() : 'este tipo';
  const insp = detalle ? imp.inspectores : [];
  const delTipo = insp.filter(t => t.delTipo || t.nombre === imp.inspectorSeleccionado);
  const otroTipo = insp.filter(t => t.registrado && !t.delTipo && t.tipo_empleado && t.nombre !== imp.inspectorSeleccionado);
  const sinClasificar = insp.filter(t => t.registrado && !t.tipo_empleado && t.nombre !== imp.inspectorSeleccionado);
  const noRegistrados = insp.filter(t => !t.registrado && t.nombre !== imp.inspectorSeleccionado);
  const listaNombres = l => l.map(t => escapar(t.nombre) + (t.tipoEmpleadoNombre && t.tipo_empleado ? ' (' + escapar(t.tipoEmpleadoNombre) + ')' : '')).join(', ');
  const selectorTecnico = detalle ? `
      <div class="selector-tecnico ${sinTecnico ? 'pendiente' : ''}">
        <div>
          <b>Técnico del reporte</b>
          <small>Este archivo es la facturación de <b>${insp.length}</b> técnicos (hoja "${escapar(imp.hoja || 'Efectuado')}"). Aquí solo aparecen los registrados en Empleados como <b>${escapar(tipoNomina)}</b> (${delTipo.length}).</small>
        </div>
        <select id="selectTecnico" ${bloqueado ? 'disabled' : ''} aria-label="Técnico del reporte">
          <option value="">${delTipo.length ? 'Selecciona el técnico…' : 'Ningún técnico del archivo es ' + escapar(tipoNomina)}</option>
          ${delTipo.map(t => `<option value="${escapar(t.nombre)}" ${t.nombre === imp.inspectorSeleccionado ? 'selected' : ''}>${escapar(t.nombre)} — ${cantidad(t.ordenes)} órdenes${t.registrado ? ' · No. ' + t.codigo_empleado : ' · no registrado'}${t.registrado && !t.delTipo ? ' · ' + escapar(t.tipoEmpleadoNombre || 'otro tipo') : ''}${t.penalizaciones ? ' · penalizaciones Q ' + cantidad(t.penalizaciones) : ''}</option>`).join('')}
        </select>
        ${(otroTipo.length || sinClasificar.length || noRegistrados.length) ? `
        <details class="otros-tecnicos">
          <summary>¿Por qué no aparecen los demás técnicos del archivo?</summary>
          ${otroTipo.length ? `<p><b>De otro tipo (${otroTipo.length}):</b> ${listaNombres(otroTipo)}. Se pagan en la otra nómina técnica.</p>` : ''}
          ${sinClasificar.length ? `<p class="aviso-clasificar"><b>Sin clasificar (${sinClasificar.length}):</b> ${listaNombres(sinClasificar)}. Abre su expediente en Empleados y escoge "Técnico socio" o "Técnico no socio".</p>` : ''}
          ${noRegistrados.length ? `<p><b>No registrados en Empleados (${noRegistrados.length}):</b> ${listaNombres(noRegistrados)}.</p>` : ''}
        </details>` : ''}
      </div>` : '';

  const penal = imp.penalizaciones && imp.penalizaciones.detalle && imp.penalizaciones.detalle.length ? `
      <div class="penalizaciones-archivo">
        <b>${ICONO.alerta} Penalizaciones EEGSA de ${escapar(imp.inspector)} (hoja Penalizaciones): ${escapar(Q(Calc.aCentavos(imp.penalizaciones.total)))}</b>
        <ul>${imp.penalizaciones.detalle.map(p => `<li>${escapar(p.fecha || '')} · ${escapar(p.motivo || 'Sin motivo')} — <b>${escapar(Q(Calc.aCentavos(p.monto)))}</b></li>`).join('')}</ul>
        <small>Se cargan solas en "Penalizaciones EEGSA" del paso Calcular nómina; ahí se pueden cambiar.</small>
      </div>` : '';

  return `
    <div class="tarjeta-nom">
      <h2 class="titulo-paso">1. Importar reporte de EEGSA</h2>
      <div class="fila-archivo">
        <span class="icono-archivo">${ICONO.excel}</span>
        <div>
          <b>Reporte de producción EEGSA</b>
          <small class="ok-texto">Archivo cargado correctamente</small>
          <small class="meta-archivo">${escapar(imp.archivo.nombre)} · ${tamanoBonito(imp.archivo.tamano)} · ${cantidad(imp.archivo.registros)} ${detalle ? 'órdenes' : 'registros'} · ${escapar(imp.archivo.subido_por || '')} · ${fechaHora(imp.archivo.fecha)}</small>
        </div>
        ${bloqueado ? '' : `<button type="button" class="btn-nom-blanco" data-accion="cargar">Reemplazar archivo ${ICONO.subir}</button>`}
      </div>
      ${selectorTecnico}
      ${sinTecnico ? `<p class="aviso-pendientes azul">${ICONO.info} Selecciona el técnico para ver sus actividades.</p>` : `
      <div class="vista-previa-cab">
        <span>Vista previa de la información${imp.periodoArchivo ? ` · ${escapar(Calc.nombrePeriodo(imp.periodoArchivo))}` : ''}</span>
        <span>Inspector: <b>${escapar(imp.inspector || 'no encontrado')}</b></span>
      </div>
      ${errores ? `<p class="nota-previa">${ICONO.alerta} Se encontraron ${errores} observaciones; se revisarán en el paso de validación.</p>` : ''}
      <div class="tabla-previa ${conAreas ? 'con-areas' : ''}">
        <div class="fila-tabla encabezado"${estiloFila}><span>Actividad</span>${conAreas ? areas.map(x => `<span class="centro">Área ${escapar(x)}</span>`).join('') : ''}<span class="centro">${escapar(conAreas ? 'Total' : (imp.columnaCantidad || 'Cantidad'))}</span></div>
        ${filas || '<p class="vacio">El archivo no trae actividades.</p>'}
        <div class="fila-tabla total"${estiloFila}><span>Total general</span>${conAreas ? areas.map(() => '<span></span>').join('') : ''}<span class="centro">${cantidad(imp.totalDeclarado ?? imp.actividades.reduce((s2, a) => s2 + (Number(a.cantidad) || 0), 0))}</span></div>
      </div>
      ${penal}`}
      ${imp.columnasExtra && imp.columnasExtra.length ? `<p class="nota-previa">${ICONO.info} Columnas adicionales conservadas: ${escapar(imp.columnasExtra.join(', '))}</p>` : ''}
    </div>
    ${piePasos(bloqueado ? '' : `<button type="button" class="enlace-cancelar" data-accion="cancelar-importacion">${ICONO.reintentar} Cancelar importación</button>`,
      btnContinuar('Continuar a validación', 1, { deshabilitado: sinTecnico, razon: sinTecnico ? 'Selecciona el técnico' : '' }))}`;
}

/* ============================================================
   TÉCNICO · PASO 2 — Validar datos
   ============================================================ */
function pasoValidar(v) {
  const val = v.validacion;
  const imp = v.importacion;
  if (!val || !imp) return `<div class="tarjeta-nom"><p class="vacio">Carga el reporte de EEGSA para validarlo.</p></div>${piePasos(btnVolver('Volver a importación', 1))}`;

  const iconoEstado = a => a.estado === 'ok' ? `<span class="estado-fila ok" title="Correcto">${ICONO.checkCirculo}</span>`
    : a.estado === 'advertencia' ? `<span class="estado-fila aviso" title="${escapar(a.mensajes.join(' '))}">${ICONO.alerta}</span>`
      : `<span class="estado-fila mal" title="${escapar(a.mensajes.join(' '))}">${ICONO.error}</span>`;
  const filas = val.actividades.map(a => `
    <div class="fila-tabla tres ${a.estado}">
      <span>${escapar(a.nombre || '(sin nombre)')}${a.nueva ? ' <i class="chip-nueva">Nueva</i>' : ''}${a.mensajes.length && a.estado !== 'ok' ? `<small>${a.fila ? 'Fila ' + a.fila + ': ' : ''}${escapar(a.mensajes.join(' '))}</small>` : ''}</span>
      <span class="centro">${cantidad(a.cantidad)}</span>
      <span class="centro">${iconoEstado(a)}</span>
    </div>`).join('');
  const totalOk = val.totalDeclarado === null || val.totalDeclarado === val.totalCalculado;

  const resultado = val.ok ? `
      <div class="resultado-validacion ok">
        <span class="escudo-grande ok">${ICONO.aprobar}</span>
        <h3>Información validada correctamente</h3>
        <p>Las actividades y cantidades coinciden con el reporte cargado.</p>
        <div class="mini-tabla">
          <div><span>Inspector:</span><b>${escapar(val.inspector)}</b></div>
          <div><span>Empleado:</span><b>${escapar(val.empleado ? val.empleado.nombre + ' (No. ' + val.empleado.codigo_empleado + ')' : '—')}</b></div>
          <div><span>Áreas:</span><b>${val.areas ?? '—'}</b></div>
          <div><span>Total general:</span><b>${cantidad(val.totalCalculado)}</b></div>
        </div>
        <span class="pill-ok">${ICONO.checkCirculo} Validación completada</span>
      </div>` : `
      <div class="resultado-validacion mal">
        <span class="escudo-grande mal">${ICONO.error}</span>
        <h3>Validación con errores</h3>
        <p><b>${val.errores.length}</b> error${val.errores.length === 1 ? '' : 'es'} y <b>${val.advertencias.length}</b> advertencia${val.advertencias.length === 1 ? '' : 's'}. Corrige el archivo y reemplázalo.</p>
        <ul class="lista-errores">
          ${val.errores.map(e => `<li><b>${escapar(e.campo || 'Archivo')}${e.fila ? ' · fila ' + e.fila : ''}</b>${escapar(e.mensaje)}${e.registros ? `<small>Registros afectados: ${e.registros}</small>` : ''}</li>`).join('')}
        </ul>
        <div class="acciones-error">
          ${v.estado !== 'APROBADA' ? `<button type="button" class="btn-nom-blanco" data-accion="cargar">Reemplazar archivo ${ICONO.subir}</button>` : ''}
          ${val.duplicado ? `<button type="button" class="btn-nom-azul" data-accion="abrir-existente" data-id="${val.duplicado.id_nomina}">Abrir nómina existente</button>` : ''}
        </div>
      </div>`;
  const advertencias = val.advertencias.length ? `
      <details class="advertencias" ${val.ok ? '' : 'open'}>
        <summary>${ICONO.alerta} ${val.advertencias.length} advertencia${val.advertencias.length === 1 ? '' : 's'}</summary>
        <ul>${val.advertencias.map(a => `<li>${a.fila ? `<b>Fila ${a.fila}:</b> ` : ''}${escapar(a.mensaje)}</li>`).join('')}</ul>
      </details>` : '';

  return `
    <div class="rejilla-validar">
      <div class="tarjeta-nom">
        <h2 class="titulo-paso">2. Validar datos importados</h2>
        <p class="sub-paso">Confirma que la información coincida con el reporte recibido de EEGSA</p>
        <div class="tabla-validar">
          <div class="cab-tabla"><b>Información importada</b><span>Inspector: ${escapar(val.inspector || '—')}</span></div>
          <div class="fila-tabla tres encabezado"><span>Actividad</span><span class="centro">${escapar(imp.columnaCantidad || 'Cantidad')}</span><span></span></div>
          ${filas}
          <div class="fila-tabla tres total"><span>Total general</span><span class="centro">${cantidad(val.totalDeclarado ?? val.totalCalculado)}</span><span class="centro">${totalOk ? `<span class="estado-fila ok">${ICONO.checkCirculo}</span>` : `<span class="estado-fila mal">${ICONO.error}</span>`}</span></div>
        </div>
      </div>
      <div class="tarjeta-nom">
        <h2 class="titulo-paso">Resultado de la validación</h2>
        ${resultado}
        ${advertencias}
        <p class="nota-centro">Para modificar la información, reemplaza el archivo de EEGSA</p>
      </div>
    </div>
    ${piePasos(btnVolver('Volver a importación', 1), btnContinuar('Continuar a producción SEISA', 2, { deshabilitado: !val.ok, razon: val.ok ? '' : 'Corrige los errores para continuar' }))}`;
}

/* ============================================================
   TÉCNICO · PASO 3 — Producción SEISA
   ============================================================ */
function tablaActividades(v, { columnaPrecio, conEdicion }) {
  const c = v.calculo;
  const bono = columnaPrecio === 'bono';
  const filas = c.actividades.map((a, i) => {
    const precio = bono ? a.precioBono : a.precioProduccion;
    const total = bono ? a.totalBono : a.totalProduccion;
    let celdaPrecio;
    if (conEdicion) {
      celdaPrecio = montoEditable(`precio:${a.nombre}:${bono ? 'bono' : 'produccion'}`, precio, { vacio: true });
    } else {
      celdaPrecio = precio === null ? '<i class="pendiente-precio">Precio pendiente</i>' : escapar(Q(precio));
    }
    const extraNueva = conEdicion && a.nueva ? `<small class="precio-prod-nueva">Precio de producción: ${montoEditable(`precio:${a.nombre}:produccion`, a.precioProduccion, { vacio: true })}</small>` : '';
    return `
      <div class="fila-tabla cuatro ${a.precioPendiente ? 'con-pendiente' : ''}">
        <span>${escapar(a.nombre)}${a.nueva ? ' <i class="chip-nueva">Nueva</i>' : ''}${extraNueva}</span>
        <span class="centro grande">${a.cantidad}</span>
        <span class="der">${celdaPrecio}</span>
        <span class="der" data-monto="act:${i}:${bono ? 'b' : 'p'}">${escapar(Q(total))}</span>
      </div>`;
  }).join('');
  const suma = c.actividades.reduce((s, a) => s + (bono ? a.totalBono : a.totalProduccion), 0);
  return `
    <div class="fila-tabla cuatro encabezado"><span>Actividad</span><span class="centro">Total órdenes</span><span class="der">Precio</span><span class="der">Total general</span></div>
    ${filas}
    <div class="fila-tabla cuatro total"><span></span><span class="centro grande">${c.totalOrdenes}</span><span class="der">TOTAL</span><span class="der" data-monto="${bono ? 'bono' : 'prod.conIva'}">${escapar(Q(suma))}</span></div>`;
}

function pasoProduccion(v) {
  const c = v.calculo;
  const p = c.produccion;
  const t = (v.reglas || estado.reglas.tipos[v.tipo]).tasas;
  const pct = bp => (bp / 100).toLocaleString('es-GT', { maximumFractionDigits: 2 }) + '%';
  const filaR = (texto, monto, clave, clase = '') => `<div class="fila-resumen ${clase}"><span>${escapar(texto)}</span><b data-monto="${clave}">${escapar(Q(monto))}</b></div>`;
  return `
    <div class="rejilla-produccion">
      <div class="tarjeta-nom">
        <h2 class="titulo-paso">3. Producción de SEISA</h2>
        <p class="sub-paso">Calcular el valor generado por las actividades validadas</p>
        <div class="barra-inspector">
          <span>${ICONO.persona} INSPECTOR</span><b>${escapar(nombreEmpleado(v).toUpperCase())}</b>
          <span>${ICONO.calendario} ${escapar(mesMayus(v))} ${anio(v)}</span>
        </div>
        <div class="tabla-precios">
          <p class="titulo-rojo">NUEVOS PRECIOS PAGADOS</p>
          ${tablaActividades(v, { columnaPrecio: 'produccion', conEdicion: false })}
        </div>
        ${c.pendientes.length ? `<p class="nota-previa">${ICONO.alerta} ${c.pendientes.length} actividad(es) nueva(s) sin precio: se les pone precio en <b>Calcular nómina</b>.</p>` : ''}
      </div>
      <div class="tarjeta-nom tarjeta-seisa">
        <span class="circuito c1"></span><span class="circuito c2"></span>
        <div class="cab-seisa"><b>SEISA</b><span>${escapar(nombreEmpleado(v).toUpperCase())}</span><span>INSPECCIÓN</span></div>
        <div class="bloque-resumen">
          ${filaR('Total de producción con IVA', p.conIva, 'prod.conIva')}
          ${filaR('Total de producción sin IVA', p.sinIva, 'prod.sinIva')}
          ${filaR('IVA de mi producción', p.iva, 'prod.iva')}
          ${filaR(`Retención ISR ${pct(t.retencion_isr_bp)}`, p.isr, 'prod.isr')}
          ${filaR('Descuento a la producción (IVA, ISR)', p.descuentoProduccion, 'prod.descuentoProduccion')}
          ${filaR('SUB-TOTAL', p.subtotalProduccion, 'prod.subtotalProduccion', 'subtotal')}
        </div>
        <div class="bloque-resumen">
          ${filaR(`Aporte para el funcionamiento de SEISA ${pct(t.aporte_seisa_bp)}`, p.aporteSeisa, 'prod.aporteSeisa')}
          ${filaR(`Aporte para renovación flotilla vehículos ${pct(t.flotilla_bp)}`, p.flotilla, 'prod.flotilla')}
          ${filaR('Mantenimiento de vehículos', p.mantenimiento, 'prod.mantenimiento')}
          ${filaR('SUB-TOTAL', p.subtotalSeisa, 'prod.subtotalSeisa', 'subtotal')}
        </div>
        <p class="nota-centro">Los valores se calculan automáticamente según las cantidades y precios registrados</p>
      </div>
    </div>
    ${piePasos(btnVolver('Volver a validación', 2), btnContinuar('Continuar a calcular nómina', 3))}`;
}

/* ============================================================
   TÉCNICO · PASO 4 — Calcular nómina
   ============================================================ */
function listaDescuentosManuales(v) {
  const bloqueado = v.estado === 'APROBADA';
  const lista = v.descuentos_extra || [];
  return `
    <div class="descuentos-manuales">
      <div class="cab-manuales">
        <b>Descuentos adicionales</b>
        ${bloqueado ? '' : `<button type="button" class="btn-agregar" data-accion="mostrar-form-descuento">${ICONO.mas} Agregar descuento</button>`}
      </div>
      <form class="form-descuento" id="formDescuento" hidden novalidate>
        <input type="text" id="dConcepto" placeholder="Concepto (ej. Anticipo)" maxlength="80" required>
        <input type="text" id="dDescripcion" placeholder="Descripción (opcional)" maxlength="150">
        <input type="text" id="dMonto" placeholder="Monto Q" inputmode="decimal">
        <div class="botones-descuento">
          <button type="button" class="btn-nom-linea chico" data-accion="cancelar-descuento">Cancelar</button>
          <button type="submit" class="btn-nom-rojo chico">Guardar</button>
        </div>
      </form>
      ${lista.length ? lista.map(d => `
        <div class="fila-manual">
          <span><b>${escapar(d.concepto)}</b>${d.descripcion ? `<small>${escapar(d.descripcion)}</small>` : ''}</span>
          <b>${escapar(Q(d.monto))}</b>
          ${bloqueado ? '' : `<button type="button" class="btn-icono" data-accion="eliminar-descuento" data-id="${d.id}" title="Eliminar descuento" aria-label="Eliminar ${escapar(d.concepto)}">${ICONO.basura}</button>`}
        </div>`).join('') : '<p class="vacio-mini">Sin descuentos adicionales.</p>'}
    </div>`;
}

function seccionObservacionesPago(v) {
  const bloqueado = v.estado === 'APROBADA';
  const pago = v.pago || {};
  return `
    <div class="tarjeta-nom extras-nomina">
      <label class="campo-nom ancho">
        <span>Observaciones para el comprobante <i class="tenue">(opcional)</i></span>
        <textarea data-texto="observaciones" maxlength="500" rows="2" placeholder="Aparecerán en el detalle, el PDF y la impresión." ${bloqueado ? 'disabled' : ''}>${escapar(v.observaciones || '')}</textarea>
      </label>
      <div class="datos-pago">
        <label class="campo-nom"><span>Forma de pago</span><input type="text" data-texto="pago.forma_pago" maxlength="40" value="${escapar(pago.forma_pago || '')}" placeholder="Pago en línea" ${bloqueado ? 'disabled' : ''}></label>
        <label class="campo-nom"><span>Banco</span><input type="text" data-texto="pago.banco" maxlength="60" value="${escapar(pago.banco || '')}" placeholder="Ej. Banco Industrial S.A." ${bloqueado ? 'disabled' : ''}></label>
        <label class="campo-nom"><span>No. de cuenta</span><input type="text" data-texto="pago.cuenta" maxlength="30" value="${escapar(pago.cuenta || '')}" placeholder="Solo números" inputmode="numeric" ${bloqueado ? 'disabled' : ''}></label>
      </div>
    </div>`;
}

function pasoCalcular(v) {
  const c = v.calculo;
  const mes = mesTitulo(v), MES = mesMayus(v), a = anio(v);
  const filaDesc = (d) => `
    <div class="fila-desc ${d.manual ? 'manual' : ''}">
      <span>${escapar(d.conMes ? `${d.nombre} ${a} Mes ${MES}` : d.nombre)}</span>
      ${d.manual ? `<b data-monto="desc:${escapar(d.clave)}">${escapar(Q(d.monto))}</b>` : montoEditable(d.clave, d.monto)}
    </div>`;
  return `
    <div class="cab-calcular">
      <div>
        <h2 class="titulo-paso">4. Calcular nómina</h2>
        <p class="sub-paso">Calcula la bonificación, los descuentos y el pago correspondiente al técnico</p>
      </div>
      <div class="persona-mes"><b>${escapar(nombreEmpleado(v).toUpperCase())}</b><span>${ICONO.calendario} ${escapar(MES)} ${a}</span></div>
    </div>
    ${c.pendientes.length ? `<p class="aviso-pendientes">${ICONO.alerta} Ponle precio a: <b>${escapar(c.pendientes.join(', '))}</b> (actividad nueva). No se puede continuar mientras tenga cantidad y no tenga precio.</p>` : ''}
    <div class="rejilla-calcular">
      <div class="tarjeta-nom tabla-precios">
        <div class="cab-bono">
          <p class="titulo-rojo">NUEVOS PRECIOS</p>
          <b>${escapar(nombreEmpleado(v).toUpperCase())}</b>
          <span class="titulo-rojo">Bono de Producción</span>
        </div>
        ${tablaActividades(v, { columnaPrecio: 'bono', conEdicion: true })}
      </div>

      <div class="tarjeta-nom lista-descuentos-seisa">
        <h3 class="titulo-centro">DESCUENTOS SEISA</h3>
        ${c.cargos.map(x => `
          <div class="fila-desc ${x.calculado ? 'fila-base' : ''}"><span>${escapar(x.nombre)}${x.calculado ? ' <i class="tenue">(base: producción sin IVA, no se suma)</i>' : ''}</span>${x.calculado ? `<b data-monto="cargo:${x.clave}">${escapar(Q(x.monto))}</b>` : montoEditable('cargo:' + x.clave, x.monto)}</div>`).join('')}
        <div class="fila-desc total-seisa"><span>TOTAL DESCUENTOS SEISA</span><b data-monto="totalCargos">${escapar(Q(c.totalCargos))}</b></div>
        <div class="formula-salario">
          <span>Salario sugerido = Sueldo completo − Total descuentos SEISA</span>
          <b data-monto="salarioSugerido">${escapar(Q(c.salarioSugerido))}</b>
        </div>
        <div class="fila-desc fila-aparte"><span>Mantenimiento de vehículos <i class="tenue">(se resta en Producción SEISA, no en este total)</i></span>${montoEditable('mantenimiento_vehiculos', c.produccion.mantenimiento)}</div>
        ${listaDescuentosManuales(v)}
      </div>

      <div class="tarjeta-nom resumen-pago">
        <p class="nombre-azul">${escapar(nombreEmpleado(v).toUpperCase())}</p>
        <p class="sub-resumen">Salario mes de ${escapar(MES)} ${a} y bonificación de producción de ${escapar(MES)} ${a}</p>
        <div class="tabla-resumen">
          <div><span>Bono producción mes de ${escapar(mes)} ${a}</span><b data-monto="bono">${escapar(Q(c.bono))}</b></div>
          <div><span>Total de bonificación</span><b data-monto="bono">${escapar(Q(c.bono))}</b></div>
          <div><span>Salario mes de ${escapar(mes)} ${a}${c.salarioEditado ? '' : ' <i class="tenue">(sugerido)</i>'}</span>${montoEditable('salario_mes', c.salario)}</div>
          <div><span>Total a recibir de bonificación + salario mensual sin descuentos</span><b data-monto="totalSinDescuentos">${escapar(Q(c.totalSinDescuentos))}</b></div>
        </div>
        ${c.salarioEditado && v.estado !== 'APROBADA' ? `<button type="button" class="enlace-nom chico" data-accion="restablecer-salario">Usar salario sugerido (${escapar(Q(c.salarioSugerido))})</button>` : ''}
        <p class="titulo-azul">DESCUENTOS</p>
        <div class="tabla-resumen">${c.descuentos.map(filaDesc).join('')}</div>
        <div class="barra-total azul"><span>TOTAL DE DESCUENTOS</span><b data-monto="totalDescuentos">${escapar(Q(c.totalDescuentos))}</b></div>
        <div class="barra-total verde"><span>TOTAL PAGO A RECIBIR</span><b data-monto="total">${escapar(Q(c.total))}</b></div>
      </div>
    </div>
    ${seccionObservacionesPago(v)}
    ${piePasos(btnVolver('Volver a Producción SEISA', 3), btnContinuar('Continuar a aprobación', 4, { deshabilitado: c.pendientes.length > 0, razon: c.pendientes.length ? 'Falta el precio de actividades nuevas' : '' }))}`;
}

/* ============================================================
   TÉCNICO · PASO 5 — Aprobar
   ============================================================ */
function pasoAprobar(v) {
  const c = v.calculo;
  const mes = mesTitulo(v), MES = mesMayus(v), a = anio(v);
  const t = (v.reglas || estado.reglas.tipos[v.tipo]).tasas;
  const fila = (texto, monto, clase = '') => `<div class="fila-aprobar ${clase}"><span>${texto}</span><b>${escapar(Q(monto))}</b></div>`;
  const aprobada = v.estado === 'APROBADA';
  return `
    <h2 class="titulo-paso">5. Aprobar nómina</h2>
    <p class="sub-paso">Revisa los resultados antes de autorizar el pago y generar el comprobante</p>
    <div class="barra-trabajador">
      <div><span>Nombre del Trabajador</span><b>${escapar(nombreEmpleado(v).toUpperCase())}</b></div>
      <div><span>Salario del Mes de:</span><b>${escapar(MES)} ${a}</b></div>
      <div><span>Puesto:</span><b>${escapar((v.empleado && v.empleado.puesto) || 'Técnico')}</b></div>
    </div>
    <div class="rejilla-aprobar">
      <div class="tarjeta-nom resumen-nomina">
        <h3>Resumen de nómina</h3>
        <p class="sec-aprobar">${ICONO.checkCirculo} PRODUCCIÓN SEISA</p>
        ${fila('Total de producción con IVA', c.produccion.conIva)}
        ${fila(`Aporte para el funcionamiento de SEISA ${t.aporte_seisa_bp / 100}%`, c.produccion.aporteSeisa)}
        ${fila(`Aporte para renovación flotilla vehículos ${t.flotilla_bp / 100}%`, c.produccion.flotilla)}
        ${c.produccion.mantenimiento ? fila('Mantenimiento de vehículos', c.produccion.mantenimiento) : ''}
        ${fila('SUB - TOTAL', c.produccion.subtotalSeisa, 'subtotal')}
        <p class="sec-aprobar">${ICONO.checkCirculo} BONIFICACIÓN Y SALARIO</p>
        ${fila(`Bono producción mes de ${escapar(mes)} ${a}`, c.bono)}
        ${fila('Total de bonificación', c.bono)}
        ${fila(`Salario mes de ${escapar(mes)} ${a}`, c.salario)}
        ${fila('TOTAL A RECIBIR DE BONIFICACIÓN + SALARIO MENSUAL sin descuentos', c.totalSinDescuentos, 'subtotal')}
        <p class="sec-aprobar">${ICONO.checkCirculo} DESCUENTOS</p>
        ${c.descuentos.map(d => fila(escapar(d.conMes ? `${d.nombre} ${a} mes de ${MES}` : d.nombre) + (d.manual ? ' <i class="chip-manual">agregado</i>' : ''), d.monto)).join('')}
        ${fila('TOTAL DE DESCUENTOS', c.totalDescuentos, 'subtotal rojo')}
        ${v.observaciones ? `<p class="observaciones-resumen"><b>Observaciones:</b> ${escapar(v.observaciones)}</p>` : ''}
        <button type="button" class="btn-detalle" data-accion="detalle">Ver detalle completo</button>
      </div>
      <div class="tarjeta-nom resultado-final">
        <h3>Resultado Final</h3>
        <p class="etiqueta-total">TOTAL PAGO A RECIBIR</p>
        <p class="total-grande">${escapar(Q(c.total))}</p>
        <div class="checks-final">
          <div><span>${ICONO.comprobante} Reporte EEGSA</span><b>Validado ${ICONO.checkCirculo}</b></div>
          <div><span>${ICONO.produccion} Producción SEISA</span><b>Calculada ${ICONO.checkCirculo}</b></div>
          <div><span>${ICONO.comprobante} Nómina</span><b>${aprobada ? 'Aprobada' : 'Lista para aprobar'} ${ICONO.checkCirculo}</b></div>
        </div>
        ${aprobada ? `
          <p class="nota-aprobada">Aprobada por <b>${escapar(v.aprobado_por || '—')}</b> el ${fechaHora(v.fecha_aprobacion)} · Recibo No. <b>${v.numero_recibo}</b></p>
          <button type="button" class="btn-nom-rojo ancho" data-accion="ir-paso" data-paso="6">Ver comprobante →</button>` : `
          <button type="button" class="btn-nom-linea ancho" data-accion="ir-paso" data-paso="4">Volver para corregir</button>
          <button type="button" class="btn-nom-rojo ancho" data-accion="aprobar">${ICONO.aprobar} Aprobar nómina</button>`}
      </div>
    </div>
    ${piePasos(aprobada ? '' : btnVolver('Volver a calcular nómina', 4))}`;
}

/* ============================================================
   COMPROBANTE (técnico paso 6) — usa el documento aprobado
   ============================================================ */
async function cargarDocumento() {
  if (estado.documento) return estado.documento;
  try {
    estado.documento = await pedir(`/api/nominas/${estado.vista.id_nomina}/comprobante`);
    const caja = $('cajaDocumento');
    if (caja) caja.innerHTML = esTecnico(estado.vista.tipo) ? tarjetaComprobanteTecnico(estado.documento) : cuerpoComprobantePlanilla(estado.documento);
    return estado.documento;
  } catch (error) {
    avisar(error.message);
    return null;
  }
}

function tarjetaComprobanteTecnico(doc) {
  return `
    <span class="check-grande">${ICONO.check}</span>
    <h3>Comprobante generado</h3>
    <p class="sub-comprobante">La nómina fue aprobada y el recibo está listo</p>
    <div class="datos-comprobante">
      <div><span>${ICONO.persona} Trabajador</span><b>${escapar(doc.empleado.nombre.toUpperCase())}</b></div>
      <div><span>${ICONO.calendario} Período</span><b>${escapar(doc.periodoNombre.toUpperCase())}</b></div>
      <div><span>${ICONO.comprobante} Recibo No.</span><b class="azul">${doc.numeroRecibo}</b></div>
      <div><span>${ICONO.portapapeles} Puesto</span><b>${escapar(doc.empleado.puesto || '—')}</b></div>
      <div class="total"><span>${ICONO.checkCirculo} TOTAL PAGO A RECIBIR</span><b>${escapar(doc.liquidoTexto)}</b></div>
    </div>
    <span class="pill-listo">Documento Listo</span>
    <button type="button" class="btn-nom-rojo ancho" data-accion="pdf">${ICONO.descargar} Descargar PDF</button>
    <button type="button" class="btn-nom-linea ancho" data-accion="imprimir">${ICONO.imprimir} Imprimir comprobante</button>
    <button type="button" class="enlace-nom" data-accion="historial">Ver historial de comprobantes</button>
    <p class="nota-inmutable">${ICONO.info} El comprobante conserva los valores aprobados y no puede modificarse.</p>`;
}

function pasoComprobante(v) {
  return `
    <div class="rejilla-comprobante">
      <div>
        <h2 class="titulo-paso">6. Comprobantes</h2>
        <p class="sub-paso">Genera, consulta y descarga el recibo de pago aprobado.</p>
      </div>
      <div class="tarjeta-nom tarjeta-comprobante" id="cajaDocumento">
        <p class="cargando-nom"><span class="spinner"></span>Preparando comprobante…</p>
      </div>
      <div></div>
    </div>
    ${piePasos(btnVolver('Volver a aprobación', 5), '<button type="button" class="btn-nom-rojo" data-accion="nueva">Ingresar una nueva nómina</button>')}`;
}

/* ============================================================
   PLANILLA ADMINISTRATIVA
   ============================================================ */
function barraEmpleado(v, { conSelector }) {
  const e = v.empleado;
  const opciones = estado.empleados.map(x => `<option value="${x.codigo_empleado}" ${e && e.codigo_empleado === x.codigo_empleado ? 'selected' : ''}>${escapar(x.nombre + ' ' + x.apellido)}${x.puesto ? ' — ' + escapar(x.puesto) : ''}</option>`).join('');
  return `
    <div class="barra-empleado ${conSelector ? 'con-selector' : ''}">
      <span class="icono-barra">${ICONO.persona}</span>
      <div><span>Empleado No.</span><b>${e ? e.codigo_empleado : '—'}</b></div>
      <div><span>Nombre:</span><b>${e ? escapar(e.nombre) : '<i class="tenue">Sin empleado seleccionado</i>'}</b></div>
      <div><span>Puesto:</span><b>${e ? escapar(e.puesto || '—') : '—'}</b></div>
      <div><span>Período:</span><b>${escapar(v.periodoNombre)}</b></div>
      ${conSelector ? `
        <label class="selector-empleado">
          ${ICONO.persona}
          <select id="selectEmpleado" aria-label="Seleccionar empleado">
            <option value="">Seleccionar empleado</option>
            ${opciones}
          </select>
        </label>` : ''}
    </div>`;
}

function inputMonto(campo, centavos, { placeholder = '0.00', deshabilitado = false } = {}) {
  return `<label class="input-q ${deshabilitado ? 'deshabilitado' : ''}"><span>Q</span><input type="text" inputmode="decimal" data-campo-input="${escapar(campo)}" value="${centavosATexto(centavos)}" placeholder="${placeholder}" ${deshabilitado ? 'disabled' : ''}></label>`;
}

function pasoPreparar(v) {
  const c = v.calculo;
  const p = v.planilla || {};
  const sinEmpleado = !v.empleado;
  const bloqueado = v.estado === 'APROBADA';
  const des = sinEmpleado || bloqueado;
  const igssAuto = p.igss === undefined || p.igss === null;
  return `
    <h2 class="titulo-paso">1. Preparar Planilla</h2>
    ${barraEmpleado(v, { conSelector: !bloqueado })}
    ${sinEmpleado ? `<p class="aviso-pendientes azul">${ICONO.info} Selecciona un empleado activo para cargar sus datos y registrar los importes del mes.</p>` : ''}
    <div class="rejilla-planilla ${sinEmpleado ? 'atenuada' : ''}">
      <div class="tarjeta-nom tarjeta-planilla">
        <h3 class="cab-planilla azul">${ICONO.masCirculo} Ingresos del mes</h3>
        <div class="fila-input"><span>Salario base:</span>${inputMonto('planilla.salario_base', p.salario_base, { deshabilitado: des })}</div>
        <div class="fila-input"><span>Bonificación de Ley:</span>${inputMonto('planilla.bonificacion', p.bonificacion ?? c.ingresos[1].monto, { deshabilitado: des })}</div>
        <div class="fila-input"><span>Otros ingresos:</span>${inputMonto('planilla.otros_ingresos', p.otros_ingresos, { deshabilitado: des })}</div>
        ${p.otros_ingresos ? `<input type="text" class="input-texto" data-texto="planilla.otros_ingresos_desc" maxlength="80" placeholder="Descripción de otros ingresos" value="${escapar(p.otros_ingresos_desc || '')}" ${des ? 'disabled' : ''}>` : ''}
        <div class="pie-planilla azul"><span>Total de Ingresos</span><b data-monto="totalIngresos">${escapar(Q(c.totalIngresos))}</b></div>
      </div>

      <div class="tarjeta-nom tarjeta-planilla">
        <h3 class="cab-planilla rojo">${ICONO.menos} Descuentos</h3>
        <div class="fila-input"><span>Cuota IGSS${igssAuto ? ' <i class="tenue">(4.83%)</i>' : ''}</span>${inputMonto('planilla.igss', igssAuto ? c.igssSugerido : p.igss, { deshabilitado: des })}
          ${!igssAuto && !des ? `<button type="button" class="btn-icono" data-accion="igss-auto" title="Volver a calcular 4.83 %">${ICONO.reintentar}</button>` : ''}</div>
        <div class="fila-input"><span>ISR</span>${inputMonto('planilla.isr', p.isr, { deshabilitado: des || !c.isrAplica })}
          <label class="check-aplica"><input type="checkbox" data-check="planilla.isr_aplica" ${c.isrAplica ? 'checked' : ''} ${des ? 'disabled' : ''}> Aplica</label></div>
        <div class="fila-input"><span>Otros descuentos</span>${inputMonto('planilla.otros_descuentos', p.otros_descuentos, { deshabilitado: des })}</div>
        <input type="text" class="input-texto" data-texto="planilla.otros_descuentos_desc" maxlength="150" placeholder="Descripción de otros descuentos" value="${escapar(p.otros_descuentos_desc || '')}" ${des ? 'disabled' : ''}>
        ${sinEmpleado ? '' : listaDescuentosManuales(v)}
        <div class="pie-planilla rojo"><span>Total de Descuentos</span><b data-monto="totalDescuentos">${escapar(Q(c.totalDescuentos))}</b></div>
      </div>

      <div class="tarjeta-nom tarjeta-planilla resumen-planilla">
        <h3 class="cab-planilla">${ICONO.portapapeles} Resumen de planilla</h3>
        <div class="fila-res"><span>Total de ingresos</span><b data-monto="totalIngresos">${escapar(Q(c.totalIngresos))}</b></div>
        <div class="fila-res rojo"><span>Total de descuentos</span><b>- <span data-monto="totalDescuentos">${escapar(Q(c.totalDescuentos))}</span></b></div>
        <p class="etiqueta-total verde">LÍQUIDO A RECIBIR</p>
        <p class="total-grande" data-monto="liquido">${escapar(Q(c.liquido))}</p>
        <div class="checks-planilla">
          <div class="${v.empleado ? 'ok' : ''}">${v.empleado ? ICONO.checkCirculo : ICONO.info} Datos del empleado ${v.empleado ? 'cargados' : 'pendientes'}</div>
          <div class="${c.ingresos[0].monto > 0 ? 'ok' : ''}">${c.ingresos[0].monto > 0 ? ICONO.checkCirculo : ICONO.info} Importes ${c.ingresos[0].monto > 0 ? 'revisados' : 'pendientes'}</div>
        </div>
        <p class="aviso-eegsa">${ICONO.info} Esta planilla no utiliza producción de EEGSA</p>
      </div>
    </div>
    ${sinEmpleado ? '' : seccionObservacionesPago(v)}
    ${piePasos('<button type="button" class="btn-nom-linea" data-accion="tipos">← Volver a tipos de nómina</button>',
      btnContinuar('Continuar a revisión', 1, { deshabilitado: sinEmpleado || !(c.ingresos[0].monto > 0), razon: sinEmpleado ? 'Selecciona un empleado' : 'Escribe el salario base' }))}`;
}

function listasPlanilla(c, observaciones) {
  const fila = (t, m, d) => `<div class="fila-aprobar"><span>${escapar(t)}${d ? `<small>${escapar(d)}</small>` : ''}</span><b>${escapar(Q(m))}</b></div>`;
  return `
    <p class="sec-aprobar azul">INGRESOS</p>
    ${c.ingresos.map(i => fila(i.nombre, i.monto)).join('')}
    <div class="fila-aprobar subtotal azul"><span>TOTAL DE INGRESOS</span><b>${escapar(Q(c.totalIngresos))}</b></div>
    <p class="sec-aprobar rojo">${ICONO.checkCirculo} DESCUENTOS</p>
    ${c.descuentos.map(d => fila(d.nombre + (d.manual ? ' (agregado)' : ''), d.monto, d.descripcion)).join('')}
    <div class="fila-aprobar subtotal rojo"><span>TOTAL DE DESCUENTOS</span><b>${escapar(Q(c.totalDescuentos))}</b></div>
    ${observaciones ? `<p class="observaciones-resumen"><b>Observaciones:</b> ${escapar(observaciones)}</p>` : ''}`;
}

function pasoAprobarPlanilla(v) {
  const c = v.calculo;
  const aprobada = v.estado === 'APROBADA';
  return `
    <h2 class="titulo-paso">2. Aprobar planilla</h2>
    ${barraEmpleado(v, { conSelector: false })}
    <div class="rejilla-aprobar">
      <div class="tarjeta-nom resumen-nomina">
        <h3>${ICONO.checkCirculo} Resumen de planilla</h3>
        ${listasPlanilla(c, v.observaciones)}
      </div>
      <div class="tarjeta-nom resultado-final">
        <h3>${ICONO.checkCirculo} Resultado final</h3>
        <p class="etiqueta-total">TOTAL LÍQUIDO A RECIBIR</p>
        <p class="total-grande">${escapar(Q(c.liquido))}</p>
        <div class="checks-final">
          <div><span>${ICONO.checkCirculo} Datos del empleado</span><b>Verificados</b></div>
          <div><span>${ICONO.checkCirculo} Ingresos y descuentos</span><b>Revisados</b></div>
          <div><span>${ICONO.checkCirculo} Planilla</span><b>${aprobada ? 'Aprobada' : 'Lista para aprobar'}</b></div>
        </div>
        ${aprobada ? `<p class="nota-aprobada">Aprobada por <b>${escapar(v.aprobado_por || '—')}</b> el ${fechaHora(v.fecha_aprobacion)} · Recibo No. <b>${v.numero_recibo}</b></p>`
          : `<p class="aviso-bloqueo">${ICONO.info} Al aprobar, los valores quedarán bloqueados y se generará el comprobante.</p>
             <button type="button" class="btn-nom-linea" data-accion="ir-paso" data-paso="1">← Volver para corregir</button>`}
      </div>
    </div>
    ${piePasos(aprobada ? '' : btnVolver('Volver a preparar planilla', 1),
      aprobada ? '<button type="button" class="btn-nom-rojo" data-accion="ir-paso" data-paso="3">Ver comprobante →</button>'
        : `<button type="button" class="btn-nom-rojo grande" data-accion="aprobar">${ICONO.aprobar} Aprobar planilla</button>`)}`;
}

function cuerpoComprobantePlanilla(doc) {
  const ing = doc.secciones.find(s => s.clave === 'ingresos');
  const des = doc.secciones.find(s => s.clave === 'descuentos');
  const fila = f => `<div class="fila-aprobar"><span>${escapar(f.concepto)}${f.detalle ? `<small>${escapar(f.detalle)}</small>` : ''}</span><b>${escapar(f.montoTexto)}</b></div>`;
  return `
    <div class="cab-recibo">${ICONO.checkCirculo}<div><b>Comprobante generado correctamente</b><span>Recibo No. <em>${doc.numeroRecibo}</em></span></div></div>
    <div class="barra-empleado">
      <span class="icono-barra">${ICONO.persona}</span>
      <div><span>Empleado No.</span><b>${doc.empleado.codigo_empleado}</b></div>
      <div><span>Nombre:</span><b>${escapar(doc.empleado.nombre)}</b></div>
      <div><span>Puesto:</span><b>${escapar(doc.empleado.puesto || '—')}</b></div>
      <div><span>Período:</span><b>${escapar(doc.periodoNombre)}</b></div>
    </div>
    <div class="cuerpo-recibo">
      <div>
        <p class="sec-aprobar azul">INGRESOS</p>
        ${ing.filas.map(fila).join('')}
        <div class="fila-aprobar subtotal azul"><span>TOTAL DE INGRESOS</span><b>${escapar(ing.total.montoTexto)}</b></div>
        <p class="sec-aprobar rojo">DESCUENTOS</p>
        ${des.filas.map(fila).join('')}
        <div class="fila-aprobar subtotal rojo"><span>TOTAL DE DESCUENTOS</span><b>${escapar(des.total.montoTexto)}</b></div>
        ${doc.observaciones ? `<p class="observaciones-resumen"><b>Observaciones:</b> ${escapar(doc.observaciones)}</p>` : ''}
      </div>
      <div class="resumen-recibo">
        <p class="etiqueta-total">Resumen de pago</p>
        <p class="total-grande">${escapar(doc.liquidoTexto)}</p>
        <p class="etiqueta-total">LÍQUIDO A RECIBIR</p>
        <div class="datos-banco">
          <div><span>Forma de pago:</span><b>${escapar(doc.pago.forma)}</b></div>
          <div><span>Banco:</span><b>${escapar(doc.pago.banco)}</b></div>
          <div><span>Cuenta:</span><b>${escapar(doc.pago.cuenta)}</b></div>
        </div>
        <span class="pill-ok">${ICONO.checkCirculo} Documento listo para descargar</span>
      </div>
    </div>`;
}

function pasoComprobantePlanilla(v) {
  return `
    <h2 class="titulo-paso">3. Comprobante de pago</h2>
    <div class="rejilla-recibo">
      <div class="tarjeta-nom" id="cajaDocumento"><p class="cargando-nom"><span class="spinner"></span>Preparando comprobante…</p></div>
      <div class="acciones-recibo">
        <button type="button" class="btn-nom-rojo" data-accion="pdf">${ICONO.descargar} Descargar comprobante PDF</button>
        <button type="button" class="btn-nom-linea" data-accion="imprimir">${ICONO.imprimir} Imprimir comprobante</button>
        <button type="button" class="enlace-nom" data-accion="historial">Ver historial de comprobantes →</button>
      </div>
    </div>
    ${piePasos(btnVolver('Volver a aprobación', 2), '<button type="button" class="btn-nom-azul" data-accion="nueva">Procesar otra planilla</button>')}`;
}

/* ============================================================
   Eventos de la pantalla del paso (delegados)
   ============================================================ */
function activarEventosPaso(caja) {
  caja.onclick = async e => {
    const lapiz = e.target.closest('.btn-lapiz');
    if (lapiz) return abrirEdicion(lapiz.closest('.editable'));
    const b = e.target.closest('[data-accion]');
    if (!b || b.disabled) return;
    const v = estado.vista;
    switch (b.dataset.accion) {
      case 'cargar': return abrirModalCargar();
      case 'cancelar-importacion': return abrirCancelarImportacion();
      case 'completar': {
        const paso = Number(b.dataset.paso);
        return completarPaso(paso, b, paso === 1 && esTecnico(v.tipo) ? 'Validando archivo…' : 'Guardando…');
      }
      case 'ir-paso': return irAPaso(Number(b.dataset.paso));
      case 'tipos': return irA('');
      case 'nueva': estado.periodo = v.periodo; return irA('');
      case 'historial': return irA('historial');
      case 'aprobar': return abrirModalAprobar();
      case 'detalle': return abrirDetalle();
      case 'pdf': return descargarPdf(b, v.id_nomina);
      case 'imprimir': return abrirImpresion(b);
      case 'abrir-existente': return irA('nomina=' + b.dataset.id);
      case 'mostrar-form-descuento': {
        const f = $('formDescuento'); f.hidden = false; $('dConcepto').focus(); b.hidden = true; return;
      }
      case 'cancelar-descuento': return pintarProceso();
      case 'eliminar-descuento': {
        const d = (v.descuentos_extra || []).find(x => String(x.id) === b.dataset.id);
        return confirmar('¿Eliminar este descuento?', `"${d ? d.concepto : ''}" se quitará del total de descuentos.`, 'Eliminar', async () => {
          try { actualizarVista(await pedir(`/api/nominas/${v.id_nomina}/descuentos/${b.dataset.id}`, { method: 'DELETE' })); avisar('Descuento eliminado.'); }
          catch (error) { avisar(error.message); }
        });
      }
      case 'restablecer-salario': return guardarValor('salario_mes', null);
      case 'igss-auto': return guardarValor('planilla.igss', null);
    }
  };

  const form = $('formDescuento');
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const concepto = $('dConcepto').value.trim();
      const monto = Calc.aCentavos($('dMonto').value);
      if (concepto.length < 2) { avisar('Escribe el concepto del descuento.'); $('dConcepto').focus(); return; }
      if (monto === null || monto <= 0) { avisar('Escribe un monto válido mayor a cero.'); $('dMonto').focus(); return; }
      await conBoton(form.querySelector('[type=submit]'), 'Guardando…', async () => {
        try {
          actualizarVista(await pedir(`/api/nominas/${estado.vista.id_nomina}/descuentos`, { method: 'POST', body: { concepto, descripcion: $('dDescripcion').value.trim(), monto: (monto / 100).toFixed(2) } }));
          avisar('Descuento agregado.');
        } catch (error) { avisar(error.message); }
      });
    });
    // Sin vista previa en los totales: el descuento solo cuenta cuando se guarda.
    // (Antes se sumaba mientras se escribía y, si el monto se borraba o no se
    // guardaba, el TOTAL DE DESCUENTOS se quedaba con un valor que no existía.)
    $('dMonto').addEventListener('input', () => {
      const t = $('dMonto').value.trim();
      const c = Calc.aCentavos(t);
      $('dMonto').classList.toggle('invalido', t !== '' && (c === null || c <= 0));
    });
  }

  // Técnico del reporte (archivo de facturación con varios técnicos)
  const selTec = $('selectTecnico');
  if (selTec) selTec.addEventListener('change', () => {
    if (!selTec.value) return;
    conBoton(null, '', async () => {
      try {
        actualizarVista(await pedir(`/api/nominas/${estado.vista.id_nomina}/inspector`, { method: 'PUT', body: { nombre: selTec.value } }));
        const v = estado.vista;
        avisar(v.empleado ? `Reporte de ${v.importacion.inspector} asignado a ${v.empleado.nombre}.` : `${v.importacion.inspector} no está registrado en Empleados: regístralo para poder pagarle.`);
      } catch (error) { avisar(error.message); pintarProceso(); }
    });
  });

  // Empleado (planilla)
  const sel = $('selectEmpleado');
  if (sel) sel.addEventListener('change', () => {
    if (!sel.value) return;
    conBoton(null, '', async () => {
      try {
        actualizarVista(await pedir(`/api/nominas/${estado.vista.id_nomina}/empleado`, { method: 'PUT', body: { codigo_empleado: Number(sel.value) } }));
      } catch (error) {
        if (error.extra && error.extra.existente) {
          confirmar(error.extra.aprobada ? 'Ya existe una planilla aprobada' : 'Ya existe una planilla en preparación', error.message, 'Abrir la existente', () => irA('nomina=' + error.extra.existente));
        } else avisar(error.message);
        pintarProceso();
      }
    });
  });

  // Montos con campo directo (planilla): recalcula al escribir, guarda al salir
  caja.querySelectorAll('[data-campo-input]').forEach(input => {
    const campo = input.dataset.campoInput;
    const original = input.value;
    input.addEventListener('input', () => {
      const c = Calc.aCentavos(input.value);
      input.classList.toggle('invalido', input.value.trim() !== '' && (c === null || c < 0));
      // vacío o inválido: se vuelven a mostrar los totales guardados (no se queda la vista previa)
      if (c === null || c < 0) { pintarMontos(estado.vista.calculo); return; }
      const datos = datosLocales();
      aplicarCampoLocal(datos, campo, c);
      pintarMontos(calcularLocal(datos));
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = original; input.blur(); } });
    input.addEventListener('change', () => {
      const texto = input.value.trim();
      if (texto === original) return;
      const c = texto === '' ? null : Calc.aCentavos(texto);
      if (texto !== '' && (c === null || c < 0)) { avisar('Escribe un monto válido (ej. 1250.00).'); input.value = original; return; }
      if (texto === '' && campo !== 'planilla.igss') { guardarValor(campo, '0'); return; }
      guardarValor(campo, c === null ? null : (c / 100).toFixed(2));
    });
  });

  // Textos (observaciones, datos de pago, descripciones): guardan al salir del campo
  caja.querySelectorAll('[data-texto]').forEach(el => {
    const original = el.value;
    el.addEventListener('change', () => { if (el.value !== original) guardarValor(el.dataset.texto, el.value, { silencioso: true }); });
  });
  caja.querySelectorAll('[data-check]').forEach(el => el.addEventListener('change', () => guardarValor(el.dataset.check, el.checked)));
}

/* ---------------- edición con lápiz ---------------- */
function abrirEdicion(span) {
  if (!span || estado.vista.estado === 'APROBADA') return;
  if (estado.editando) cerrarEdicion();
  const campo = span.dataset.campo;
  const valor = span.dataset.valor === '' ? '' : (Number(span.dataset.valor) / 100).toFixed(2);
  estado.editando = { campo, span, html: span.innerHTML };
  span.classList.add('editando');
  span.innerHTML = `
    <input type="text" inputmode="decimal" class="input-lapiz" value="${valor}" aria-label="Nuevo valor">
    <button type="button" class="btn-ok" title="Guardar" aria-label="Guardar">${ICONO.check}</button>
    <button type="button" class="btn-cancelar" title="Cancelar" aria-label="Cancelar">✕</button>`;
  const input = span.querySelector('input');
  input.focus();
  input.select();
  const vistaPrevia = () => {
    const c = Calc.aCentavos(input.value);
    input.classList.toggle('invalido', c === null || c < 0);
    if (c === null || c < 0) { pintarMontos(estado.vista.calculo); return; }
    const datos = datosLocales();
    aplicarCampoLocal(datos, campo, c);
    pintarMontos(calcularLocal(datos));
  };
  const guardar = () => {
    const c = Calc.aCentavos(input.value);
    if (c === null || c < 0) { avisar('Escribe un monto válido, mayor o igual a cero (ej. 158.00).'); input.focus(); return; }
    guardarValor(campo, (c / 100).toFixed(2));
  };
  input.addEventListener('input', vistaPrevia);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); guardar(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarEdicion(true); }
  });
  span.querySelector('.btn-ok').addEventListener('click', e => { e.stopPropagation(); guardar(); });
  span.querySelector('.btn-cancelar').addEventListener('click', e => { e.stopPropagation(); cerrarEdicion(true); });
}

function cerrarEdicion(restaurar) {
  const ed = estado.editando;
  if (!ed) return;
  estado.editando = null;
  if (restaurar && document.body.contains(ed.span)) {
    ed.span.classList.remove('editando');
    ed.span.innerHTML = ed.html;
    pintarMontos(estado.vista.calculo);
  }
}

async function guardarValor(campo, valor, { silencioso = false } = {}) {
  const v = estado.vista;
  try {
    const nueva = await pedir(`/api/nominas/${v.id_nomina}/valores`, { method: 'PATCH', body: { campo, valor } });
    const bajoEstado = v.estado === 'PENDIENTE_APROBACION' && nueva.estado !== 'PENDIENTE_APROBACION';
    actualizarVista(nueva);
    if (!silencioso) avisar(bajoEstado ? 'Valor guardado. Como cambió un importe, vuelve a confirmar este paso.' : 'Valor guardado y totales recalculados.');
    else avisar('Guardado.');
  } catch (error) {
    avisar(error.message);
    if (error.status === 409) abrirNomina(v.id_nomina, { silencioso: true });
    else pintarProceso();
  }
}

/* ---------------- recálculo inmediato en el navegador ---------------- */
function datosLocales() {
  const v = estado.vista;
  const copia = o => JSON.parse(JSON.stringify(o || {}));
  return {
    importacion: { actividades: esTecnico(v.tipo) ? v.calculo.actividades.map(a => ({ nombre: a.nombre, cantidad: a.cantidad })) : [] },
    ajustes: copia(v.ajustes), precios: copia(v.precios), planilla: copia(v.planilla),
    descuentos_extra: copia(v.descuentos_extra || [])
  };
}

function aplicarCampoLocal(d, campo, c) {
  if (campo.startsWith('cargo:')) { d.ajustes.cargos = d.ajustes.cargos || {}; d.ajustes.cargos[campo.slice(6)] = c; }
  else if (campo.startsWith('precio:')) {
    const partes = campo.split(':'); const tipo = partes.pop(); const act = partes.slice(1).join(':');
    d.precios[act] = { ...(d.precios[act] || {}), [tipo]: c };
  }
  else if (campo.startsWith('planilla.')) d.planilla[campo.slice(9)] = c;
  else d.ajustes[campo] = c;
}

function calcularLocal(datos) {
  const v = estado.vista;
  const reglas = v.reglas || estado.reglas.tipos[v.tipo];
  return esTecnico(v.tipo)
    ? Calc.calcularTecnico(datos, reglas, estado.reglas.actividadesOficiales, v.preciosCatalogo)
    : Calc.calcularAdministrativa(datos, reglas);
}

function mapaMontos(c) {
  const m = {};
  ['total', 'bono', 'salario', 'salarioSugerido', 'totalSinDescuentos', 'totalDescuentos', 'totalCargos', 'totalIngresos', 'liquido'].forEach(k => { if (c[k] !== undefined) m[k] = c[k]; });
  if (c.produccion) Object.entries(c.produccion).forEach(([k, val]) => { m['prod.' + k] = val; });
  if (c.produccion) m['mantenimiento_vehiculos'] = c.produccion.mantenimiento;
  (c.cargos || []).forEach(x => { m['cargo:' + x.clave] = x.monto; });
  (c.descuentos || []).forEach(d => { m[d.clave] = d.monto; m['desc:' + d.clave] = d.monto; });
  if (c.salario !== undefined) m['salario_mes'] = c.salario;
  (c.actividades || []).forEach((a, i) => {
    m[`act:${i}:p`] = a.totalProduccion; m[`act:${i}:b`] = a.totalBono;
    m[`precio:${a.nombre}:bono`] = a.precioBono; m[`precio:${a.nombre}:produccion`] = a.precioProduccion;
  });
  return m;
}

function pintarMontos(c) {
  const m = mapaMontos(c);
  document.querySelectorAll('#contenidoPaso [data-monto]').forEach(el => {
    const k = el.dataset.monto;
    if (!(k in m) || m[k] === null) return;
    if (el.closest('.editando')) return;
    el.textContent = Q(m[k]);
    el.classList.remove('destello'); void el.offsetWidth; el.classList.add('destello');
  });
}

/* ============================================================
   Modal: cargar archivo EEGSA
   ============================================================ */
let archivoElegido = null;

function abrirModalCargar() {
  archivoElegido = null;
  $('periodoModalCargar').textContent = estado.vista.periodoNombre;
  $('inputExcel').value = '';
  $('errorCargar').hidden = true;
  $('btnContinuarCargar').disabled = true;
  $('zonaExcel').classList.remove('con-archivo', 'arrastrando');
  $('textoZonaExcel').textContent = 'Arrastra el archivo de EEGSA aquí';
  $('subZonaExcel').textContent = 'o selecciona el archivo desde tu equipo';
  abrirModal('modalCargar');
}

function revisarArchivo(archivo) {
  $('errorCargar').hidden = true;
  archivoElegido = null;
  $('btnContinuarCargar').disabled = true;
  if (!archivo) return;
  const ext = (archivo.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  let error = null;
  if (!estado.reglas.archivo.extensiones.includes(ext)) error = `"${archivo.name}" no es un Excel. Formatos permitidos: .xlsx y .xls.`;
  else if (archivo.size === 0) error = 'El archivo está vacío.';
  else if (archivo.size > estado.reglas.archivo.tamanoMaximo) error = `El archivo pesa ${tamanoBonito(archivo.size)}; el máximo es 10 MB.`;
  if (error) {
    $('errorCargar').textContent = error;
    $('errorCargar').hidden = false;
    $('zonaExcel').classList.remove('con-archivo');
    return;
  }
  archivoElegido = archivo;
  $('zonaExcel').classList.add('con-archivo');
  $('textoZonaExcel').textContent = archivo.name;
  $('subZonaExcel').textContent = `${tamanoBonito(archivo.size)} · listo para validar`;
  $('btnContinuarCargar').disabled = false;
}

$('inputExcel').addEventListener('change', e => revisarArchivo(e.target.files[0]));
['dragenter', 'dragover'].forEach(ev => $('zonaExcel').addEventListener(ev, e => { e.preventDefault(); $('zonaExcel').classList.add('arrastrando'); }));
['dragleave', 'drop'].forEach(ev => $('zonaExcel').addEventListener(ev, e => { e.preventDefault(); $('zonaExcel').classList.remove('arrastrando'); }));
$('zonaExcel').addEventListener('drop', e => revisarArchivo(e.dataTransfer.files[0]));
$('btnCerrarCargar').addEventListener('click', () => cerrarModal('modalCargar'));
$('btnContinuarCargar').addEventListener('click', () => {
  if (!archivoElegido) return;
  conBoton($('btnContinuarCargar'), 'Procesando archivo…', async () => {
    const formulario = new FormData();
    formulario.append('archivo', archivoElegido);
    try {
      const v = await pedir(`/api/nominas/${estado.vista.id_nomina}/importar`, { method: 'POST', body: formulario });
      cerrarModal('modalCargar');
      actualizarVista(v);
      avisar(v.validacion && v.validacion.ok ? 'Archivo cargado correctamente.' : 'Archivo cargado: revisa las observaciones en la validación.');
    } catch (error) {
      $('errorCargar').textContent = error.message;
      $('errorCargar').hidden = false;
    }
  });
});

/* ============================================================
   Modal: cancelar importación
   ============================================================ */
function abrirCancelarImportacion() {
  const v = estado.vista;
  const a = v.importacion.archivo;
  const ok = v.validacion && v.validacion.ok;
  $('fichaCancelar').innerHTML = `
    <div class="ficha-arriba">
      <span class="icono-xls">${ICONO.excel}</span>
      <div><b>${escapar(a.nombre)}</b><small>${tamanoBonito(a.tamano)} &nbsp;|&nbsp; ${a.registros} registros encontrados</small></div>
      <span class="pill-estado ${ok ? 'ok' : 'mal'}">${ok ? 'Archivo validado' : 'Con observaciones'}</span>
    </div>
    <div class="ficha-abajo">
      <div><span>Período</span><b>${escapar(v.periodoNombre)}</b></div>
      <div><span>Importado por:</span><b>${escapar(a.subido_por || '—')}</b></div>
    </div>`;
  abrirModal('modalCancelarImportacion');
}
$('btnSeguirImportacion').addEventListener('click', () => cerrarModal('modalCancelarImportacion'));
$('btnSiCancelarImportacion').addEventListener('click', () => conBoton($('btnSiCancelarImportacion'), 'Cancelando…', async () => {
  try {
    const v = await pedir(`/api/nominas/${estado.vista.id_nomina}/importacion`, { method: 'DELETE' });
    cerrarModal('modalCancelarImportacion');
    actualizarVista(v);
    avisar('Importación cancelada. Las nóminas anteriores no se modificaron.');
  } catch (error) { avisar(error.message); }
}));

/* ============================================================
   Modal: aprobar (con protección contra doble clic)
   ============================================================ */
function abrirModalAprobar() {
  const v = estado.vista;
  $('tituloAprobar').textContent = esTecnico(v.tipo) ? '¿Aprobar la nómina?' : '¿Aprobar la planilla?';
  $('textoAprobar').textContent = `${nombreEmpleado(v)} · ${v.tipoNombre} · ${v.periodoNombre}`;
  $('totalAprobar').textContent = Q(v.calculo.total);
  abrirModal('modalAprobar');
}
$('btnNoAprobar').addEventListener('click', () => cerrarModal('modalAprobar'));
$('btnSiAprobar').addEventListener('click', () => conBoton($('btnSiAprobar'), 'Aprobando…', async () => {
  const v = estado.vista;
  try {
    const nueva = await pedir(`/api/nominas/${v.id_nomina}/aprobar`, { method: 'POST', body: { version: v.version } });
    cerrarModal('modalAprobar');
    avisar(`${esTecnico(v.tipo) ? 'Nómina aprobada' : 'Planilla aprobada'}. Recibo No. ${nueva.numero_recibo}.`);
    actualizarVista(await pedir(`/api/nominas/${v.id_nomina}/pasos/${nueva.pasos.length}/ir`, { method: 'POST' }).catch(() => nueva));
  } catch (error) {
    cerrarModal('modalAprobar');
    avisar(error.message);
    abrirNomina(v.id_nomina, { silencioso: true });
  }
}));

/* ============================================================
   Modal: detalle completo
   ============================================================ */
function abrirDetalle() {
  const v = estado.vista;
  const c = v.calculo;
  const MES = mesMayus(v), a = anio(v);
  const filas = (lista) => lista.map(([t, m, cl]) => `<div class="fila-aprobar ${cl || ''}"><span>${t}</span><b>${escapar(Q(m))}</b></div>`).join('');
  $('cuerpoDetalle').innerHTML = `
    <div class="barra-trabajador">
      <div><span>Trabajador</span><b>${escapar(nombreEmpleado(v))}</b></div>
      <div><span>Período</span><b>${escapar(v.periodoNombre)}</b></div>
      <div><span>Tipo</span><b>${escapar(v.tipoNombre)}</b></div>
    </div>
    <h4>Actividades</h4>
    <div class="tabla-detalle">
      <div class="fila-detalle encabezado"><span>Actividad</span><span>Órdenes</span><span>Precio</span><span>Producción</span><span>Precio bono</span><span>Bono</span></div>
      ${c.actividades.map(x => `<div class="fila-detalle"><span>${escapar(x.nombre)}${x.nueva ? ' <i class="chip-nueva">Nueva</i>' : ''}</span><span>${x.cantidad}</span><span>${x.precioProduccion === null ? '—' : Q(x.precioProduccion)}</span><span>${Q(x.totalProduccion)}</span><span>${x.precioBono === null ? '—' : Q(x.precioBono)}</span><span>${Q(x.totalBono)}</span></div>`).join('')}
      <div class="fila-detalle total"><span>TOTAL</span><span>${c.totalOrdenes}</span><span></span><span>${Q(c.produccion.conIva)}</span><span></span><span>${Q(c.bono)}</span></div>
    </div>
    <div class="dos-columnas">
      <div>
        <h4>Producción SEISA</h4>
        ${filas([['Total de producción con IVA', c.produccion.conIva], ['Total de producción sin IVA', c.produccion.sinIva], ['IVA', c.produccion.iva], ['Retención ISR', c.produccion.isr], ['Descuento a la producción', c.produccion.descuentoProduccion], ['Subtotal', c.produccion.subtotalProduccion, 'subtotal'], ['Aporte SEISA', c.produccion.aporteSeisa], ['Renovación de flotilla', c.produccion.flotilla], ['Mantenimiento de vehículos', c.produccion.mantenimiento], ['Subtotal producción SEISA', c.produccion.subtotalSeisa, 'subtotal']])}
        <h4>Descuentos SEISA (cargos)</h4>
        ${filas(c.cargos.map(x => [escapar(x.nombre), x.monto]))}
        ${filas([['Total cargos SEISA', c.totalCargos, 'subtotal']])}
      </div>
      <div>
        <h4>Bonificación y salario</h4>
        ${filas([[`Bono de producción ${MES} ${a}`, c.bono], [`Salario mes de ${MES} ${a}`, c.salario], ['Total sin descuentos', c.totalSinDescuentos, 'subtotal']])}
        <h4>Descuentos predeterminados</h4>
        ${filas(c.descuentos.filter(d => !d.manual).map(d => [escapar(d.nombre), d.monto]))}
        <h4>Descuentos agregados manualmente</h4>
        ${c.descuentos.some(d => d.manual) ? filas(c.descuentos.filter(d => d.manual).map(d => [escapar(d.nombre) + (d.descripcion ? `<small>${escapar(d.descripcion)}</small>` : ''), d.monto])) : '<p class="vacio-mini">Ninguno.</p>'}
        ${filas([['Total de descuentos', c.totalDescuentos, 'subtotal rojo']])}
        ${v.observaciones ? `<h4>Observaciones</h4><p class="observaciones-resumen">${escapar(v.observaciones)}</p>` : ''}
        <div class="barra-total verde"><span>RESULTADO FINAL · TOTAL PAGO A RECIBIR</span><b>${escapar(Q(c.total))}</b></div>
      </div>
    </div>`;
  abrirModal('modalDetalle');
}

/* ============================================================
   PDF e impresión (siempre desde el comprobante aprobado)
   ============================================================ */
async function descargarPdf(boton, idNomina) {
  await conBoton(boton, 'Generando PDF…', async () => {
    try {
      const r = await fetch(`/api/nominas/${idNomina}/comprobante.pdf`);
      if (!r.ok) {
        let mensaje = 'No se pudo generar el PDF.';
        try { mensaje = (await r.json()).mensaje || mensaje; } catch (_) { /* respuesta no JSON */ }
        throw new Error(mensaje);
      }
      const nombre = decodeURIComponent(r.headers.get('X-Nombre-Archivo') || 'comprobante.pdf');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      const doc = estado.documento && estado.documento.numeroRecibo ? estado.documento : null;
      $('textoDescargado').textContent = `El comprobante${doc ? ' de ' + doc.empleado.nombre : ''} se guardó en tu equipo`;
      $('nombreDescargado').textContent = nombre;
      abrirModal('modalDescargado');
    } catch (error) {
      avisar(error.message.startsWith('Failed') ? 'Error de red al generar el PDF.' : error.message);
    }
  });
}

function htmlComprobanteImpreso(doc) {
  const fila = f => `<tr><td>${escapar(f.concepto)}${f.detalle ? ` <small>— ${escapar(f.detalle)}</small>` : ''}${f.manual ? ' <small>(agregado)</small>' : ''}</td><td class="m">${escapar(f.montoTexto)}</td></tr>`;
  const seccion = s => `
    <table class="tabla-imp ${s.clave}">
      <thead><tr><th colspan="2">${escapar(s.titulo.toUpperCase())}</th></tr></thead>
      <tbody>${s.filas.map(fila).join('')}</tbody>
      ${s.total ? `<tfoot><tr><td>${escapar(s.total.concepto.toUpperCase())}</td><td class="m">${escapar(s.total.montoTexto)}</td></tr></tfoot>` : ''}
    </table>`;
  const actividades = doc.actividades ? `
    <table class="tabla-imp actividades">
      <thead><tr><th>Actividad</th><th class="m">Órdenes</th><th class="m">Precio</th><th class="m">Producción</th><th class="m">Bono</th></tr></thead>
      <tbody>${doc.actividades.map(a => `<tr><td>${escapar(a.nombre)}</td><td class="m">${a.cantidad}</td><td class="m">${a.precioProduccion === null ? '—' : Q(a.precioProduccion)}</td><td class="m">${Q(a.totalProduccion)}</td><td class="m">${Q(a.totalBono)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>TOTAL</td><td class="m">${doc.totalOrdenes}</td><td></td><td class="m">${Q(doc.actividades.reduce((s, a) => s + a.totalProduccion, 0))}</td><td class="m">${Q(doc.actividades.reduce((s, a) => s + a.totalBono, 0))}</td></tr></tfoot>
    </table>` : '';
  return `
    <div class="recibo-imp">
      <div class="cab-imp">
        <img src="img/logo.png" alt="SEISA">
        <div><b>SICORP — SEISA</b><span>Sistemas Eléctricos Integrados, S.A.</span><span>Generado: ${fechaHora(doc.fechaGeneracion)}</span></div>
      </div>
      <h2>COMPROBANTE DE PAGO</h2>
      <p class="recibo-num">Recibo No. <b>${doc.numeroRecibo}</b></p>
      <div class="datos-imp">
        <div><span>Empleado No.</span><b>${doc.empleado.codigo_empleado}</b></div>
        <div><span>Nombre</span><b>${escapar(doc.empleado.nombre)}</b></div>
        <div><span>Puesto</span><b>${escapar(doc.empleado.puesto || '—')}</b></div>
        <div><span>Período</span><b>${escapar(doc.periodoNombre)}</b></div>
        <div><span>Tipo de nómina</span><b>${escapar(doc.tipoNombre)}</b></div>
        ${doc.inspector ? `<div><span>Inspector</span><b>${escapar(doc.inspector)}</b></div>` : ''}
      </div>
      ${actividades}
      <div class="secciones-imp">${doc.secciones.map(seccion).join('')}</div>
      <div class="pago-imp">
        <div><span>LÍQUIDO A RECIBIR</span><b>${escapar(doc.liquidoTexto)}</b></div>
        <div class="banco-imp"><span>Forma de pago: <b>${escapar(doc.pago.forma)}</b></span><span>Banco: <b>${escapar(doc.pago.banco)}</b></span><span>Cuenta: <b>${escapar(doc.pago.cuenta)}</b></span></div>
      </div>
      ${doc.observaciones ? `<p class="obs-imp"><b>Observaciones:</b> ${escapar(doc.observaciones)}</p>` : ''}
      <div class="firmas-imp"><span>Firma del empleado (conformidad)</span><span>Aprobado por: ${escapar(doc.aprobadoPor || '—')}</span></div>
    </div>`;
}

async function abrirImpresion(boton, idNomina) {
  await conBoton(boton, 'Preparando…', async () => {
    let doc = null;
    try {
      doc = idNomina ? await pedir(`/api/nominas/${idNomina}/comprobante`) : await cargarDocumento();
    } catch (error) { avisar(error.message); }
    if (!doc) return;
    const html = htmlComprobanteImpreso(doc);
    $('hojaPrevia').innerHTML = html;
    $('areaImpresion').innerHTML = html;
    abrirModal('modalImprimir');
  });
}
$('btnImprimirAhora').addEventListener('click', () => {
  avisar('Enviando a impresión…');
  document.body.classList.add('imprimiendo');
  setTimeout(() => window.print(), 50);
});
window.addEventListener('afterprint', () => {
  document.body.classList.remove('imprimiendo');
  cerrarModal('modalImprimir');
});

/* ============================================================
   VISTA: historial de comprobantes
   ============================================================ */
function llenarFiltrosHistorial() {
  $('hEmpleado').innerHTML = '<option value="">Todos los empleados</option>' +
    estado.empleados.map(e => `<option value="${e.codigo_empleado}">${escapar(e.nombre + ' ' + e.apellido)}</option>`).join('');
  $('hTipo').innerHTML = '<option value="">Todos los tipos</option>' +
    Object.values(estado.reglas.tipos).map(t => `<option value="${t.clave}">${escapar(t.nombre)}</option>`).join('');
  let temporizador;
  $('hTexto').addEventListener('input', () => { clearTimeout(temporizador); temporizador = setTimeout(cargarHistorialNom, 300); });
  ['hEmpleado', 'hPeriodo', 'hTipo', 'hEstado'].forEach(id => $(id).addEventListener('change', cargarHistorialNom));
}

function mostrarHistorial() {
  mostrarSeccion('v-historial');
  pintarEncabezado({ migas: ['Historial de comprobantes'], sub: 'Consulta, descarga e imprime los comprobantes de nómina.', conPeriodo: false, conEstado: false });
  $('tituloNom').textContent = 'Gestión de nóminas';
  cargarHistorialNom();
}

function borrarDelHistorial(id, aprobada, desc) {
  if (aprobada) {
    confirmar('¿Eliminar este comprobante aprobado?',
      `${desc}. Dejará de aparecer en el historial y el empleado podrá volver a hacer su nómina de ese período. El número de recibo no se vuelve a usar y queda registrado quién lo eliminó.`,
      'Eliminar comprobante', async () => {
        try { await pedir(`/api/nominas/${id}/eliminar-aprobada`, { method: 'POST', body: {} }); avisar('Comprobante eliminado del historial.'); }
        catch (error) { avisar(error.message); }
        cargarHistorialNom();
      });
  } else {
    confirmar('¿Descartar este borrador?', `${desc}. Se borrará junto con su archivo importado.`, 'Descartar', async () => {
      try { await pedir('/api/nominas/' + id, { method: 'DELETE' }); avisar('Borrador descartado.'); }
      catch (error) { avisar(error.message); }
      cargarHistorialNom();
    });
  }
}

async function cargarHistorialNom() {
  const p = new URLSearchParams();
  if ($('hTexto').value.trim()) p.set('texto', $('hTexto').value.trim());
  if ($('hEmpleado').value) p.set('codigo_empleado', $('hEmpleado').value);
  if ($('hPeriodo').value) p.set('periodo', $('hPeriodo').value);
  if ($('hTipo').value) p.set('tipo', $('hTipo').value);
  if ($('hEstado').value) p.set('estado', $('hEstado').value);
  const caja = $('listaHistorialNom');
  caja.innerHTML = '<p class="cargando-nom"><span class="spinner"></span>Cargando…</p>';
  try {
    const lista = await pedir('/api/nominas?' + p.toString());
    $('sinHistorialNom').hidden = lista.length > 0;
    caja.innerHTML = lista.map(n => {
      const [txt, clase] = TEXTO_ESTADO[n.estado] || ['', ''];
      const aprobada = n.estado === 'APROBADA';
      return `
        <div class="fila-nom">
          <span><b>${n.numero_recibo || '—'}</b></span>
          <span>${fechaHora(n.fecha_aprobacion || n.fecha_actualizacion)}</span>
          <span>${n.empleado ? escapar(n.empleado) : '<i class="tenue">Sin empleado</i>'}</span>
          <span>${escapar(n.tipoNombre)}</span>
          <span>${escapar(n.periodoNombre)}</span>
          <span><i class="estado-nom mini ${clase}">${txt}</i></span>
          <span class="der"><b class="${aprobada ? 'verde' : ''}">${n.totalTexto || '—'}</b></span>
          <span class="der acciones-historial">
            <button type="button" class="btn-nom-linea chico" data-ver="${n.id_nomina}">${aprobada ? 'Ver' : 'Abrir'}</button>
            <button type="button" class="btn-icono btn-mas" data-mas="${n.id_nomina}" data-aprobada="${aprobada ? 1 : ''}"
              data-desc="${escapar((aprobada ? 'Recibo No. ' + n.numero_recibo + ' · ' : '') + (n.empleado || 'Sin empleado') + ' · ' + n.tipoNombre + ' · ' + n.periodoNombre + (n.totalTexto ? ' · ' + n.totalTexto : ''))}"
              title="Más acciones" aria-label="Más acciones" aria-haspopup="menu" aria-expanded="false">${ICONO.mas}</button>
          </span>
        </div>`;
    }).join('');
    caja.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => irA('nomina=' + b.dataset.ver)));
    // Menú de los 3 puntos: PDF, imprimir y eliminar (así la fila no se corre)
    caja.querySelectorAll('[data-mas]').forEach(b => b.addEventListener('click', ev => {
      ev.stopPropagation();
      const id = b.dataset.mas;
      const aprobada = !!b.dataset.aprobada;
      const opciones = aprobada ? [
        { texto: 'Descargar PDF', accion: () => { estado.documento = null; descargarPdf(null, id); } },
        { texto: 'Imprimir', accion: () => abrirImpresion(null, id) },
        { texto: 'Eliminar comprobante', peligro: true, accion: () => borrarDelHistorial(id, true, b.dataset.desc) }
      ] : [
        { texto: 'Continuar', accion: () => irA('nomina=' + id) },
        { texto: 'Descartar borrador', peligro: true, accion: () => borrarDelHistorial(id, false, b.dataset.desc) }
      ];
      abrirMenuAcciones(b, opciones);
    }));
  } catch (error) {
    caja.innerHTML = `<p class="vacio">${escapar(error.message)}</p>`;
  }
}