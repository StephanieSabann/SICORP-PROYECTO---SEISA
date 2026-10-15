/* ============================================================
   SICORP — SEISA · Mantenimiento → Nómina
   Tasas, montos y precios con vigencia · cierre de períodos ·
   bitácora de cambios · auditoría general de nóminas.
   ============================================================ */
(function () {
  const { h, llamar, dinero, porcentaje, fechaHora, insignia, estadoVacio, subpestanas, formulario, tabla, mesActual } = MantUI;
  const panel = document.getElementById('panel-nomina');
  if (!panel) return;
  const API = '/api/mantenimiento/nominas';
  let iniciado = false;
  const raiz = h('div', { class: 'mant-modulo' });
  panel.replaceChildren(h('section', { class: 'tarjeta' }, [
    h('h2', { class: 'cabecera' }, 'Mantenimiento de Nómina'),
    h('p', { class: 'nota nota-mant' }, 'Cambia tasas, montos y precios sin tocar código. Cada cambio rige desde el mes que elijas: las nóminas ya aprobadas y los meses anteriores nunca se modifican.'),
    raiz
  ]));

  const valorTexto = (u, v) => v === null || v === undefined ? 'Sin definir' : u === 'pct' ? porcentaje(v) : dinero(v);
  const NOMBRE_ACCION = { CREAR: 'Nuevo valor', MODIFICAR: 'Cambio', ELIMINAR: 'Cambio quitado', CERRAR: 'Cierre de período', REABRIR: 'Reapertura de período' };

  /* ---------- 1. Tasas, montos y precios ---------- */
  async function pintarParametros(cont) {
    const tipos = await llamar(`${API}/tipos`);
    const estado = { tipo: tipos[0].clave, periodo: mesActual(), buscar: '' };
    const selTipo = h('select', { id: 'nomTipo', 'aria-label': 'Tipo de nómina' }, tipos.map(t => h('option', { value: t.clave }, t.nombre)));
    const inPeriodo = h('input', { type: 'month', id: 'nomPeriodo', value: estado.periodo, 'aria-label': 'Ver lo que rige en' });
    const inBuscar = h('input', { type: 'search', placeholder: 'Buscar parámetro…', 'aria-label': 'Buscar parámetro' });
    const lista = h('div', { class: 'lista-param' });
    cont.replaceChildren(
      h('div', { class: 'barra-mant' }, [
        h('label', { class: 'campo' }, [h('span', {}, 'Tipo de nómina'), selTipo]),
        h('label', { class: 'campo' }, [h('span', {}, 'Ver lo que rige en'), inPeriodo]),
        h('label', { class: 'campo crece' }, [h('span', {}, 'Buscar'), inBuscar])
      ]),
      lista
    );
    let datos = [];
    async function cargar() {
      lista.replaceChildren(estadoVacio('Cargando…'));
      datos = await llamar(`${API}/parametros?tipo=${encodeURIComponent(estado.tipo)}&periodo=${estado.periodo}`);
      pintar();
    }
    function pintar() {
      lista.replaceChildren();
      const q = estado.buscar.toLowerCase();
      const visibles = datos.filter(p => !q || `${p.nombre} ${p.subnombre || ''} ${p.grupo}`.toLowerCase().includes(q));
      if (!visibles.length) { lista.appendChild(estadoVacio(datos.length ? 'Nada coincide con la búsqueda.' : 'Este tipo de nómina no tiene parámetros editables.')); return; }
      const grupos = [...new Set(visibles.map(p => p.grupo))];
      grupos.forEach(g => {
        lista.appendChild(h('h3', { class: 'grupo-param' }, g));
        visibles.filter(p => p.grupo === g).forEach(p => lista.appendChild(fila(p)));
      });
    }
    function fila(p) {
      const futuros = p.cambios.filter(c => c.futuro);
      const btn = h('button', { type: 'button', class: 'btn-linea chico' }, 'Cambiar');
      btn.addEventListener('click', () => editar(p));
      return h('div', { class: 'fila-param' }, [
        h('div', { class: 'info-param' }, [
          h('strong', {}, p.nombre), p.subnombre ? h('span', { class: 'sub' }, p.subnombre) : null,
          p.nueva ? insignia('Actividad nueva', 'azul') : null
        ]),
        h('div', { class: 'valor-param' }, [
          h('b', {}, valorTexto(p.unidad, p.vigente)),
          p.personalizado ? insignia(`Desde ${p.vigenteDesde}`, 'aviso') : insignia(p.base === null ? 'Sin definir' : 'De fábrica'),
          p.personalizado && p.base !== null ? h('small', {}, `De fábrica: ${valorTexto(p.unidad, p.base)}`) : null
        ]),
        btn,
        p.cambios.length ? h('ul', { class: 'cambios-param' }, p.cambios.map(c => {
          const quitar = h('button', { type: 'button', class: 'enlace-mant', 'aria-label': `Quitar el cambio de ${p.nombre} desde ${c.vigente_desde}` }, 'Quitar');
          quitar.addEventListener('click', () => confirmar('¿Quitar este cambio?', `Se elimina el valor ${valorTexto(p.unidad, c.valor)} que regía desde ${c.vigente_desde}. Los períodos desde esa fecha volverán a usar el valor anterior (o el de fábrica). Las nóminas ya aprobadas no cambian.`, 'Quitar', async () => {
            try { await llamar(`${API}/parametros`, 'DELETE', { tipo: estado.tipo, clave: p.clave, vigente_desde: c.vigente_desde }); avisar('Cambio quitado.'); cargar(); }
            catch (e) { avisar(e.message); }
          }));
          return h('li', {}, [
            h('span', {}, `Desde ${c.vigente_desde}: `), h('b', {}, valorTexto(p.unidad, c.valor)),
            c.futuro ? insignia('Programado', 'azul') : null, h('em', {}, ` · ${c.motivo || 'sin motivo'}`), quitar
          ]);
        })) : null
      ]);
    }
    function editar(p) {
      formulario({
        titulo: `Cambiar: ${p.nombre}${p.subnombre ? ' — ' + p.subnombre : ''}`,
        texto: `Valor actual: ${valorTexto(p.unidad, p.vigente)}. ${p.unidad === 'pct' ? 'Escribe el porcentaje (ej. 12 o 4.83).' : 'Escribe el monto en quetzales (ej. 250.00).'}`,
        campos: [
          { nombre: 'valor', etiqueta: p.unidad === 'pct' ? 'Nuevo porcentaje (%)' : 'Nuevo monto (Q)', tipo: 'text', valor: p.vigente === null ? '' : String(p.vigente), requerido: true },
          { nombre: 'vigente_desde', etiqueta: 'Rige desde el mes', tipo: 'month', valor: estado.periodo, requerido: true, ayuda: 'No afecta meses anteriores ni nóminas ya aprobadas.' },
          { nombre: 'motivo', etiqueta: 'Motivo del cambio', tipo: 'textarea', requerido: true, placeholder: 'Ej. Reforma de ley, nuevo contrato EEGSA…', ayuda: 'Queda registrado en la bitácora.' }
        ],
        boton: 'Guardar cambio',
        alEnviar: async v => {
          await llamar(`${API}/parametros`, 'PUT', { tipo: estado.tipo, clave: p.clave, ...v });
          avisar('Cambio guardado.');
          cargar();
        }
      });
    }
    selTipo.addEventListener('change', () => { estado.tipo = selTipo.value; cargar().catch(e => avisar(e.message)); });
    inPeriodo.addEventListener('change', () => { if (/^\d{4}-\d{2}$/.test(inPeriodo.value)) { estado.periodo = inPeriodo.value; cargar().catch(e => avisar(e.message)); } });
    inBuscar.addEventListener('input', () => { estado.buscar = inBuscar.value.trim(); pintar(); });
    await cargar();
  }

  /* ---------- 2. Cierre de períodos ---------- */
  async function pintarPeriodos(cont) {
    async function cargar() {
      const periodos = await llamar(`${API}/periodos`);
      const tbl = tabla([
        { titulo: 'Período', celda: p => p.nombre },
        { titulo: 'Estado', celda: p => p.cerrado ? insignia('Cerrado', 'malo') : insignia('Abierto', 'bueno') },
        { titulo: 'Aprobadas', num: true, campo: 'aprobadas' },
        { titulo: 'En revisión', num: true, campo: 'enRevision' },
        { titulo: 'En preparación', num: true, campo: 'enPreparacion' },
        { titulo: 'Detalle', celda: p => p.cerrado ? `${p.cerradoPor || ''} · ${fechaHora(p.fecha)}${p.motivo ? ' · ' + p.motivo : ''}` : '' },
        { titulo: '', celda: p => {
          const b = h('button', { type: 'button', class: 'btn-linea chico' }, p.cerrado ? 'Reabrir' : 'Cerrar');
          b.addEventListener('click', () => p.cerrado ? reabrir(p) : cerrar(p));
          return b;
        } }
      ], periodos);
      cont.replaceChildren(
        h('p', { class: 'nota nota-mant' }, 'Cerrar un período bloquea que se creen, editen o aprueben nóminas de ese mes: sirve para proteger los pagos ya entregados. Puedes reabrirlo dejando el motivo.'),
        tbl
      );
    }
    function cerrar(p, forzar = false) {
      formulario({
        titulo: `Cerrar ${p.nombre}`, texto: 'Ya no se podrán aprobar ni modificar nóminas de este mes mientras esté cerrado.',
        campos: [{ nombre: 'motivo', etiqueta: 'Nota (opcional)', tipo: 'text', max: 200, placeholder: 'Ej. Cierre contable de junio' }],
        boton: 'Cerrar período',
        alEnviar: async v => {
          try { await llamar(`${API}/periodos/cerrar`, 'POST', { periodo: p.periodo, motivo: v.motivo, forzar }); avisar(`${p.nombre} cerrado.`); cargar(); }
          catch (e) {
            if (e.extra && e.extra.requiereConfirmacion) {
              setTimeout(() => confirmar('Hay nóminas sin aprobar', e.message, 'Cerrar de todos modos', async () => {
                try { await llamar(`${API}/periodos/cerrar`, 'POST', { periodo: p.periodo, motivo: v.motivo, forzar: true }); avisar(`${p.nombre} cerrado.`); cargar(); } catch (e2) { avisar(e2.message); }
              }), 150);
              return;
            }
            throw e;
          }
        }
      });
    }
    function reabrir(p) {
      formulario({
        titulo: `Reabrir ${p.nombre}`, texto: 'Se podrá volver a modificar y aprobar nóminas de este mes. Queda registrado quién lo hizo y por qué.',
        campos: [{ nombre: 'motivo', etiqueta: 'Motivo', tipo: 'textarea', requerido: true, placeholder: 'Ej. Corrección de un pago omitido' }],
        boton: 'Reabrir período',
        alEnviar: async v => { await llamar(`${API}/periodos/reabrir`, 'POST', { periodo: p.periodo, motivo: v.motivo }); avisar(`${p.nombre} reabierto.`); cargar(); }
      });
    }
    await cargar();
  }

  /* ---------- 3. Bitácora de cambios ---------- */
  async function pintarBitacora(cont) {
    async function cargar(pagina = 1) {
      const d = await llamar(`${API}/bitacora?pagina=${pagina}`);
      const pie = h('div', { class: 'paginacion' });
      pintarPaginacion(pie, d.pagina, d.paginas, d.total, cargar);
      cont.replaceChildren(
        tabla([
          { titulo: 'Fecha', celda: f => fechaHora(f.fecha) },
          { titulo: 'Acción', celda: f => NOMBRE_ACCION[f.accion] || f.accion },
          { titulo: 'Qué', celda: f => f.tipo === 'PERIODO' ? `Período ${f.clave}` : `${f.tipoNombre} · ${f.clave}` },
          { titulo: 'Antes', celda: f => f.valor_anterior === null || f.valor_anterior === undefined ? '' : String(f.valor_anterior / 100) },
          { titulo: 'Después', celda: f => f.valor_nuevo === null || f.valor_nuevo === undefined ? '' : String(f.valor_nuevo / 100) },
          { titulo: 'Rige desde', campo: 'vigente_desde' },
          { titulo: 'Motivo', campo: 'motivo' },
          { titulo: 'Usuario', campo: 'usuario' }
        ], d.filas, { vacio: 'Todavía no hay cambios registrados.' }),
        pie
      );
    }
    await cargar();
  }

  /* ---------- 4. Auditoría general ---------- */
  async function pintarAuditoria(cont) {
    const estado = { texto: '', usuario: '' };
    const inTexto = h('input', { type: 'search', placeholder: 'Empleado, acción o período…', 'aria-label': 'Buscar' });
    const inUsuario = h('input', { type: 'search', placeholder: 'Usuario…', 'aria-label': 'Filtrar por usuario' });
    const resultado = h('div');
    cont.replaceChildren(h('div', { class: 'barra-mant' }, [
      h('label', { class: 'campo crece' }, [h('span', {}, 'Buscar'), inTexto]),
      h('label', { class: 'campo' }, [h('span', {}, 'Usuario'), inUsuario])
    ]), resultado);
    async function cargar(pagina = 1) {
      const q = new URLSearchParams({ pagina });
      if (estado.texto) q.set('texto', estado.texto);
      if (estado.usuario) q.set('usuario', estado.usuario);
      const d = await llamar(`${API}/auditoria?${q}`);
      const pie = h('div', { class: 'paginacion' });
      pintarPaginacion(pie, d.pagina, d.paginas, d.total, cargar);
      resultado.replaceChildren(tabla([
        { titulo: 'Fecha', celda: f => fechaHora(f.fecha) },
        { titulo: 'Período', campo: 'periodoNombre' },
        { titulo: 'Empleado', campo: 'empleado_nombre' },
        { titulo: 'Acción', campo: 'accion' },
        { titulo: 'Campo', campo: 'campo' },
        { titulo: 'Antes', campo: 'valor_anterior' },
        { titulo: 'Después', campo: 'valor_nuevo' },
        { titulo: 'Usuario', campo: 'usuario' }
      ], d.filas, { vacio: 'Sin movimientos con esos filtros.' }), pie);
    }
    let t;
    const lanzar = () => { clearTimeout(t); t = setTimeout(() => { estado.texto = inTexto.value.trim(); estado.usuario = inUsuario.value.trim(); cargar().catch(e => avisar(e.message)); }, 350); };
    inTexto.addEventListener('input', lanzar); inUsuario.addEventListener('input', lanzar);
    await cargar();
  }

  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    subpestanas(raiz, [
      { id: 'parametros', titulo: 'Tasas, montos y precios', render: pintarParametros },
      { id: 'periodos', titulo: 'Cierre de períodos', render: pintarPeriodos },
      { id: 'bitacora', titulo: 'Bitácora de cambios', render: pintarBitacora },
      { id: 'auditoria', titulo: 'Auditoría de nóminas', render: pintarAuditoria }
    ]);
  }
  document.querySelector('.tab-mant[data-tab="nomina"]').addEventListener('click', iniciar);
  if (panel.classList.contains('is-active')) iniciar();
})();
