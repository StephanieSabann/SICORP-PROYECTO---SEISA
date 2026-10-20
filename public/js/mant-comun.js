/* ============================================================
   SICORP — SEISA · Mantenimiento: piezas compartidas por los
   paneles de Nómina y Reportes (js/mant-nomina.js).
   Todo texto del servidor entra con textContent, nunca innerHTML.
   ============================================================ */
const MantUI = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  function h(tag, attrs = {}, hijos = []) {
    const n = tag === 'svg' || tag === 'path' ? document.createElementNS(NS, tag) : document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v); });
    (Array.isArray(hijos) ? hijos : [hijos]).forEach(x => {
      if (x === null || x === undefined || x === false) return;
      n.appendChild(typeof x === 'object' ? x : document.createTextNode(String(x)));
    });
    return n;
  }

  /* Llamada al backend que conserva los datos extra del error (p. ej. requiereConfirmacion). */
  async function llamar(url, metodo = 'GET', cuerpo) {
    const r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    if (!(r.headers.get('content-type') || '').includes('application/json')) {
      throw new Error(`El servidor respondió algo inesperado (código ${r.status}). Reinicia el servidor y revisa que tengas los archivos más recientes.`);
    }
    const d = await r.json();
    if (!r.ok || d.exito === false) throw Object.assign(new Error(d.mensaje || 'No se pudo completar la acción.'), { status: r.status, extra: d });
    return d.datos;
  }

  const dinero = n => 'Q' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const porcentaje = n => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';
  function fechaHora(t) {
    if (!t) return '—';
    const d = new Date(String(t).replace(' ', 'T'));
    return isNaN(d) ? String(t) : d.toLocaleString('es-GT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  const insignia = (texto, tono = '') => h('span', { class: `insignia-mant ${tono}` }, texto);
  const estadoVacio = texto => h('p', { class: 'vacio-mant' }, texto);

  /* Barra de sub-pestañas con contenido que se dibuja la primera vez que se abre. */
  function subpestanas(raiz, items, inicial) {
    raiz.replaceChildren();
    const barra = h('div', { class: 'subtabs-mant', role: 'tablist' });
    const cuerpo = h('div', { class: 'cuerpo-subtab' });
    const hechos = new Set();
    function abrir(id, forzar = false) {
      barra.querySelectorAll('button').forEach(b => { const on = b.dataset.id === id; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); });
      cuerpo.querySelectorAll(':scope > section').forEach(s => { s.hidden = s.dataset.id !== id; });
      if (!hechos.has(id) || forzar) {
        hechos.add(id);
        const s = cuerpo.querySelector(`:scope > section[data-id="${id}"]`);
        const item = items.find(i => i.id === id);
        Promise.resolve(item.render(s)).catch(e => { s.replaceChildren(h('p', { class: 'vacio-mant error' }, e.message)); });
      }
    }
    items.forEach(i => {
      const b = h('button', { type: 'button', role: 'tab', 'data-id': i.id, 'aria-selected': 'false' }, i.titulo);
      b.addEventListener('click', () => abrir(i.id));
      barra.appendChild(b);
      cuerpo.appendChild(h('section', { 'data-id': i.id, hidden: true }));
    });
    raiz.append(barra, cuerpo);
    abrir(inicial || items[0].id);
    return { abrir };
  }

  /* Modal de formulario. campos: [{nombre, etiqueta, tipo: text|number|month|time|select|textarea|checkbox, valor, opciones:[{valor,etiqueta}], ayuda, requerido, placeholder}] */
  function formulario({ titulo, texto, campos = [], boton = 'Guardar', alEnviar }) {
    const id = 'modalMant' + Date.now();
    const entradas = {};
    const lista = h('div', { class: 'form-mant' });
    campos.forEach(c => {
      let ctl;
      if (c.tipo === 'select') {
        ctl = h('select', { id: `${id}-${c.nombre}` }, (c.opciones || []).map(o => h('option', { value: o.valor }, o.etiqueta)));
        ctl.value = c.valor ?? '';
      } else if (c.tipo === 'textarea') {
        ctl = h('textarea', { id: `${id}-${c.nombre}`, rows: 3, maxlength: c.max || 200, placeholder: c.placeholder || '' });
        ctl.value = c.valor ?? '';
      } else {
        ctl = h('input', { id: `${id}-${c.nombre}`, type: c.tipo || 'text', placeholder: c.placeholder || '', maxlength: c.max, step: c.paso, min: c.min, max: c.maxValor });
        if (c.tipo === 'checkbox') ctl.checked = !!c.valor; else ctl.value = c.valor ?? '';
      }
      entradas[c.nombre] = ctl;
      lista.appendChild(h('label', { class: 'campo' + (c.tipo === 'checkbox' ? ' check' : ''), for: `${id}-${c.nombre}` }, [h('span', {}, c.etiqueta), ctl, c.ayuda ? h('small', {}, c.ayuda) : null]));
    });
    const error = h('p', { class: 'error-form', role: 'alert' });
    const cancelar = h('button', { type: 'button', class: 'btn-linea' }, 'Cancelar');
    const enviar = h('button', { type: 'submit', class: 'btn-rojo' }, boton);
    const form = h('form', { novalidate: true }, [lista, error, h('div', { class: 'acciones-modal' }, [cancelar, enviar])]);
    const modal = h('div', { class: 'modal modal-mant' }, [h('h3', {}, titulo), texto ? h('p', { class: 'texto-modal' }, texto) : null, form]);
    const fondo = h('div', { class: 'fondo-modal', id, role: 'dialog', 'aria-modal': 'true' }, modal);
    document.body.appendChild(fondo);
    const cerrar = () => { cerrarModal(id); setTimeout(() => fondo.remove(), 50); };
    cancelar.addEventListener('click', cerrar);
    fondo.addEventListener('click', e => { if (e.target === fondo) cerrar(); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      error.textContent = '';
      const valores = {};
      for (const c of campos) {
        const ctl = entradas[c.nombre];
        valores[c.nombre] = c.tipo === 'checkbox' ? ctl.checked : ctl.value.trim();
        if (c.requerido && !valores[c.nombre] && c.tipo !== 'checkbox') { error.textContent = `${c.etiqueta}: es obligatorio.`; ctl.focus(); return; }
      }
      enviar.disabled = true;
      try { await alEnviar(valores); cerrar(); }
      catch (err) { error.textContent = err.message; enviar.disabled = false; }
    });
    abrirModal(id);
    const primero = form.querySelector('input,select,textarea');
    if (primero) primero.focus();
  }

  function tabla(columnas, filas, { vacio = 'Sin registros.' } = {}) {
    if (!filas.length) return estadoVacio(vacio);
    return h('div', { class: 'caja-tabla-mant' }, h('table', { class: 'tabla-mant' }, [
      h('thead', {}, h('tr', {}, columnas.map(c => h('th', { scope: 'col', class: c.num ? 'num' : '' }, c.titulo)))),
      h('tbody', {}, filas.map(f => h('tr', {}, columnas.map(c => {
        const v = c.celda ? c.celda(f) : f[c.campo];
        return h('td', { class: c.num ? 'num' : '' }, v === null || v === undefined || v === '' ? '—' : v);
      }))))
    ]));
  }

  function mesActual() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

  return { h, llamar, dinero, porcentaje, fechaHora, insignia, estadoVacio, subpestanas, formulario, tabla, mesActual };
})();
