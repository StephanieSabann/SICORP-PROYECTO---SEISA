/* ============================================================
   SICORP — SEISA · Gráficas ligeras (SVG/HTML, sin librerías)
   ------------------------------------------------------------
   Donut, barras horizontales, barras verticales y líneas, con
   tooltip al pasar el mouse (o al enfocar con teclado), leyenda
   y una vista de tabla alterna para accesibilidad. Los textos que
   vienen de la base de datos se insertan SIEMPRE con textContent.
   ============================================================ */
(function (global) {
  const NS = 'http://www.w3.org/2000/svg';
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- helpers ---------- */
  function el(tag, attrs = {}, hijos = []) {
    const nodo = ['svg', 'g', 'path', 'circle', 'line', 'text', 'rect', 'polyline', 'title'].includes(tag)
      ? document.createElementNS(NS, tag) : document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => { if (v !== null && v !== undefined) nodo.setAttribute(k, v); });
    (Array.isArray(hijos) ? hijos : [hijos]).forEach(h => {
      if (h === null || h === undefined) return;
      nodo.appendChild(typeof h === 'string' || typeof h === 'number' ? document.createTextNode(String(h)) : h);
    });
    return nodo;
  }
  const entero = n => Math.round(Number(n) || 0).toLocaleString('en-US');
  const decimal = n => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const formatoQ = n => 'Q' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatoQCorto = n => {
    const v = Number(n) || 0;
    return Math.abs(v) >= 1000 ? 'Q' + (v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'k' : 'Q' + Math.round(v);
  };
  const recortar = (t, max) => { t = String(t ?? ''); return t.length > max ? t.slice(0, max - 1) + '…' : t; };

  /* Máximo "redondo" y marcas del eje (0, 1, 2, 5 × 10ⁿ). */
  function escalaBonita(max, marcas = 4) {
    if (!(max > 0)) return { max: marcas, paso: 1 };
    const bruto = max / marcas;
    const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
    const f = bruto / pot;
    const paso = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pot;
    return { max: Math.ceil(max / paso) * paso, paso };
  }

  /* ---------- tooltip único ---------- */
  let tip;
  function tooltip() {
    if (!tip) {
      tip = el('div', { class: 'tip-graf', role: 'status' });
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    return tip;
  }
  const Tip = {
    mostrar(evento, { titulo, filas }) {
      const t = tooltip();
      t.replaceChildren();
      if (titulo) t.appendChild(el('div', { class: 'tip-titulo' }, titulo));
      (filas || []).forEach(f => {
        t.appendChild(el('div', { class: 'tip-fila' }, [
          f.color ? el('i', { style: `background:${f.color}` }) : null,
          el('b', {}, f.valor),
          el('span', {}, f.etiqueta)
        ]));
      });
      t.hidden = false;
      Tip.mover(evento);
    },
    mover(e) {
      const t = tooltip();
      if (t.hidden) return;
      const m = 14;
      let x = (e.clientX ?? 0) + m, y = (e.clientY ?? 0) + m;
      const r = t.getBoundingClientRect();
      if (x + r.width > innerWidth - 8) x = (e.clientX ?? 0) - r.width - m;
      if (y + r.height > innerHeight - 8) y = (e.clientY ?? 0) - r.height - m;
      t.style.left = Math.max(8, x) + 'px';
      t.style.top = Math.max(8, y) + 'px';
    },
    ocultar() { if (tip) tip.hidden = true; }
  };

  /* Pone tooltip a un nodo con el mouse y con el teclado (foco). */
  function conTooltip(nodo, datosTip, { enfocable = true } = {}) {
    const alFoco = () => {
      const r = nodo.getBoundingClientRect();
      Tip.mostrar({ clientX: r.left + r.width / 2, clientY: r.top }, datosTip());
    };
    nodo.addEventListener('pointerenter', e => Tip.mostrar(e, datosTip()));
    nodo.addEventListener('pointermove', Tip.mover);
    nodo.addEventListener('pointerleave', Tip.ocultar);
    if (enfocable) {
      nodo.setAttribute('tabindex', '0');
      nodo.addEventListener('focus', alFoco);
      nodo.addEventListener('blur', Tip.ocultar);
    }
  }

  /* ---------- leyenda ---------- */
  function leyenda(items, { formato, mostrarValor = false } = {}) {
    return el('ul', { class: 'leyenda-graf' }, items.map(i => el('li', {}, [
      el('i', { style: `background:${i.color}` }),
      el('span', {}, i.etiqueta),
      mostrarValor ? el('b', {}, formato ? formato(i.valor, i) : i.valor) : null
    ])));
  }

  /* ============================================================
     DONUT
     ============================================================ */
  function donut(cont, { datos, centro, formato = entero, tamano = 190, grosor = 24, descripcion }) {
    cont.replaceChildren();
    const total = datos.reduce((s, d) => s + (Number(d.valor) || 0), 0);
    const r = (tamano - grosor) / 2, C = 2 * Math.PI * r, c = tamano / 2;
    const svg = el('svg', { viewBox: `0 0 ${tamano} ${tamano}`, class: 'donut', role: 'img', 'aria-label': descripcion || `Gráfica circular: ${datos.map(d => `${d.etiqueta} ${formato(d.valor)}`).join(', ')}` });
    svg.appendChild(el('circle', { cx: c, cy: c, r, fill: 'none', stroke: 'rgba(255,255,255,.07)', 'stroke-width': grosor }));
    if (total > 0) {
      const visibles = datos.filter(d => d.valor > 0);
      const hueco = visibles.length > 1 ? 3 : 0; // separación entre segmentos
      let acumulado = 0;
      visibles.forEach(d => {
        const largo = (d.valor / total) * C;
        const seg = el('circle', {
          cx: c, cy: c, r, fill: 'none', stroke: d.color, 'stroke-width': grosor,
          'stroke-dasharray': `${Math.max(largo - hueco, 0.5)} ${C}`, 'stroke-dashoffset': -acumulado,
          transform: `rotate(-90 ${c} ${c})`, class: 'seg-donut'
        });
        acumulado += largo;
        conTooltip(seg, () => ({ titulo: d.etiqueta, filas: [{ color: d.color, valor: formato(d.valor), etiqueta: `${decimal((d.valor / total) * 100)}% del total` }] }));
        svg.appendChild(seg);
      });
    }
    if (centro) {
      svg.appendChild(el('text', { x: c, y: c + (centro.sub ? 2 : 10), 'text-anchor': 'middle', class: 'donut-valor' }, centro.valor));
      if (centro.sub) svg.appendChild(el('text', { x: c, y: c + 24, 'text-anchor': 'middle', class: 'donut-sub' }, centro.sub));
    }
    cont.appendChild(svg);
  }

  /* ============================================================
     BARRAS HORIZONTALES (HTML)
     ============================================================ */
  function barrasH(cont, { datos, formato = entero, maximo, mostrarPorcentaje = false }) {
    cont.replaceChildren();
    const max = maximo || Math.max(1, ...datos.map(d => Number(d.valor) || 0));
    const caja = el('div', { class: 'barras-h' });
    datos.forEach(d => {
      const barra = el('i', { style: `background:${d.color};width:${sinMovimiento ? Math.max(((d.valor || 0) / max) * 100, d.valor > 0 ? 2 : 0) : 0}%` });
      const fila = el('div', { class: 'bh-fila' }, [
        el('span', { class: 'bh-et', title: d.etiqueta }, d.etiqueta),
        el('div', { class: 'bh-pista' }, barra),
        el('b', { class: 'bh-val' }, formato(d.valor))
      ]);
      conTooltip(fila, () => ({ titulo: d.etiqueta, filas: [{ color: d.color, valor: formato(d.valor), etiqueta: d.detalle || 'unidades' }] }));
      caja.appendChild(fila);
      if (!sinMovimiento) requestAnimationFrame(() => requestAnimationFrame(() => { barra.style.width = Math.max(((d.valor || 0) / max) * 100, d.valor > 0 ? 2 : 0) + '%'; }));
    });
    cont.appendChild(caja);
  }

  /* ============================================================
     BARRAS VERTICALES (SVG)
     ============================================================ */
  function barrasV(cont, { etiquetas, valores, colores, color = '#22D3EE', formato = entero, formatoEje, unidad = '', ancho = 520, alto = 230, nombreSerie = '' }) {
    cont.replaceChildren();
    const m = { l: 40, r: 12, t: 24, b: 34 };
    const esc = escalaBonita(Math.max(...valores, 0), 4);
    const wUtil = ancho - m.l - m.r, hUtil = alto - m.t - m.b;
    const banda = wUtil / Math.max(etiquetas.length, 1);
    const anchoBarra = Math.min(46, banda * 0.58);
    const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'barras-v', role: 'img', 'aria-label': `Gráfica de barras: ${etiquetas.map((e, i) => `${e} ${formato(valores[i])}`).join(', ')}` });
    for (let v = 0; v <= esc.max + 1e-9; v += esc.paso) {
      const y = m.t + hUtil - (v / esc.max) * hUtil;
      svg.appendChild(el('line', { x1: m.l, x2: ancho - m.r, y1: y, y2: y, class: v === 0 ? 'eje' : 'rejilla' }));
      svg.appendChild(el('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end', class: 'tick' }, (formatoEje || entero)(v)));
    }
    etiquetas.forEach((et, i) => {
      const v = Number(valores[i]) || 0;
      const h = (v / esc.max) * hUtil;
      const x = m.l + banda * i + (banda - anchoBarra) / 2;
      const y = m.t + hUtil - h;
      const col = colores ? colores[i] : color;
      const g = el('g', { class: 'barra-v' });
      const rad = Math.min(4, h / 2);
      const d = h > 0
        ? `M${x},${y + h} V${y + rad} Q${x},${y} ${x + rad},${y} H${x + anchoBarra - rad} Q${x + anchoBarra},${y} ${x + anchoBarra},${y + rad} V${y + h} Z`
        : `M${x},${y} h${anchoBarra}`;
      g.appendChild(el('path', { d, fill: col, class: 'rect-barra' }));
      g.appendChild(el('rect', { x: m.l + banda * i, y: m.t, width: banda, height: hUtil, fill: 'transparent', class: 'zona-hit' }));
      if (v > 0) g.appendChild(el('text', { x: x + anchoBarra / 2, y: y - 6, 'text-anchor': 'middle', class: 'val-barra' }, formatoEje ? formato(v) : entero(v)));
      conTooltip(g, () => ({ titulo: et, filas: [{ color: col, valor: formato(v), etiqueta: nombreSerie || unidad }] }));
      svg.appendChild(g);
      svg.appendChild(el('text', { x: m.l + banda * i + banda / 2, y: alto - 12, 'text-anchor': 'middle', class: 'tick x' }, recortar(et, banda < 70 ? 9 : 14)));
    });
    cont.appendChild(svg);
  }

  /* ============================================================
     LÍNEAS (SVG) con cruz guía y tooltip de todas las series
     ============================================================ */
  function lineas(cont, { etiquetas, series, formato = entero, ancho = 560, alto = 230, area = false }) {
    cont.replaceChildren();
    const m = { l: 46, r: 16, t: 20, b: 34 };
    const maximo = Math.max(...series.flatMap(s => s.valores), 0);
    const esc = escalaBonita(maximo, 4);
    const wUtil = ancho - m.l - m.r, hUtil = alto - m.t - m.b;
    const n = etiquetas.length;
    const xDe = i => m.l + (n === 1 ? wUtil / 2 : (wUtil * i) / (n - 1));
    const yDe = v => m.t + hUtil - (v / esc.max) * hUtil;
    const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'lineas', role: 'img', 'aria-label': `Gráfica de líneas: ${series.map(s => s.nombre).join(' y ')} por ${etiquetas.join(', ')}` });
    for (let v = 0; v <= esc.max + 1e-9; v += esc.paso) {
      svg.appendChild(el('line', { x1: m.l, x2: ancho - m.r, y1: yDe(v), y2: yDe(v), class: v === 0 ? 'eje' : 'rejilla' }));
      svg.appendChild(el('text', { x: m.l - 8, y: yDe(v) + 4, 'text-anchor': 'end', class: 'tick' }, formatoQCortoSiMoneda(v, formato)));
    }
    etiquetas.forEach((et, i) => svg.appendChild(el('text', { x: xDe(i), y: alto - 12, 'text-anchor': 'middle', class: 'tick x' }, et)));
    const guia = el('line', { y1: m.t, y2: m.t + hUtil, class: 'guia', visibility: 'hidden' });
    svg.appendChild(guia);
    series.forEach(s => {
      if (area && s.valores.length > 1) {
        const pts = s.valores.map((v, i) => `${xDe(i)},${yDe(v)}`).join(' ');
        svg.appendChild(el('polyline', { points: `${xDe(0)},${yDe(0)} ${pts} ${xDe(n - 1)},${yDe(0)}`, fill: s.color, 'fill-opacity': 0.14, stroke: 'none' }));
      }
      svg.appendChild(el('polyline', { points: s.valores.map((v, i) => `${xDe(i)},${yDe(v)}`).join(' '), fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      s.valores.forEach((v, i) => svg.appendChild(el('circle', { cx: xDe(i), cy: yDe(v), r: 4.5, fill: s.color, stroke: '#12171E', 'stroke-width': 2, class: 'punto-linea' })));
    });
    const zona = el('rect', { x: m.l, y: m.t, width: wUtil, height: hUtil, fill: 'transparent', tabindex: 0, 'aria-label': 'Valores por mes: pasa el mouse o usa las flechas' });
    let activo = null;
    const datosEn = i => ({ titulo: etiquetas[i], filas: series.map(s => ({ color: s.color, valor: formato(s.valores[i]), etiqueta: s.nombre })) });
    const ir = (i, evento) => {
      activo = i;
      guia.setAttribute('x1', xDe(i)); guia.setAttribute('x2', xDe(i)); guia.setAttribute('visibility', 'visible');
      Tip.mostrar(evento, datosEn(i));
    };
    zona.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * ancho;
      const i = Math.max(0, Math.min(n - 1, Math.round(((x - m.l) / wUtil) * (n - 1))));
      ir(i, e);
    });
    zona.addEventListener('pointerleave', () => { guia.setAttribute('visibility', 'hidden'); Tip.ocultar(); });
    zona.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const i = Math.max(0, Math.min(n - 1, (activo === null ? (e.key === 'ArrowRight' ? -1 : n) : activo) + (e.key === 'ArrowRight' ? 1 : -1)));
      const r = svg.getBoundingClientRect();
      ir(i, { clientX: r.left + (xDe(i) / ancho) * r.width, clientY: r.top + r.height / 3 });
    });
    zona.addEventListener('blur', () => { guia.setAttribute('visibility', 'hidden'); Tip.ocultar(); });
    svg.appendChild(zona);
    cont.appendChild(svg);
    cont.appendChild(leyenda(series.map(s => ({ etiqueta: s.nombre, color: s.color }))));
  }

  /* ============================================================
     BARRAS APILADAS (SVG): varias series sumadas en cada barra
     ============================================================ */
  function apiladas(cont, { etiquetas, series, formato = entero, ancho = 520, alto = 230 }) {
    cont.replaceChildren();
    const m = { l: 46, r: 12, t: 18, b: 34 };
    const totales = etiquetas.map((_, i) => series.reduce((s, x) => s + (Number(x.valores[i]) || 0), 0));
    const esc = escalaBonita(Math.max(...totales, 0), 4);
    const wUtil = ancho - m.l - m.r, hUtil = alto - m.t - m.b;
    const banda = wUtil / Math.max(etiquetas.length, 1);
    const anchoBarra = Math.min(46, banda * 0.58);
    const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'barras-v', role: 'img', 'aria-label': `Barras apiladas: ${etiquetas.map((e, i) => `${e} ${formato(totales[i])}`).join(', ')}` });
    for (let v = 0; v <= esc.max + 1e-9; v += esc.paso) {
      const y = m.t + hUtil - (v / esc.max) * hUtil;
      svg.appendChild(el('line', { x1: m.l, x2: ancho - m.r, y1: y, y2: y, class: v === 0 ? 'eje' : 'rejilla' }));
      svg.appendChild(el('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end', class: 'tick' }, formatoQCortoSiMoneda(v, formato)));
    }
    etiquetas.forEach((et, i) => {
      const x = m.l + banda * i + (banda - anchoBarra) / 2;
      let base = m.t + hUtil;
      const g = el('g', { class: 'barra-v' });
      series.forEach(s => {
        const v = Number(s.valores[i]) || 0;
        const h = (v / esc.max) * hUtil;
        if (h > 0) {
          g.appendChild(el('rect', { x, y: base - h + 1, width: anchoBarra, height: Math.max(h - 2, 1), fill: s.color, rx: 2, class: 'rect-barra' }));
          base -= h;
        }
      });
      g.appendChild(el('rect', { x: m.l + banda * i, y: m.t, width: banda, height: hUtil, fill: 'transparent', class: 'zona-hit' }));
      conTooltip(g, () => ({ titulo: et, filas: [...series.map(s => ({ color: s.color, valor: formato(s.valores[i] || 0), etiqueta: s.nombre })), { valor: formato(totales[i]), etiqueta: 'Total' }] }));
      svg.appendChild(g);
      svg.appendChild(el('text', { x: m.l + banda * i + banda / 2, y: alto - 12, 'text-anchor': 'middle', class: 'tick x' }, recortar(et, banda < 70 ? 9 : 14)));
    });
    cont.appendChild(svg);
    cont.appendChild(leyenda(series.map(s => ({ etiqueta: s.nombre, color: s.color }))));
  }

  /* ============================================================
     MEDIDOR (semicírculo): un porcentaje contra su meta
     ============================================================ */
  function medidor(cont, { valor, texto, sub, color = '#22D3EE', meta = null, detalle = '' }) {
    cont.replaceChildren();
    const pct = Math.max(0, Math.min(100, Number(valor) || 0));
    const r = 84, cx = 110, cy = 110, largo = Math.PI * r;
    const arco = `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`;
    const svg = el('svg', { viewBox: '0 0 220 140', class: 'medidor', role: 'img', 'aria-label': `${texto || decimal(pct) + '%'}${sub ? ' ' + sub : ''}` });
    svg.appendChild(el('path', { d: arco, fill: 'none', stroke: 'rgba(255,255,255,.08)', 'stroke-width': 18, 'stroke-linecap': 'round' }));
    const barra = el('path', { d: arco, fill: 'none', stroke: color, 'stroke-width': 18, 'stroke-linecap': 'round', 'stroke-dasharray': `${largo}`, 'stroke-dashoffset': sinMovimiento ? largo * (1 - pct / 100) : largo, class: 'seg-donut' });
    conTooltip(barra, () => ({ titulo: sub || 'Avance', filas: [{ color, valor: decimal(pct) + '%', etiqueta: detalle || '' }] }));
    svg.appendChild(barra);
    if (meta !== null) {
      const a = Math.PI * (1 - meta / 100);
      svg.appendChild(el('line', { x1: cx + (r - 14) * Math.cos(a), y1: cy - (r - 14) * Math.sin(a), x2: cx + (r + 14) * Math.cos(a), y2: cy - (r + 14) * Math.sin(a), stroke: '#fff', 'stroke-width': 2, 'stroke-dasharray': '3 2' }));
    }
    svg.appendChild(el('text', { x: cx, y: cy - 14, 'text-anchor': 'middle', class: 'donut-valor' }, texto || decimal(pct) + '%'));
    if (sub) svg.appendChild(el('text', { x: cx, y: cy + 8, 'text-anchor': 'middle', class: 'donut-sub' }, sub));
    svg.appendChild(el('text', { x: cx - r, y: cy + 26, 'text-anchor': 'middle', class: 'tick' }, '0%'));
    svg.appendChild(el('text', { x: cx + r, y: cy + 26, 'text-anchor': 'middle', class: 'tick' }, '100%'));
    cont.appendChild(svg);
    if (detalle) cont.appendChild(el('p', { class: 'sub-tarjeta', style: 'text-align:center;margin:4px 0 0' }, detalle));
    if (!sinMovimiento) requestAnimationFrame(() => requestAnimationFrame(() => { barra.style.transition = 'stroke-dashoffset .7s cubic-bezier(.2,.7,.3,1)'; barra.setAttribute('stroke-dashoffset', largo * (1 - pct / 100)); }));
  }
  const formatoQCortoSiMoneda = (v, formato) => formato === formatoQ ? formatoQCorto(v) : entero(v);

  /* ============================================================
     TABLA ALTERNA (para quien no puede o no quiere ver la gráfica)
     ============================================================ */
  function tablaDatos(cont, columnas, filas) {
    cont.replaceChildren();
    const tabla = el('table', { class: 'tabla-alterna' }, [
      el('thead', {}, el('tr', {}, columnas.map(c => el('th', { scope: 'col', class: c.tipo && c.tipo !== 'texto' ? 'num' : '' }, c.titulo)))),
      el('tbody', {}, filas.map(f => el('tr', {}, columnas.map(c => {
        const v = f[c.campo];
        const t = v === null || v === undefined ? '—' : c.tipo === 'moneda' ? formatoQ(v) : c.tipo === 'entero' ? entero(v) : c.tipo === 'decimal' ? decimal(v) : String(v);
        return el('td', { class: c.tipo && c.tipo !== 'texto' ? 'num' : '' }, t);
      }))))
    ]);
    cont.appendChild(el('div', { class: 'tabla-alterna-caja' }, tabla));
  }

  global.Graf = { donut, barrasH, barrasV, lineas, apiladas, medidor, leyenda, tablaDatos, Tip, el, entero, decimal, formatoQ, formatoQCorto, escalaBonita };
})(window);
