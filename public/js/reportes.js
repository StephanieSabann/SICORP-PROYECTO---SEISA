/* ============================================================
   SICORP — SEISA · REPORTES (pantallas)
   Resumen · Empleados · Inventario · Nóminas · Tablas detalladas
   ------------------------------------------------------------
   Todo texto que viene del servidor se inserta con textContent
   (nunca innerHTML). Las rutas están en /api/reportes.
   ============================================================ */
(function () {
  const { el, entero, decimal, formatoQ } = Graf;
  const vista = document.getElementById('vistaRep');
  const acciones = document.getElementById('accionesRep');
  const selPeriodo = document.getElementById('selPeriodo');
  const btnExportar = document.getElementById('btnExportar');
  const textoExportar = document.getElementById('textoExportar');
  const estadoActualizado = document.getElementById('estadoActualizado');
  const tabs = [...document.querySelectorAll('.tab-rep')];

  const estado = {
    periodo: null, periodos: [], catalogo: [], accesos: [],
    ruta: { tipo: 'resumen', clave: null },
    tabla: { pagina: 1, texto: '', orden: '', dir: 'asc', filtros: {}, porPagina: 15 },
    solicitud: 0, ultimoDashboard: null
  };

  /* ---------- íconos ---------- */
  const ICONOS = {
    personas: '<path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20v-2.5c0-2.4 2.7-4 6-4s6 1.6 6 4V20M17 5.5a3 3 0 0 1 0 5.8M18.5 14c1.7.6 2.8 1.9 2.8 3.5V20"/>',
    tecnico: '<path d="M14.7 6.3a3.6 3.6 0 0 1-4.7 4.7L4.5 16.5a1.7 1.7 0 0 0 2.4 2.4L12.4 13a3.6 3.6 0 0 1 4.7-4.7l-2.4-2z"/>',
    auxiliar: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5"/>',
    maletin: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 13h17"/>',
    caja: '<path d="M12 3l8 4.4v9.2L12 21l-8-4.4V7.4z"/><path d="M4 7.4l8 4.5 8-4.5M12 12v9"/>',
    billete: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>',
    llave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
    billetera: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><path d="M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5z"/><circle cx="16" cy="13.5" r="1.2"/>',
    regalo: '<rect x="3.5" y="9" width="17" height="11" rx="1.5"/><path d="M12 9v11M3.5 13h17M12 9c-1-4-5-4-5-2s3 2 5 2c2 0 5 0 5-2s-4-2-5 2z"/>',
    documento: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    carpeta: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    calendario: '<rect x="3.5" y="5" width="17" height="15" rx="2.2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
    camion: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    tarjeta: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
    grafica: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    alerta: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
    chev: '<path d="M5 9l7 7 7-7"/>',
    tabla: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M3.5 15h17M9.5 10v9.5"/>',
    sube: '<path d="M12 19V6M6 11l6-6 6 6"/>',
    baja: '<path d="M12 5v13M6 13l6 6 6-6"/>',
    igual: '<path d="M5 12h14"/>'
  };
  function icono(nombre, extra = {}) {
    const s = el('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', ...extra });
    s.innerHTML = ICONOS[nombre] || ICONOS.grafica; // contenido fijo del propio código, nunca datos del servidor
    return s;
  }

  /* ---------- utilidades ---------- */
  const nombreSeccion = { resumen: 'Resumen', empleados: 'Empleados', inventario: 'Inventario', nominas: 'Nóminas' };
  const limpiar = t => (typeof sinAcentos === 'function' ? sinAcentos(t) : String(t).toLowerCase());
  const tieneAcceso = modulo => estado.accesos.some(a => limpiar(a) === limpiar(modulo));
  const nombrePeriodo = p => (estado.periodos.find(x => x.valor === p) || {}).etiqueta || p;
  function formatoValor(v, formato) {
    if (formato === 'moneda') return formatoQ(v);
    if (formato === 'pct') return decimal(v) + '%';
    return entero(v);
  }
  function fechaHoraBonita(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('es-GT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function txt(valor, columna) {
    if (valor === null || valor === undefined || valor === '') return '—';
    switch (columna.tipo) {
      case 'moneda': return formatoQ(valor);
      case 'entero': return columna.campo === 'codigo' ? String(valor) : entero(valor);
      case 'decimal': return decimal(valor);
      case 'fecha': return typeof fechaBonita === 'function' ? fechaBonita(valor) : String(valor);
      case 'fechahora': return fechaHoraBonita(valor);
      default: return String(valor);
    }
  }
  function claseEstado(t) {
    const x = limpiar(t);
    if (/(activ|aprobad|disponible|registrad|devuelt|ok|completo|cerrad|pagad)/.test(x) && !/inactiv/.test(x)) return 'bueno';
    if (/(pendiente|revision|bajo|parcial|proceso|preparacion)/.test(x)) return 'aviso';
    if (/(vencid|agotad|perdid|danad|rechazad|inactiv|incompleto|critico)/.test(x)) return 'malo';
    return '';
  }
  function avisoError(e) { avisar(e.message || 'No se pudo completar la acción.'); }

  /* ---------- descarga de archivos ---------- */
  async function descargar(url) {
    const r = await fetch(url);
    if ((r.headers.get('content-type') || '').includes('application/json')) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.mensaje || 'No se pudo generar el archivo.');
    }
    if (!r.ok) throw new Error('No se pudo generar el archivo (código ' + r.status + ').');
    const nombre = decodeURIComponent(r.headers.get('X-Nombre-Archivo') || 'reporte.xlsx');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return nombre;
  }
  async function exportar(url) {
    btnExportar.disabled = true;
    try { const n = await descargar(url); avisar('Descargado: ' + n); }
    catch (e) { avisoError(e); }
    finally { btnExportar.disabled = false; }
  }

  /* ---------- piezas de interfaz ---------- */
  function delta(v, invertido = false) {
    if (!v) return null;
    const pct = v.pct === null || v.pct === undefined ? null : v.pct;
    const sentido = v.sentido || 'igual';
    const texto = pct === null ? (v.diferencia > 0 ? 'nuevo' : '—') : (pct > 0 ? '+' : '') + decimal(pct) + '%';
    return el('span', { class: `delta ${sentido}${invertido ? ' inv' : ''}`, title: 'Comparado con el mes anterior' }, [icono(sentido === 'sube' ? 'sube' : sentido === 'baja' ? 'baja' : 'igual', { 'stroke-width': '3' }), texto + ' vs mes anterior']);
  }
  function kpi(k) {
    const invertido = ['descuentos', 'perdidas'].includes(k.clave);
    return el('div', { class: `kpi tono-${k.tono || 'azul'}` }, [
      el('span', { class: 'ico' }, icono(k.icono)),
      el('div', { class: 'txt' }, [
        el('span', { class: 'tit' }, k.titulo),
        el('span', { class: 'val' }, formatoValor(k.valor, k.formato)),
        k.variacion ? delta(k.variacion, invertido) : null,
        k.nota ? el('span', { class: 'nota' }, k.nota) : null
      ])
    ]);
  }
  /* ---------- dibujo de una gráfica según su tipo ---------- */
  const fmtDe = f => (f === 'moneda' ? formatoQ : entero);
  const ANCHO_SVG = { 4: 340, 6: 440, 8: 560, 12: 560 };
  function sinDatos(spec) {
    if (spec.tipo === 'donut') return !spec.datos || spec.datos.reduce((s, d) => s + (Number(d.valor) || 0), 0) === 0;
    if (spec.tipo === 'barrasH') return !spec.datos || spec.datos.length === 0;
    if (spec.tipo === 'medidor') return false;
    return !spec.etiquetas || spec.etiquetas.length === 0;
  }
  function dibujarGrafica(spec, lienzo, { mini = false } = {}) {
    lienzo.replaceChildren();
    if (spec.error) { lienzo.appendChild(el('p', { class: 'vacio-graf error' }, spec.error)); return; }
    if (sinDatos(spec)) { lienzo.appendChild(el('p', { class: 'vacio-graf' }, 'Sin datos con estos filtros.')); return; }
    const fmt = fmtDe(spec.formato);
    const ancho = mini ? 300 : (ANCHO_SVG[spec.ancho] || 440);
    const alto = mini ? 120 : 230;
    switch (spec.tipo) {
      case 'donut':
        if (mini) Graf.donut(lienzo, { datos: spec.datos, centro: spec.centro, tamano: 120, grosor: 16, formato: fmt });
        else donutConLeyenda(lienzo, spec.datos, spec.centro, fmt);
        break;
      case 'barrasH':
        Graf.barrasH(lienzo, { datos: (mini ? spec.datos.slice(0, 4) : spec.datos).map(d => ({ detalle: spec.formato === 'moneda' ? 'monto' : 'unidades', ...d })), formato: fmt });
        break;
      case 'barrasV':
        Graf.barrasV(lienzo, { etiquetas: spec.etiquetas, valores: spec.valores, colores: spec.colores, color: spec.color, formato: fmt, formatoEje: spec.formato === 'moneda' ? Graf.formatoQCorto : undefined, nombreSerie: spec.nombreSerie, ancho, alto });
        break;
      case 'lineas': case 'area':
        Graf.lineas(lienzo, { etiquetas: spec.etiquetas, series: spec.series, formato: fmt, area: spec.tipo === 'area', ancho, alto });
        break;
      case 'apiladas':
        Graf.apiladas(lienzo, { etiquetas: spec.etiquetas, series: spec.series, formato: fmt, ancho, alto });
        break;
      case 'medidor':
        Graf.medidor(lienzo, spec);
        break;
      default:
        lienzo.appendChild(el('p', { class: 'vacio-graf' }, 'Tipo de gráfica no disponible.'));
    }
    if (spec.nota && !mini) lienzo.appendChild(el('p', { class: 'nota-graf' }, spec.nota));
  }

  /* Tarjeta de gráfica: tabla alterna y, si trae filtros, un desplegable que recalcula
     la gráfica y su tabla. alCambiar(filtros) → devuelve la gráfica nueva. */
  function tarjetaGrafica(spec0, { alCambiar = null } = {}) {
    let spec = spec0;
    let comoTabla = false;
    const lienzo = el('div', { class: 'lienzo' });
    const cuerpo = el('div', { class: 'cuerpo-graf' }, lienzo);
    const id = 'gr-' + Math.random().toString(36).slice(2, 8);
    const panel = el('div', { class: 'panel-filtros', id, hidden: '' });
    const btnTabla = el('button', { type: 'button', 'aria-pressed': 'false', title: 'Ver como tabla', 'aria-label': `Ver «${spec.titulo}» como tabla` }, icono('tabla'));
    const contador = el('span', { class: 'contador-filtros', hidden: '' });
    const btnFiltros = el('button', { type: 'button', class: 'chev', title: 'Filtros', 'aria-label': `Filtros de «${spec.titulo}»`, 'aria-expanded': 'false', 'aria-controls': id }, [icono('chev'), contador]);
    const tieneFiltros = () => alCambiar && spec.filtros && spec.filtros.length;
    const tarjeta = el('section', { class: `tarjeta-rep span-${spec.ancho || 4}` }, [
      el('header', {}, [
        el('div', {}, [el('h3', {}, spec.titulo), spec.sub ? el('p', { class: 'sub-tarjeta' }, spec.sub) : null]),
        el('div', { class: 'herr' }, [spec.tabla ? btnTabla : null, tieneFiltros() ? btnFiltros : null])
      ]),
      panel, cuerpo
    ]);
    function pintarPanel() {
      panel.replaceChildren();
      if (!tieneFiltros()) return;
      const reset = el('button', { type: 'button', class: 'enlace-filtros' }, 'Restablecer');
      reset.addEventListener('click', () => aplicar({}));
      panel.appendChild(el('div', { class: 'campos-filtros' }, spec.filtros.map(f => {
        const sel = el('select', { 'aria-label': f.etiqueta }, f.opciones.map(o => el('option', { value: o.valor }, o.etiqueta)));
        sel.value = spec.filtrosAplicados[f.clave] ?? f.defecto;
        sel.addEventListener('change', () => aplicar({ ...spec.filtrosAplicados, [f.clave]: sel.value }));
        return el('label', {}, [el('span', {}, f.etiqueta), sel]);
      })));
      panel.appendChild(reset);
      const cambiados = spec.filtros.filter(f => (spec.filtrosAplicados[f.clave] ?? f.defecto) !== f.defecto).length;
      contador.textContent = cambiados; contador.hidden = !cambiados;
      reset.hidden = !cambiados;
    }
    function pintar() {
      if (comoTabla && spec.tabla) Graf.tablaDatos(lienzo, spec.tabla.columnas, spec.tabla.filas);
      else dibujarGrafica(spec, lienzo);
    }
    async function aplicar(filtros) {
      tarjeta.classList.add('cargando');
      try { spec = await alCambiar(filtros); }
      catch (e) { avisoError(e); }
      finally { tarjeta.classList.remove('cargando'); }
      pintarPanel(); pintar();
    }
    btnTabla.addEventListener('click', () => { comoTabla = !comoTabla; btnTabla.setAttribute('aria-pressed', comoTabla); pintar(); });
    btnFiltros.addEventListener('click', () => { const abierto = panel.hidden; panel.hidden = !abierto; btnFiltros.setAttribute('aria-expanded', abierto); tarjeta.classList.toggle('con-filtros-abiertos', abierto); });
    pintarPanel(); pintar();
    return tarjeta;
  }
  function donutConLeyenda(lienzo, datos, centro, formato = entero) {
    lienzo.replaceChildren();
    const caja = el('div', { class: 'cuerpo-donut' });
    const d = el('div');
    caja.appendChild(d);
    Graf.donut(d, { datos, centro, formato });
    const total = datos.reduce((s, x) => s + (Number(x.valor) || 0), 0);
    caja.appendChild(Graf.leyenda(datos.map(x => ({ ...x, etiqueta: x.etiqueta + (total ? ` (${decimal((x.valor / total) * 100)}%)` : '') })), { formato, mostrarValor: true }));
    lienzo.appendChild(caja);
  }

  const NIVELES = { critico: 'Crítico', aviso: 'Aviso', info: 'Información', ok: 'Todo en orden' };
  function iconoNivel(n) { return icono(n === 'ok' ? 'ok' : n === 'info' ? 'info' : 'alerta', { class: 'icono-n' }); }
  function irAlReporte(clave, filtros) {
    estado.tabla = { pagina: 1, texto: '', orden: '', dir: 'asc', filtros: filtros ? { ...filtros } : null, porPagina: 15 };
    navegar(`tabla/${clave}`);
  }
  function abrirAlertas(alertas, subtitulo) {
    const lista = document.getElementById('listaAlertas');
    lista.replaceChildren();
    document.getElementById('subAlertas').textContent = subtitulo || '';
    if (!alertas.length) lista.appendChild(el('li', { class: 'nivel-ok' }, [el('span', {}, 'No hay nada pendiente. ¡Todo en orden!')]));
    alertas.forEach(a => {
      lista.appendChild(el('li', { class: `nivel-${a.nivel}` }, [
        el('span', {}, [el('b', { class: 'etiqueta-nivel' }, (NIVELES[a.nivel] || '') + (a.origen ? ' · ' + a.origen : '')), a.texto]),
        a.reporte && catalogoPorClave(a.reporte) ? el('button', { type: 'button' }, 'Ver reporte') : null
      ]));
      const b = lista.lastChild.querySelector('button');
      if (b) b.addEventListener('click', () => { cerrarModal('modalAlertas'); irAlReporte(a.reporte, a.filtros); });
    });
    abrirModal('modalAlertas');
  }
  const catalogoPorClave = c => estado.catalogo.find(r => r.clave === c);
  function bannerPie(pie, alertas) {
    if (!pie) return null;
    const b = el('div', { class: `banner-rep nivel-${pie.nivel || 'info'}` }, [
      iconoNivel(pie.nivel),
      el('p', {}, pie.texto),
      el('button', { type: 'button', class: 'btn-detalle' }, pie.enlace || 'Ver detalle')
    ]);
    b.querySelector('button').addEventListener('click', () => {
      if (alertas && alertas.length) abrirAlertas(alertas, `${nombreSeccion[estado.ruta.clave || estado.ruta.tipo] || ''} · ${estado.ultimoDashboard ? estado.ultimoDashboard.periodoNombre : ''}`);
      else if (pie.reporte) irAlReporte(pie.reporte, pie.filtros);
    });
    return b;
  }

  /* ============================================================
     RESUMEN
     ============================================================ */
  function pintarResumen(d) {
    const frag = document.createDocumentFragment();
    const alertas = d.alertas || [];
    const criticas = alertas.filter(a => a.nivel === 'critico').length;
    const avisos = alertas.filter(a => a.nivel === 'aviso').length;

    if (d.personal || d.inventario || d.nomina) {
      const fila = el('div', { class: 'rejilla-resumen' });
      if (d.personal) {
        const lienzo = el('div');
        donutConLeyenda(lienzo, d.personal.grupos, { valor: entero(d.personal.total), sub: 'activos' });
        fila.appendChild(el('section', { class: 'tarjeta-rep tarjeta-ind' }, [el('div', { class: 'cabecera' }, [icono('personas'), 'Personal']), lienzo]));
      }
      if (d.inventario) {
        fila.appendChild(el('section', { class: 'tarjeta-rep tarjeta-ind' }, [
          el('div', { class: 'cabecera' }, [icono('caja'), 'Inventario']),
          el('div', {}, [el('span', { class: 'cifra-grande' }, decimal(d.inventario.pctDisponible) + '%'), el('span', { class: 'nota' }, ' disponible')]),
          el('div', { class: 'barra-prog', role: 'img', 'aria-label': `${decimal(d.inventario.pctDisponible)}% de las unidades está disponible` }, el('i', { style: `width:${Math.min(100, d.inventario.pctDisponible)}%` })),
          el('p', { class: 'sub-tarjeta' }, `${entero(d.inventario.disponibles)} disponibles · ${entero(d.inventario.asignados)} asignadas · ${entero(d.inventario.recursos)} en total`)
        ]));
      }
      if (d.nomina) {
        const n = d.nomina;
        fila.appendChild(el('section', { class: 'tarjeta-rep tarjeta-ind' }, [
          el('div', { class: 'cabecera' }, [icono('billetera'), `Nómina · ${n.periodoNombre}`]),
          el('div', {}, [el('span', { class: 'cifra-grande' }, decimal(n.pct) + '%'), el('span', { class: 'nota' }, ` ${n.estado}`)]),
          el('div', { class: 'barra-prog', role: 'img', 'aria-label': `${n.aprobadas} de ${n.esperadas} nóminas aprobadas` }, el('i', { style: `width:${Math.min(100, n.pct)}%` })),
          el('p', { class: 'sub-tarjeta' }, `${n.aprobadas} de ${n.esperadas} aprobadas · Líquido ${formatoQ(n.liquido)}`),
          el('ul', { class: 'checks' }, (n.checks || []).map(c => el('li', { class: ['ok', 'parcial'].includes(c.estado) ? c.estado : 'pend' }, [el('span', { class: 'st' }, c.estado === 'ok' ? '✓' : c.estado === 'parcial' ? '!' : '·'), c.texto])))
        ]));
      }
      frag.appendChild(fila);
    }

    // Atención requerida
    const nivelPie = criticas ? 'critico' : avisos ? 'aviso' : 'ok';
    const textoPie = alertas.length
      ? `Atención requerida: ${criticas ? criticas + ' crítica' + (criticas === 1 ? '' : 's') : ''}${criticas && avisos ? ' y ' : ''}${avisos ? avisos + ' aviso' + (avisos === 1 ? '' : 's') : ''}${!criticas && !avisos ? alertas.length + ' información' : ''}.`
      : 'Todo en orden: no hay pendientes que atender.';
    const pie = { texto: textoPie, nivel: nivelPie, enlace: alertas.length ? 'Ver detalle' : 'Ver reportes' };
    const banner = bannerPie(pie, alertas.length ? alertas : null);
    if (banner) {
      if (!alertas.length) banner.querySelector('button').remove();
      frag.appendChild(banner);
    }

    // Catálogo
    frag.appendChild(el('h2', { class: 'seccion-titulo' }, ['Reportes disponibles', el('small', {}, 'Elige uno para ver el detalle y descargarlo')]));
    const grupos = {};
    (d.reportes || []).forEach(r => { (grupos[r.modulo] = grupos[r.modulo] || []).push(r); });
    Object.keys(grupos).forEach(mod => {
      frag.appendChild(el('h3', { class: 'seccion-titulo', style: 'font-size:clamp(14px,1.2vw,18px);color:#C9D5E1' }, mod));
      frag.appendChild(el('div', { class: 'rejilla-reportes' }, grupos[mod].map(r => tarjetaReporte(r))));
    });
    if (!(d.reportes || []).length) frag.appendChild(el('p', { class: 'cargando-rep' }, 'No hay reportes disponibles para tu rol.'));
    vista.replaceChildren(frag);
  }
  function tarjetaReporte(r) {
    const b = el('button', { type: 'button', class: 'tarjeta-reporte' }, [
      el('div', { class: 'arriba' }, [el('span', { class: 'ico' }, icono(r.icono)), el('div', {}, [el('span', { class: 'mod-rep' }, r.modulo), el('h3', {}, r.subtitulo)])]),
      r.miniatura ? el('div', { class: 'mini-graf', 'aria-hidden': 'true', inert: '' }) : null,
      el('p', {}, r.descripcion),
      el('div', { class: 'pie' }, [r.conPeriodo ? 'Depende del período' : 'Datos actuales', ' · Excel y CSV'])
    ]);
    const mini = b.querySelector('.mini-graf');
    if (mini) dibujarGrafica({ ...r.miniatura, ancho: 4 }, mini, { mini: true });
    b.addEventListener('click', () => irAlReporte(r.clave, null));
    return b;
  }

  /* ============================================================
     DASHBOARDS
     ============================================================ */
  function rejillaGraficas(seccion, graficas) {
    return el('div', { class: 'rejilla-graf-12' }, graficas.map(g => tarjetaGrafica(g, {
      alCambiar: filtros => {
        const q = new URLSearchParams({ periodo: estado.periodo });
        Object.entries(filtros).forEach(([k, v]) => q.set('f_' + k, v));
        return api(`/api/reportes/graficas/${seccion}/${encodeURIComponent(g.id)}?${q}`).then(r => r.datos);
      }
    })));
  }
  function pintarEmpleados(d, g) {
    const frag = document.createDocumentFragment();
    frag.appendChild(el('div', { class: 'rejilla-kpi' }, d.kpis.map(kpi)));
    frag.appendChild(rejillaGraficas('empleados', g.graficas));
    frag.appendChild(bannerPie(d.pie, d.alertas));
    return frag;
  }
  function pintarInventario(d, g) {
    const frag = document.createDocumentFragment();
    frag.appendChild(el('div', { class: 'rejilla-kpi' }, d.kpis.map(kpi)));
    if (d.salud) frag.appendChild(el('div', { class: 'salud' }, d.salud.map(s => el('div', { class: `item tono-${s.tono || 'azul'}` }, [el('span', {}, s.titulo), el('strong', {}, formatoValor(s.valor, s.formato)), s.nota ? el('small', {}, s.nota) : null]))));
    frag.appendChild(rejillaGraficas('inventario', g.graficas));
    const c = d.control || {};
    frag.appendChild(el('section', { class: 'tarjeta-rep', style: 'margin-bottom:clamp(12px,1.4vw,22px)' }, [
      el('header', {}, el('h3', {}, 'Control de inventario')),
      el('div', { class: 'salud', style: 'margin:0' }, [
        ['Última entrada', c.ultimaEntrada ? fechaBonita(c.ultimaEntrada) : 'Sin registro', c.responsable ? `${c.responsable}${c.origen ? ' · ' + c.origen : ''}` : ''],
        ['Último conteo físico', c.ultimoConteo ? fechaBonita(c.ultimoConteo) : 'Nunca', c.diasSinConteo !== null && c.diasSinConteo !== undefined ? `hace ${c.diasSinConteo} días` : ''],
        ['Entregas pendientes', entero(c.entregasPendientes || 0), 'por devolver']
      ].map(([t, v, n]) => el('div', { class: 'item' }, [el('span', {}, t), el('strong', { style: 'font-size:clamp(15px,1.3vw,20px)' }, v), n ? el('small', {}, n) : null]))),
    ]));
    frag.appendChild(bannerPie(d.pie, d.alertas));
    return frag;
  }
  function pintarNominas(d, g) {
    const frag = document.createDocumentFragment();
    frag.appendChild(el('div', { class: 'rejilla-kpi' }, d.kpis.map(kpi)));
    frag.appendChild(rejillaGraficas('nominas', g.graficas));
    frag.appendChild(bannerPie(d.pie, d.alertas));
    return frag;
  }
  const PINTORES = { empleados: pintarEmpleados, inventario: pintarInventario, nominas: pintarNominas };

  /* ============================================================
     TABLA DETALLADA
     ============================================================ */
  async function pintarTabla(clave) {
    const t = estado.tabla;
    const q = new URLSearchParams();
    if (estado.periodo) q.set('periodo', estado.periodo);
    if (t.texto) q.set('texto', t.texto);
    if (t.orden) { q.set('orden', t.orden); q.set('dir', t.dir); }
    q.set('pagina', t.pagina); q.set('porPagina', t.porPagina);
    Object.entries(t.filtros || {}).forEach(([k, v]) => q.set('f_' + k, v));
    const d = (await api(`/api/reportes/tabla/${encodeURIComponent(clave)}?${q}`)).datos;
    if (t.filtros === null) t.filtros = { ...d.filtrosAplicados };
    estado.tablaActual = d;
    document.getElementById('tituloRep').textContent = d.subtitulo;
    document.getElementById('subRep').textContent = d.descripcion;
    document.getElementById('migasRep').replaceChildren(
      el('button', { type: 'button' }, 'Reportes'), ` › ${d.modulo} › ${d.subtitulo}`);
    document.querySelector('#migasRep button').addEventListener('click', () => navegar('resumen'));
    acciones.hidden = false;
    document.getElementById('selPeriodo').closest('.selector-periodo').hidden = !d.conPeriodo;
    textoExportar.textContent = 'Exportar excel';

    const frag = document.createDocumentFragment();
    const barra = el('div', { class: 'barra-filtros' });
    d.filtros.forEach(f => {
      const sel = el('select', { id: 'f_' + f.clave }, f.opciones.map(o => el('option', { value: o.valor }, o.etiqueta)));
      sel.value = (t.filtros || {})[f.clave] ?? f.defecto;
      sel.addEventListener('change', () => { t.filtros[f.clave] = sel.value; t.pagina = 1; recargar(); });
      barra.appendChild(el('label', {}, [f.etiqueta, sel]));
    });
    const buscar = el('input', { type: 'search', placeholder: 'Buscar en este reporte…', value: t.texto, 'aria-label': 'Buscar en este reporte' });
    let temporizador;
    buscar.addEventListener('input', () => { clearTimeout(temporizador); temporizador = setTimeout(() => { t.texto = buscar.value.trim(); t.pagina = 1; recargar(true); }, 350); });
    barra.appendChild(el('label', {}, ['Buscar', buscar]));
    barra.appendChild(el('span', { class: 'espacio' }));
    const btnCsv = el('button', { type: 'button', class: 'btn-linea' }, 'Descargar CSV');
    btnCsv.addEventListener('click', () => exportar(urlExportarTabla('csv')));
    barra.appendChild(btnCsv);
    frag.appendChild(barra);

    if (d.graficas && d.graficas.length) {
      const n = d.graficas.length;
      frag.appendChild(el('div', { class: 'rejilla-graf-12' }, d.graficas.map(g => tarjetaGrafica({ ...g, ancho: n === 4 ? 6 : n === 2 ? 6 : 4, filtros: [], filtrosAplicados: {} })))); 
    }

    const thead = el('tr', {}, d.columnas.map(c => {
      const th = el('th', { scope: 'col', class: ['moneda', 'entero', 'decimal'].includes(c.tipo) && c.campo !== 'codigo' ? 'num' : '' });
      th.setAttribute('aria-sort', t.orden === c.campo ? (t.dir === 'desc' ? 'descending' : 'ascending') : 'none');
      const b = el('button', { type: 'button', title: 'Ordenar' }, c.titulo);
      b.addEventListener('click', () => { t.dir = t.orden === c.campo && t.dir === 'asc' ? 'desc' : 'asc'; t.orden = c.campo; t.pagina = 1; recargar(); });
      th.appendChild(b);
      return th;
    }));
    const cuerpo = d.filas.length
      ? d.filas.map(f => el('tr', {}, d.columnas.map(c => {
          const v = f[c.campo];
          const celda = el('td', { class: ['moneda', 'entero', 'decimal'].includes(c.tipo) && c.campo !== 'codigo' ? 'num' : '' });
          if (c.tipo === 'estado' && v) celda.appendChild(el('span', { class: 'badge-estado ' + claseEstado(v) }, String(v)));
          else celda.textContent = txt(v, c);
          return celda;
        })))
      : [el('tr', {}, el('td', { class: 'vacio', colspan: d.columnas.length }, t.texto || Object.values(t.filtros || {}).some(Boolean) ? 'Ningún registro coincide con los filtros.' : 'Sin registros para mostrar.'))];
    const tabla = el('table', { class: 'tabla-datos' }, [el('thead', {}, thead), el('tbody', {}, cuerpo)]);
    if (d.totales && d.filas.length) {
      tabla.appendChild(el('tfoot', {}, el('tr', {}, d.columnas.map((c, i) => {
        const v = d.totales[c.campo];
        return el('td', { class: ['moneda', 'entero', 'decimal'].includes(c.tipo) && c.campo !== 'codigo' ? 'num' : '' }, i === 0 && (v === undefined || v === null) ? 'Total' : v === undefined || v === null ? '' : txt(v, c));
      }))));
    }
    frag.appendChild(el('div', { class: 'caja-tabla' }, tabla));
    const pag = el('div', { class: 'paginacion pie-tabla' });
    pintarPaginacion(pag, d.pagina, d.paginas, d.total, n => { t.pagina = n; recargar(); });
    frag.appendChild(pag);
    if (d.periodoNombre) estadoActualizado.textContent = `Período: ${d.periodoNombre} · Los totales de la tabla corresponden a todos los registros filtrados.`;
    else estadoActualizado.textContent = '';
    const enfocadoBuscar = document.activeElement && document.activeElement.type === 'search';
    vista.replaceChildren(frag);
    if (enfocadoBuscar) { const i = vista.querySelector('input[type=search]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }
  function urlExportarTabla(formato) {
    const t = estado.tabla, q = new URLSearchParams();
    if (estado.periodo) q.set('periodo', estado.periodo);
    if (t.texto) q.set('texto', t.texto);
    if (t.orden) { q.set('orden', t.orden); q.set('dir', t.dir); }
    Object.entries(t.filtros || {}).forEach(([k, v]) => q.set('f_' + k, v));
    q.set('formato', formato);
    return `/api/reportes/tabla/${encodeURIComponent(estado.ruta.clave)}/exportar?${q}`;
  }

  /* ============================================================
     NAVEGACIÓN Y CARGA
     ============================================================ */
  function navegar(hash) { if (location.hash === '#' + hash) cargar(); else location.hash = hash; }
  function leerRuta() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (h.startsWith('tabla/')) return { tipo: 'tabla', clave: h.slice(6) };
    if (['empleados', 'inventario', 'nominas'].includes(h) && tieneAcceso(h === 'nominas' ? 'Nóminas' : h[0].toUpperCase() + h.slice(1))) return { tipo: h, clave: h };
    return { tipo: 'resumen', clave: 'resumen' };
  }
  function recargar(conservarFoco) {
    return cargar({ conservarFoco });
  }
  async function cargar({ refrescar = false } = {}) {
    const ruta = estado.ruta = leerRuta();
    const miSolicitud = ++estado.solicitud;
    tabs.forEach(t => {
      const on = (ruta.tipo === 'tabla' ? (catalogoPorClave(ruta.clave) || {}).modulo : null) ? limpiar(t.dataset.acceso || '') === limpiar(catalogoPorClave(ruta.clave).modulo) : t.dataset.seccion === ruta.tipo;
      t.classList.toggle('is-on', on); t.setAttribute('aria-selected', on);
    });
    if (ruta.tipo !== 'tabla') {
      document.getElementById('tituloRep').textContent = ruta.tipo === 'resumen' ? 'Centro de reportes' : `Dashboard de ${nombreSeccion[ruta.tipo].toLowerCase()}`;
      document.getElementById('subRep').textContent = ruta.tipo === 'resumen' ? 'Consulta y descarga la información registrada en cada módulo' : 'Indicadores y gráficas del período';
      document.getElementById('migasRep').textContent = 'Reportes › ' + nombreSeccion[ruta.tipo];
      acciones.hidden = ruta.tipo === 'resumen' && false;
      document.getElementById('selPeriodo').closest('.selector-periodo').hidden = false;
      textoExportar.textContent = 'Exportar excel';
      btnExportar.hidden = ruta.tipo === 'resumen';
    } else btnExportar.hidden = false;
    acciones.hidden = false;
    vista.setAttribute('aria-busy', 'true');
    try {
      if (ruta.tipo === 'resumen') {
        const d = (await api(`/api/reportes/resumen?periodo=${estado.periodo}${refrescar ? '&refrescar=1' : ''}`)).datos;
        if (miSolicitud !== estado.solicitud) return;
        estado.ultimoDashboard = d;
        pintarResumen(d);
        marcarActualizado(d);
      } else if (ruta.tipo === 'tabla') {
        await pintarTabla(ruta.clave);
        if (miSolicitud !== estado.solicitud) return;
      } else {
        const [rd, rg] = await Promise.all([
          api(`/api/reportes/dashboard/${ruta.tipo}?periodo=${estado.periodo}${refrescar ? '&refrescar=1' : ''}`),
          api(`/api/reportes/graficas/${ruta.tipo}?periodo=${estado.periodo}`)
        ]);
        const d = rd.datos;
        if (miSolicitud !== estado.solicitud) return;
        estado.ultimoDashboard = d;
        vista.replaceChildren(PINTORES[ruta.tipo](d, rg.datos));
        marcarActualizado(d);
      }
    } catch (e) {
      if (miSolicitud !== estado.solicitud) return;
      const caja = el('div', { class: 'error-rep' }, [el('p', {}, e.message || 'No se pudo cargar el reporte.'), el('button', { type: 'button', class: 'btn-linea' }, 'Reintentar')]);
      caja.querySelector('button').addEventListener('click', () => cargar());
      vista.replaceChildren(caja);
    } finally {
      if (miSolicitud === estado.solicitud) vista.setAttribute('aria-busy', 'false');
    }
  }
  function marcarActualizado(d) {
    estadoActualizado.textContent = `Datos al ${fechaHoraBonita(d.actualizado)}${d.desdeCache ? ' (guardados hace instantes; usa «Actualizar» para recalcular)' : ''}`;
  }

  /* ---------- eventos ---------- */
  tabs.forEach(t => t.addEventListener('click', () => navegar(t.dataset.seccion)));
  window.addEventListener('hashchange', () => cargar());
  selPeriodo.addEventListener('change', () => {
    estado.periodo = selPeriodo.value;
    try { localStorage.setItem('reportes.periodo', estado.periodo); } catch (_) { /* sin almacenamiento */ }
    cargar();
  });
  const btnAct = document.getElementById('btnActualizar');
  btnAct.addEventListener('click', async () => {
    btnAct.classList.add('girando');
    await cargar({ refrescar: true });
    btnAct.classList.remove('girando');
  });
  document.getElementById('btnImprimir').addEventListener('click', () => window.print());
  btnExportar.addEventListener('click', () => {
    const r = estado.ruta;
    if (r.tipo === 'tabla') exportar(urlExportarTabla('xlsx'));
    else if (r.tipo !== 'resumen') exportar(`/api/reportes/dashboard/${r.tipo}/exportar?periodo=${estado.periodo}`);
  });
  document.getElementById('btnCerrarAlertas').addEventListener('click', () => cerrarModal('modalAlertas'));

  /* ---------- búsqueda en el catálogo ---------- */
  const caja = document.getElementById('buscarGlobal'), lista = document.getElementById('resultadosBusqueda');
  function resultadosBusqueda() {
    const q = limpiar(caja.value.trim());
    lista.replaceChildren();
    if (!q) { lista.hidden = true; return; }
    const encontrados = [
      ...['empleados', 'inventario', 'nominas'].filter(s => tieneAcceso(s === 'nominas' ? 'Nóminas' : s[0].toUpperCase() + s.slice(1)) && limpiar('dashboard ' + s).includes(q)).map(s => ({ titulo: 'Dashboard de ' + nombreSeccion[s].toLowerCase(), sub: 'Indicadores y gráficas', ir: () => navegar(s) })),
      ...estado.catalogo.filter(r => limpiar(`${r.modulo} ${r.subtitulo} ${r.descripcion}`).includes(q)).map(r => ({ titulo: r.subtitulo, sub: r.modulo + ' · ' + r.descripcion, ir: () => irAlReporte(r.clave, null) }))
    ].slice(0, 8);
    if (!encontrados.length) lista.appendChild(el('div', { class: 'vacio' }, 'Sin resultados.'));
    encontrados.forEach(r => {
      const b = el('button', { type: 'button', role: 'option' }, [el('strong', {}, r.titulo), el('small', {}, r.sub)]);
      b.addEventListener('click', () => { lista.hidden = true; caja.value = ''; r.ir(); });
      lista.appendChild(b);
    });
    lista.hidden = false;
  }
  caja.addEventListener('input', resultadosBusqueda);
  caja.addEventListener('keydown', e => {
    if (e.key === 'Escape') { lista.hidden = true; caja.blur(); }
    if (e.key === 'Enter') { const b = lista.querySelector('button'); if (b) b.click(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.buscador-rep')) lista.hidden = true; });

  /* ---------- arranque ---------- */
  (async function iniciar() {
    vista.appendChild(el('p', { class: 'cargando-rep' }, 'Cargando reportes…'));
    try {
      const sesion = await sesionActual;
      if (!sesion) return;
      estado.accesos = sesion.accesos || [];
      tabs.forEach(t => { if (t.dataset.acceso && !tieneAcceso(t.dataset.acceso)) t.hidden = true; });
      const [p, c] = await Promise.all([api('/api/reportes/periodos'), api('/api/reportes/catalogo')]);
      estado.periodos = p.datos.opciones;
      estado.catalogo = c.datos;
      selPeriodo.replaceChildren(...estado.periodos.map(o => el('option', { value: o.valor }, o.etiqueta)));
      let guardado = null;
      try { guardado = localStorage.getItem('reportes.periodo'); } catch (_) { /* sin almacenamiento */ }
      estado.periodo = estado.periodos.some(o => o.valor === guardado) ? guardado : p.datos.actual;
      selPeriodo.value = estado.periodo;
      cargar();
    } catch (e) {
      vista.replaceChildren(el('div', { class: 'error-rep' }, e.message || 'No se pudo cargar el módulo de reportes.'));
    }
  })();
})();
