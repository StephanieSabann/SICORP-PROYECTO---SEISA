/* ============================================================
   SICORP — SEISA · Soporte y Mantenimiento
   ============================================================ */

/* ---------- migas de pan ---------- */
document.querySelectorAll('.migas [data-ir]').forEach(b => {
  b.addEventListener('click', () => {
    if (b.dataset.ir === 'inicio') window.location.href = 'inicio.html';
  });
});

/* ---------- pestañas horizontales ---------- */
document.querySelectorAll('.tab-mant').forEach(boton => {
  boton.addEventListener('click', () => {
    const tab = boton.dataset.tab;
    document.querySelectorAll('.tab-mant').forEach(b => {
      b.classList.toggle('is-on', b === boton);
      b.setAttribute('aria-selected', b === boton ? 'true' : 'false');
    });
    document.querySelectorAll('.panel-mant').forEach(p => {
      p.classList.toggle('is-active', p.id === 'panel-' + tab);
    });
    if (tab === 'soporte') cargarMensajes();
    location.hash = tab;
  });
});
(function abrirPestañaInicial(){
  const tab = ['usuarios','empleados','inventario','nomina','soporte']
    .includes(location.hash.slice(1)) ? location.hash.slice(1) : 'usuarios';
  document.querySelector(`.tab-mant[data-tab="${tab}"]`)?.click();
})();

/* ============================================================
   USUARIOS: roles y permisos (con el checklist que los conecta)
   ============================================================ */
let permisosCache = [];

async function cargarPermisosMant(){
  const caja = document.getElementById('listaPermisosMant');
  try {
    const r = await api('/api/accesos');
    permisosCache = r.datos || [];
    caja.innerHTML = permisosCache.length
      ? permisosCache.map(x => `
          <div class="fila-mant">
            <span>${escaparMant(x.nombre)}${x.descripcion ? `<small>${escaparMant(x.descripcion)}</small>` : ''}</span>
            <button type="button" class="icono-btn" data-borrar-permiso="${x.id_acceso}" aria-label="Eliminar permiso">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>
            </button>
          </div>`).join('')
      : '<p class="vacio-mini">Todavía no hay permisos creados.</p>';

    caja.querySelectorAll('[data-borrar-permiso]').forEach(boton => {
      boton.addEventListener('click', () => eliminarPermiso(Number(boton.dataset.borrarPermiso)));
    });
  } catch (error) {
    caja.innerHTML = `<p class="vacio-mini">No se pudo cargar la lista: ${escaparMant(error.message)}</p>`;
  }
  pintarChecklist(document.getElementById('checklistPermisosNuevoRol'), []);
}

function eliminarPermiso(id){
  const p = permisosCache.find(x => x.id_acceso === id);
  confirmar(
    '¿Eliminar este permiso?',
    `"${p ? p.nombre : ''}" dejará de poder asignarse a ningún rol. Si algún rol ya lo tiene marcado, primero tienes que quitárselo desde "Editar accesos".`,
    'Eliminar',
    async () => {
      try {
        await api('/api/accesos/' + id, { method: 'DELETE' });
        avisar('Permiso eliminado.');
        cargarPermisosMant();
        cargarRolesMant();
      } catch (error) {
        avisar(error.message || 'No se pudo eliminar el permiso.');
      }
    }
  );
}

/* Dibuja el checklist de permisos, ya sea vacío (nuevo rol) o con
   algunos pre-marcados (editar accesos de un rol existente). */
function pintarChecklist(caja, idsMarcados){
  const marcados = new Set(idsMarcados);
  caja.innerHTML = permisosCache.length
    ? permisosCache.map(p => `
        <label class="check-permiso">
          <input type="checkbox" value="${p.id_acceso}" ${marcados.has(p.id_acceso) ? 'checked' : ''}>
          <span class="texto">
            <strong>${escaparMant(p.nombre)}</strong>
            ${p.descripcion ? `<small>${escaparMant(p.descripcion)}</small>` : ''}
          </span>
        </label>`).join('')
    : '<p class="vacio-mini">Todavía no hay permisos creados. Crea uno primero a la derecha.</p>';
}

async function cargarRolesMant(){
  const caja = document.getElementById('listaRolesMant');
  try {
    const r = await api('/api/roles');
    const roles = r.datos || [];

    if (!roles.length){
      caja.innerHTML = '<p class="vacio-mini" style="padding:16px 0">Todavía no hay roles creados.</p>';
      return;
    }

    caja.innerHTML = '';
    for (const rol of roles) {
      let accesos = [];
      try {
        const ra = await api('/api/roles/' + rol.id_rol + '/accesos');
        accesos = ra.datos || [];
      } catch (e) { /* si falla, se muestra igual, solo sin chips */ }

      const fila = document.createElement('div');
      fila.className = 'fila';
      fila.innerHTML = `
        <span>
          <strong>${escaparMant(rol.nombre)}</strong>
          ${rol.descripcion ? `<br><small style="color:var(--tenue)">${escaparMant(rol.descripcion)}</small>` : ''}
        </span>
        <span class="chips-permisos">
          ${accesos.length
            ? accesos.map(a => `<span class="chip-permiso">${escaparMant(a.nombre)}</span>`).join('')
            : '<span class="chip-permiso vacio">Sin permisos todavía</span>'}
        </span>
        <span class="acciones-fila">
          <button type="button" class="btn-linea chico" data-editar-rol="${rol.id_rol}">Editar accesos</button>
          <button type="button" class="icono-btn" data-borrar-rol="${rol.id_rol}" aria-label="Eliminar rol">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>
          </button>
        </span>`;
      fila.querySelector('[data-editar-rol]').addEventListener('click', () => abrirEditarAccesos(rol));
      fila.querySelector('[data-borrar-rol]').addEventListener('click', () => eliminarRolMant(rol));
      caja.appendChild(fila);
    }
  } catch (error) {
    caja.innerHTML = `<p class="vacio-mini" style="padding:16px 0">No se pudo cargar la lista: ${escaparMant(error.message)}</p>`;
  }
}

let rolEditandoId = null;

function eliminarRolMant(rol){
  confirmar(
    '¿Eliminar este rol?',
    `"${rol.nombre}" se borrará por completo. Si algún usuario todavía lo tiene asignado, no se va a poder borrar hasta que le cambies el rol primero.`,
    'Eliminar',
    async () => {
      try {
        await api('/api/roles/' + rol.id_rol, { method: 'DELETE' });
        avisar('Rol eliminado.');
        cargarRolesMant();
      } catch (error) {
        avisar(error.message || 'No se pudo eliminar el rol.');
      }
    }
  );
}

function abrirEditarAccesos(rol){
  rolEditandoId = rol.id_rol;
  document.getElementById('subAccesos').textContent =
    `Marca los módulos a los que "${rol.nombre}" va a tener acceso.`;

  api('/api/roles/' + rol.id_rol + '/accesos')
    .then(r => {
      const actuales = (r.datos || []).map(a => a.id_acceso);
      pintarChecklist(document.getElementById('checklistPermisosEditar'), actuales);
      abrirModal('modalAccesos');
    })
    .catch(error => avisar(error.message || 'No se pudieron cargar los accesos actuales.'));
}

document.getElementById('btnCancelarAccesos').addEventListener('click', () => cerrarModal('modalAccesos'));

document.getElementById('btnGuardarAccesos').addEventListener('click', async () => {
  const marcados = Array.from(document.querySelectorAll('#checklistPermisosEditar input:checked')).map(i => Number(i.value));
  try {
    await api('/api/roles/' + rolEditandoId + '/accesos', {
      method: 'PUT',
      body: JSON.stringify({ accesos: marcados })
    });
    avisar('Accesos actualizados correctamente.');
    cerrarModal('modalAccesos');
    cargarRolesMant();
  } catch (error) {
    avisar(error.message || 'No se pudieron guardar los accesos.');
  }
});

document.getElementById('formNuevoRol').addEventListener('submit', async e => {
  e.preventDefault();
  const campo = document.getElementById('rolNombre');
  const nombre = campo.value.trim();
  const wrapper = campo.closest('.campo');

  if (nombre.length < 2) { wrapper.classList.add('mal'); campo.focus(); return; }
  wrapper.classList.remove('mal');

  const accesos = Array.from(document.querySelectorAll('#checklistPermisosNuevoRol input:checked')).map(i => Number(i.value));

  try {
    await api('/api/roles', {
      method: 'POST',
      body: JSON.stringify({
        nombre,
        descripcion: document.getElementById('rolDescripcion').value.trim(),
        accesos
      })
    });
    avisar('Rol "' + nombre + '" creado correctamente' + (accesos.length ? ` con ${accesos.length} permiso${accesos.length===1?'':'s'}.` : ', sin permisos todavía.'));
    e.target.reset();
    pintarChecklist(document.getElementById('checklistPermisosNuevoRol'), []);
    cargarRolesMant();
  } catch (error) {
    avisar(error.message || 'No se pudo crear el rol.');
  }
});

/* Contador de caracteres de la descripción del permiso (150 máx.) */
(function activarContadorPermiso(){
  const campo = document.getElementById('permisoDescripcion');
  const contador = document.getElementById('contadorPermisoDesc');
  const maximo = Number(campo.getAttribute('maxlength')) || 0;
  const actualizar = () => {
    const usados = campo.value.length;
    contador.textContent = `${usados} / ${maximo}`;
    contador.classList.toggle('cerca', usados >= maximo * 0.85 && usados < maximo);
    contador.classList.toggle('lleno', usados >= maximo);
  };
  campo.addEventListener('input', actualizar);
  actualizar();
})();

document.getElementById('formNuevoPermiso').addEventListener('submit', async e => {
  e.preventDefault();
  const campo = document.getElementById('permisoNombre');
  const nombre = campo.value.trim();
  const wrapper = campo.closest('.campo');

  if (nombre.length < 2) { wrapper.classList.add('mal'); campo.focus(); return; }
  wrapper.classList.remove('mal');

  try {
    await api('/api/accesos', {
      method: 'POST',
      body: JSON.stringify({ nombre, descripcion: document.getElementById('permisoDescripcion').value.trim() })
    });
    avisar('Permiso "' + nombre + '" creado correctamente.');
    e.target.reset();
    document.getElementById('contadorPermisoDesc').textContent = '0 / 150';
    cargarPermisosMant();
  } catch (error) {
    avisar(error.message || 'No se pudo crear el permiso.');
  }
});

/* ============================================================
   EMPLEADOS: nuevo puesto
   ============================================================ */
async function cargarPuestosMant(){
  const caja = document.getElementById('listaPuestosMant');
  try {
    const r = await api('/api/puestos');
    const puestos = r.datos || [];

    if (!puestos.length) {
      caja.innerHTML = '<p class="vacio-mini">Todavía no hay puestos creados.</p>';
      return;
    }

    /* Cada puesto trae cuántos empleados lo usan. Los que están en uso
       no se pueden borrar: esos empleados quedarían apuntando a un
       puesto inexistente. El botón se muestra apagado y explica por qué. */
    caja.innerHTML = puestos.map(x => {
      const enUso = Number(x.empleados || 0);
      const usoTexto = enUso === 0 ? 'Sin empleados'
        : enUso === 1 ? '1 empleado' : enUso + ' empleados';

      return `<div class="fila-mant" data-puesto="${x.id_puesto}">
        <span>${escaparMant(x.nombre)}
          <small>${x.descripcion ? escaparMant(x.descripcion) + ' · ' : ''}${usoTexto}</small>
        </span>
        <span class="acciones-fila-mant">
          <button type="button" class="btn-linea chico" data-accion="editar-puesto">Editar</button>
          <button type="button" class="btn-linea chico quitar" data-accion="borrar-puesto"
            ${enUso ? 'disabled title="Tiene empleados asignados. Cámbiales el puesto primero."' : ''}>Borrar</button>
        </span>
      </div>`;
    }).join('');

    caja.querySelectorAll('[data-accion]').forEach(boton => {
      const fila = boton.closest('.fila-mant');
      const id = fila.dataset.puesto;
      const nombre = fila.querySelector('span').childNodes[0].textContent.trim();

      const puesto = puestos.find(p => String(p.id_puesto) === String(id));

      if (boton.dataset.accion === 'editar-puesto') {
        boton.addEventListener('click', () => editarPuestoMant(id, puesto.nombre, puesto.descripcion));
      } else {
        boton.addEventListener('click', () => borrarPuestoMant(id, puesto.nombre));
      }
    });
  } catch (error) {
    caja.innerHTML = `<p class="vacio-mini">No se pudo cargar la lista: ${escaparMant(error.message)}<br>
      <small>Si el error dice algo de "Puesto", es que esa tabla necesita revisarse — avísame cómo está armada y ajusto esto.</small></p>`;
  }
}

/* Editar: en vez de una ventanita del navegador, se reutiliza el mismo
   formulario de arriba. Se llena con los datos del puesto y el botón
   cambia a "Guardar cambios". El nombre viejo queda guardado en el
   historial de cada empleado, así que renombrar no borra el pasado. */
let puestoEditando = null;

function editarPuestoMant(id, nombre, descripcion){
  puestoEditando = id;
  document.getElementById('puestoNombre').value = nombre;
  document.getElementById('puestoDescripcion').value = descripcion || '';
  document.getElementById('puestoDescripcion').dispatchEvent(new Event('input'));
  document.getElementById('tituloFormPuesto').textContent = 'Editar puesto';
  document.getElementById('textoBotonPuesto').textContent = 'Guardar cambios';
  document.getElementById('btnCancelarPuesto').hidden = false;
  document.getElementById('puestoNombre').focus();
}

function salirDeEdicionPuesto(){
  puestoEditando = null;
  document.getElementById('formNuevoPuesto').reset();
  document.getElementById('puestoNombre').closest('.campo').classList.remove('mal');
  document.getElementById('contadorPuestoDesc').textContent = '0 / 64';
  document.getElementById('tituloFormPuesto').textContent = 'Nuevo puesto';
  document.getElementById('textoBotonPuesto').textContent = 'Crear puesto';
  document.getElementById('btnCancelarPuesto').hidden = true;
}

document.getElementById('btnCancelarPuesto').addEventListener('click', salirDeEdicionPuesto);

function borrarPuestoMant(id, nombre){
  confirmar('¿Borrar el puesto?', 'Se va a eliminar "' + nombre + '". Esto no se puede deshacer.', 'Borrar', async () => {
    try {
      await api('/api/puestos/' + id, { method: 'DELETE' });
      avisar('Puesto "' + nombre + '" eliminado.');
      cargarPuestosMant();
    } catch (error) {
      avisar(error.message || 'No se pudo borrar el puesto.');
    }
  });
}

/* Contador de caracteres para la descripción del puesto (64 máx.) */
(function activarContadorPuesto(){
  const campo = document.getElementById('puestoDescripcion');
  const contador = document.getElementById('contadorPuestoDesc');
  const maximo = Number(campo.getAttribute('maxlength')) || 0;
  const actualizar = () => {
    const usados = campo.value.length;
    contador.textContent = `${usados} / ${maximo}`;
    contador.classList.toggle('cerca', usados >= maximo * 0.85 && usados < maximo);
    contador.classList.toggle('lleno', usados >= maximo);
  };
  campo.addEventListener('input', actualizar);
  actualizar();
})();

document.getElementById('formNuevoPuesto').addEventListener('submit', async e => {
  e.preventDefault();
  const campo = document.getElementById('puestoNombre');
  const nombre = campo.value.trim();
  const descripcion = document.getElementById('puestoDescripcion').value.trim();
  const wrapper = campo.closest('.campo');

  if (nombre.length < 2) { wrapper.classList.add('mal'); campo.focus(); return; }
  wrapper.classList.remove('mal');

  try {
    /* El mismo formulario sirve para crear y para editar: si hay un
       puesto en edición se manda PATCH, si no, POST. */
    if (puestoEditando) {
      await api('/api/puestos/' + puestoEditando, {
        method: 'PATCH',
        body: JSON.stringify({ nombre, descripcion })
      });
      avisar('Puesto actualizado a "' + nombre + '".');
    } else {
      await api('/api/puestos', { method: 'POST', body: JSON.stringify({ nombre, descripcion }) });
      avisar('Puesto "' + nombre + '" creado correctamente.');
    }

    salirDeEdicionPuesto();
    cargarPuestosMant();
  } catch (error) {
    avisar(error.message || 'No se pudo guardar el puesto.');
  }
});

/* ============================================================
   EMPLEADOS: unidades (con código propio, fecha elegida y
   empleado asignado desde la creación)
   ============================================================ */
let empleadosCacheUnidad = [];

async function cargarEmpleadosParaUnidad(){
  const select = document.getElementById('unidadEmpleado');
  try {
    const r = await api('/api/empleados');
    empleadosCacheUnidad = r.datos || [];
    select.innerHTML = '<option value="">Sin asignar todavía</option>' +
      empleadosCacheUnidad.map(e => `<option value="${e.codigo_empleado}">${escaparMant((e.nombre + ' ' + e.apellido).trim())}</option>`).join('');
  } catch (error) {
    select.innerHTML = '<option value="">No se pudo cargar la lista de empleados</option>';
  }
}

async function cargarUnidadesMant(){
  const caja = document.getElementById('listaUnidadesMant');
  const vacio = document.getElementById('sinUnidades');
  try {
    const r = await api('/api/unidades');
    const unidades = r.datos || [];
    vacio.hidden = unidades.length > 0;
    caja.innerHTML = '';

    unidades.forEach(u => {
      const empleadosTexto = (u.empleados || []).length
        ? u.empleados.map(e => escaparMant((e.nombre + ' ' + e.apellido).trim())).join(', ')
        : '—';
      const fila = document.createElement('div');
      fila.className = 'fila';
      fila.innerHTML = `
        <span><strong>${escaparMant(u.codigo || ('#' + u.id_unidad))}</strong></span>
        <span>📅 ${fechaHoraBonita(u.fecha_creacion).split(' ')[0]}</span>
        <span>${empleadosTexto}</span>
        <span><i class="etiqueta ${u.es_activa ? 'activo' : 'inactivo'}">${u.es_activa ? 'Activa' : 'Inactiva'}</i></span>
        <span class="der">
          <button type="button" class="btn-linea chico" data-id="${u.id_unidad}" data-activa="${u.es_activa}">
            ${u.es_activa ? 'Desactivar' : 'Activar'}
          </button>
        </span>`;
      fila.querySelector('[data-id]').addEventListener('click', () => cambiarEstadoUnidad(fila.querySelector('[data-id]')));
      caja.appendChild(fila);
    });
  } catch (error) {
    caja.innerHTML = '';
    vacio.hidden = false;
    vacio.textContent = 'No se pudo cargar la lista: ' + error.message;
  }
}

async function cambiarEstadoUnidad(boton){
  const id = Number(boton.dataset.id);
  const activaActual = boton.dataset.activa === 'true';
  try {
    await api('/api/unidades/' + id + '/estado', {
      method: 'PATCH',
      body: JSON.stringify({ es_activa: !activaActual })
    });
    avisar('Unidad ' + (activaActual ? 'desactivada.' : 'activada.'));
    cargarUnidadesMant();
  } catch (error) {
    avisar(error.message || 'No se pudo cambiar el estado de la unidad.');
  }
}

document.getElementById('formNuevaUnidad').addEventListener('submit', async e => {
  e.preventDefault();
  const campo = document.getElementById('unidadCodigo');
  const codigo = campo.value.trim();
  const wrapper = campo.closest('.campo');

  if (!codigo) { wrapper.classList.add('mal'); campo.focus(); return; }
  wrapper.classList.remove('mal');

  const fecha = document.getElementById('unidadFecha').value;
  const idEmpleado = document.getElementById('unidadEmpleado').value;

  try {
    const r = await api('/api/unidades', {
      method: 'POST',
      body: JSON.stringify({ codigo, fecha_creacion: fecha, id_empleado: idEmpleado || null })
    });
    avisar(r.mensaje || 'Unidad creada correctamente.');
    e.target.reset();
    document.getElementById('unidadFecha').value = new Date().toISOString().slice(0, 10);
    cargarUnidadesMant();
  } catch (error) {
    wrapper.classList.add('mal');
    avisar(error.message || 'No se pudo crear la unidad.');
  }
});

/* La fecha arranca en hoy, pero se puede cambiar libremente */
document.getElementById('unidadFecha').value = new Date().toISOString().slice(0, 10);

/* ============================================================
   SOPORTE: mensajes de la landing
   ============================================================ */
let mensajesCache = [];

document.getElementById('verArchivados').addEventListener('change', pintarMensajes);

async function cargarMensajes(){
  const aviso = document.getElementById('avisoTablaMensajes');
  try {
    const r = await api('/api/mensajes');
    mensajesCache = r.datos || [];
    aviso.hidden = true;
    pintarMensajes();
  } catch (error) {
    aviso.hidden = false;
    aviso.textContent = 'No se pudieron cargar los mensajes: ' + error.message +
      ' — revisa que la tabla "Mensaje" ya exista en la base de datos.';
    document.getElementById('listaMensajes').innerHTML = '';
    document.getElementById('sinMensajes').hidden = true;
  }
}

function pintarMensajes(){
  const lista = document.getElementById('listaMensajes');
  const vacio = document.getElementById('sinMensajes');
  const verArchivados = document.getElementById('verArchivados').checked;

  const visibles = mensajesCache.filter(m => verArchivados ? m.archivado : !m.archivado);

  lista.innerHTML = '';
  vacio.hidden = visibles.length > 0;
  vacio.textContent = verArchivados ? 'No hay mensajes archivados.' : 'No hay mensajes todavía.';

  visibles.forEach(m => {
    const fila = document.createElement('div');
    fila.className = 'fila';
    fila.innerHTML = `
      <span>${m.leido ? '' : '<span class="punto-no-leido" title="Sin leer"></span>'}${escaparMant(m.nombre)}</span>
      <span>${escaparMant(m.asunto || 'Sin asunto')}</span>
      <span>📅 ${fechaHoraBonita(m.fecha_envio)}</span>
      <span><i class="etiqueta ${m.leido ? 'activo' : 'inactivo'}">${m.leido ? 'Leído' : 'Nuevo'}</i></span>
      <span class="acciones-fila">
        <button type="button" class="icono-btn" data-ver="${m.id_mensaje}" aria-label="Ver mensaje">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button type="button" class="icono-btn" data-mas="${m.id_mensaje}" aria-label="Más opciones" aria-expanded="false">⋮</button>
      </span>`;
    fila.querySelector('[data-ver]').addEventListener('click', () => verMensaje(m.id_mensaje));
    fila.querySelector('[data-mas]').addEventListener('click', e => abrirMenuMensaje(e.currentTarget, m.id_mensaje));
    lista.appendChild(fila);
  });

  const sinLeer = mensajesCache.filter(m => !m.leido && !m.archivado).length;
  const burbuja = document.getElementById('burbujaMensajes');
  burbuja.hidden = sinLeer === 0;
  burbuja.textContent = sinLeer;
}

/* Menú de "⋮" de cada mensaje: ver, responder, archivar, eliminar.
   Usa abrirMenuAcciones() (definida en comun.js), que ya se encarga
   de que no quede recortado ni se salga de la pantalla. */
function abrirMenuMensaje(boton, id){
  const m = mensajesCache.find(x => x.id_mensaje === id);
  if (!m) return;

  abrirMenuAcciones(boton, [
    { texto: 'Ver y responder', accion: () => verMensaje(id) },
    { texto: m.archivado ? 'Desarchivar' : 'Archivar', accion: () => archivarMensaje(id, !m.archivado) },
    { texto: 'Eliminar', peligro: true, accion: () => eliminarMensaje(id) }
  ]);
}

function archivarMensaje(id, archivar){
  api('/api/mensajes/' + id + '/archivado', { method: 'PATCH', body: JSON.stringify({ archivado: archivar }) })
    .then(() => {
      avisar(archivar ? 'Mensaje archivado.' : 'Mensaje restaurado.');
      cargarMensajes();
    })
    .catch(error => avisar(error.message || 'No se pudo archivar el mensaje.'));
}

function eliminarMensaje(id){
  const m = mensajesCache.find(x => x.id_mensaje === id);
  confirmar('¿Eliminar este mensaje?', 'El mensaje de ' + (m ? m.nombre : '') + ' y todo su historial de respuestas se borrarán para siempre.', 'Eliminar', async () => {
    try {
      await api('/api/mensajes/' + id, { method: 'DELETE' });
      avisar('Mensaje eliminado.');
      cerrarModal('modalMensaje');
      cargarMensajes();
    } catch (error) {
      avisar(error.message || 'No se pudo eliminar el mensaje.');
    }
  });
}

/* ============================================================
   Hilo de chat de un mensaje: el mensaje original + cada
   respuesta guardada en RespuestaMensaje, en orden. Se actualiza
   solo cada 5 segundos mientras el modal está abierto, por si
   alguien más (u otra pestaña) agrega una respuesta.
   ============================================================ */
let mensajeAbiertoId = null;
let intervaloChat = null;

function mostrarVistaDetalle(){
  document.getElementById('vistaDetalleMensaje').hidden = false;
  document.getElementById('vistaChatMensaje').hidden = true;
  clearInterval(intervaloChat);
  intervaloChat = null;
}

function mostrarVistaChat(){
  document.getElementById('vistaDetalleMensaje').hidden = true;
  document.getElementById('vistaChatMensaje').hidden = false;
  cargarHiloChat();
  clearInterval(intervaloChat);
  intervaloChat = setInterval(cargarHiloChat, 5000);
}

function verMensaje(id){
  const m = mensajesCache.find(x => x.id_mensaje === id);
  if (!m) return;

  mensajeAbiertoId = id;

  /* Se abre SIEMPRE mostrando primero la ficha del mensaje (como en
     la captura que le gustó al usuario). El chat solo aparece si le
     da clic a "Responder". */
  document.getElementById('tituloMensaje').textContent = m.asunto || 'Mensaje sin asunto';
  document.getElementById('tituloChatMensaje').textContent = m.asunto || 'Mensaje sin asunto';
  document.getElementById('subMensaje').textContent =
    `${m.nombre} · ${m.correo}${m.telefono ? ' · ' + m.telefono : ''}`;
  document.getElementById('detalleMensaje').innerHTML = `
    <div class="campo-detalle"><span>De</span>${escaparMant(m.nombre)}</div>
    <div class="campo-detalle"><span>Correo</span>${escaparMant(m.correo)}</div>
    ${m.telefono ? `<div class="campo-detalle"><span>Teléfono</span>${escaparMant(m.telefono)}</div>` : ''}
    <div class="campo-detalle"><span>Fecha</span>📅 ${fechaHoraBonita(m.fecha_envio)}</div>
    <div class="campo-detalle"><span>Mensaje</span>${escaparMant(m.mensaje).replace(/\n/g,'<br>')}</div>
  `;
  document.getElementById('btnArchivarMensaje').textContent = m.archivado ? 'Desarchivar' : 'Archivar';
  document.getElementById('btnArchivarMensaje').onclick = () => { archivarMensaje(id, !m.archivado); cerrarModal('modalMensaje'); };
  document.getElementById('btnEliminarMensaje').onclick = () => eliminarMensaje(id);

  mostrarVistaDetalle();
  abrirModal('modalMensaje');

  if (!m.leido) {
    api('/api/mensajes/' + id + '/leido', { method: 'PATCH', body: JSON.stringify({ leido: true }) })
      .then(() => { m.leido = true; pintarMensajes(); })
      .catch(() => {});
  }
}

document.getElementById('btnIrAChat').addEventListener('click', mostrarVistaChat);
document.getElementById('btnVolverDetalle').addEventListener('click', mostrarVistaDetalle);
document.getElementById('btnCerrarChat').addEventListener('click', () => cerrarModal('modalMensaje'));

async function cargarHiloChat(){
  if (!mensajeAbiertoId) return;
  const m = mensajesCache.find(x => x.id_mensaje === mensajeAbiertoId);
  const hilo = document.getElementById('hiloChat');
  const estabaAbajo = hilo.scrollHeight - hilo.scrollTop - hilo.clientHeight < 40;

  let respuestas = [];
  try {
    const r = await api('/api/mensajes/' + mensajeAbiertoId + '/respuestas');
    respuestas = r.datos || [];
  } catch (error) {
    hilo.innerHTML = `<p class="vacio-mini">No se pudo cargar el historial: ${escaparMant(error.message)}</p>`;
    return;
  }

  const burbujaOriginal = m ? `
    <div class="burbuja cliente">
      <span class="quien">${escaparMant(m.nombre)}</span>
      ${escaparMant(m.mensaje).replace(/\n/g,'<br>')}
      <span class="cuando">📅 ${fechaHoraBonita(m.fecha_envio)}</span>
    </div>` : '';

  const burbujasRespuestas = respuestas.map(r => `
    <div class="burbuja admin">
      <span class="quien">${escaparMant(r.respondido_por || 'Administrador')}</span>
      ${escaparMant(r.texto).replace(/\n/g,'<br>')}
      <span class="cuando">📅 ${fechaHoraBonita(r.fecha_respuesta)}</span>
    </div>`).join('');

  hilo.innerHTML = burbujaOriginal + burbujasRespuestas;

  if (estabaAbajo) hilo.scrollTop = hilo.scrollHeight;
}

/* Sea cual sea la forma en que se cierre el modal (el botón, clic
   afuera, o la tecla Escape — las tres pasan por cerrarModal() en
   comun.js), esto detiene el sondeo del chat para no seguir pidiendo
   el historial de un mensaje que ya no se está viendo. */
new MutationObserver(() => {
  const modal = document.getElementById('modalMensaje');
  if (!modal.classList.contains('abierto')) {
    clearInterval(intervaloChat);
    intervaloChat = null;
    mensajeAbiertoId = null;
  }
}).observe(document.getElementById('modalMensaje'), { attributes: true, attributeFilter: ['class'] });

document.getElementById('btnCerrarMensaje').addEventListener('click', () => cerrarModal('modalMensaje'));

(function activarContadorRespuestaChat(){
  const campo = document.getElementById('textoRespuestaChat');
  const contador = document.getElementById('contadorRespuestaChat');
  const maximo = Number(campo.getAttribute('maxlength')) || 0;
  const actualizar = () => { contador.textContent = `${campo.value.length} / ${maximo}`; };
  campo.addEventListener('input', actualizar);
  actualizar();
})();

document.getElementById('formResponderChat').addEventListener('submit', async e => {
  e.preventDefault();
  const campo = document.getElementById('textoRespuestaChat');
  const texto = campo.value.trim();
  if (!texto || !mensajeAbiertoId) return;

  const boton = e.target.querySelector('button[type=submit]');
  boton.disabled = true;

  try {
    const r = await api('/api/mensajes/' + mensajeAbiertoId + '/respuestas', {
      method: 'POST',
      body: JSON.stringify({ texto })
    });
    campo.value = '';
    document.getElementById('contadorRespuestaChat').textContent = '0 / 1000';
    await cargarHiloChat();
    if (r.correo_enviado === false) {
      avisar('Respuesta guardada (el correo no se mandó — revisa tu configuración de EMAIL_USUARIO/EMAIL_CLAVE en el .env si lo quieres activar).');
    }
  } catch (error) {
    avisar(error.message || 'No se pudo enviar la respuesta.');
  } finally {
    boton.disabled = false;
  }
});

/* ============================================================
   INVENTARIO: categorías de recursos (crear, editar, imagen, borrar)
   ============================================================ */
const COLORES_CATEGORIA = ['#4F7DF3', '#22C2B5', '#E3453F', '#A855F7', '#F59E0B', '#EC4899', '#10B981', '#38BDF8'];
const ICONO_IMAGEN_CAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="8.5" cy="10.5" r="1.6"/><path d="M21 16l-5.5-5.5-3 3L9 10l-6 6"/></svg>';
let categoriasMant = [];
let categoriaEditando = null;
let archivoCategoria = null;
let colorCategoriaElegido = COLORES_CATEGORIA[0];

const rutaImg = ruta => !ruta ? '' : (/^(https?:|data:|\/)/.test(ruta) ? ruta : '/' + ruta);

function pintarColoresCategoria(){
  const caja = document.getElementById('coloresCategoria');
  const enLista = COLORES_CATEGORIA.includes(colorCategoriaElegido.toUpperCase());
  caja.innerHTML = COLORES_CATEGORIA.map(c =>
    `<button type="button" class="color-cat ${c === colorCategoriaElegido.toUpperCase() ? 'is-on' : ''}" style="--c:${c}" data-color="${c}" aria-label="Color ${c}"></button>`
  ).join('') +
    `<input type="color" id="colorCategoriaLibre" value="${colorCategoriaElegido}" title="Otro color" ${enLista ? '' : 'class="is-on"'}>`;
  caja.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => {
    colorCategoriaElegido = b.dataset.color;
    pintarColoresCategoria();
    pintarPreviaCategoria();
  }));
  document.getElementById('colorCategoriaLibre').addEventListener('input', e => {
    colorCategoriaElegido = e.target.value.toUpperCase();
    caja.querySelectorAll('.color-cat').forEach(b => b.classList.remove('is-on'));
    pintarPreviaCategoria();
  });
}

function pintarPreviaCategoria(src){
  const previa = document.getElementById('previaCategoria');
  previa.style.setProperty('--c', colorCategoriaElegido);
  if (src !== undefined) {
    previa.innerHTML = ICONO_IMAGEN_CAT + (src ? `<img src="${escaparMant(src)}" alt="">` : '');
    document.getElementById('btnQuitarImagenCategoria').hidden = !src;
  }
}

document.getElementById('categoriaImagen').addEventListener('change', e => {
  const archivo = e.target.files[0];
  e.target.value = '';
  if (!archivo) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(archivo.type)) { avisar('La imagen debe ser JPG, PNG, WEBP o GIF.'); return; }
  if (archivo.size > 5 * 1024 * 1024) { avisar('La imagen pesa más de 5 MB.'); return; }
  archivoCategoria = archivo;
  const lector = new FileReader();
  lector.onload = () => pintarPreviaCategoria(lector.result);
  lector.readAsDataURL(archivo);
});
document.getElementById('btnQuitarImagenCategoria').addEventListener('click', () => {
  archivoCategoria = null;
  pintarPreviaCategoria(categoriaEditando && categoriaEditando.imagen ? rutaImg(categoriaEditando.imagen) : '');
});

function limpiarFormCategoria(){
  categoriaEditando = null;
  archivoCategoria = null;
  colorCategoriaElegido = COLORES_CATEGORIA[categoriasMant.length % COLORES_CATEGORIA.length];
  document.getElementById('formNuevaCategoria').reset();
  document.getElementById('categoriaNombre').closest('.campo').classList.remove('mal');
  document.getElementById('tituloFormCategoria').textContent = 'Nueva categoría';
  document.getElementById('textoBtnCategoria').textContent = 'Crear categoría';
  document.getElementById('btnCancelarCategoria').hidden = true;
  pintarColoresCategoria();
  pintarPreviaCategoria('');
}
document.getElementById('btnCancelarCategoria').addEventListener('click', limpiarFormCategoria);

function editarCategoria(c){
  categoriaEditando = c;
  archivoCategoria = null;
  colorCategoriaElegido = (c.color || COLORES_CATEGORIA[0]).toUpperCase();
  document.getElementById('categoriaNombre').value = c.nombre;
  document.getElementById('tituloFormCategoria').textContent = 'Editar categoría';
  document.getElementById('textoBtnCategoria').textContent = 'Guardar cambios';
  document.getElementById('btnCancelarCategoria').hidden = false;
  pintarColoresCategoria();
  pintarPreviaCategoria(c.imagen ? rutaImg(c.imagen) : '');
  document.getElementById('formNuevaCategoria').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('categoriaNombre').focus();
}

async function cargarCategoriasMant(){
  const caja = document.getElementById('listaCategoriasMant');
  try {
    const r = await api('/api/inventario/recursos/categorias');
    categoriasMant = r.datos || [];
    if (!categoriaEditando) {
      colorCategoriaElegido = COLORES_CATEGORIA[categoriasMant.length % COLORES_CATEGORIA.length];
      pintarColoresCategoria();
      pintarPreviaCategoria();
    }
    if (!categoriasMant.length) {
      caja.innerHTML = '<p class="vacio-mini">Todavía no hay categorías creadas.</p>';
      return;
    }
    caja.innerHTML = categoriasMant.map(c => `
      <div class="fila-cat-mant" style="--c:${escaparMant(c.color || '#3FB6E8')}">
        <span class="cat-circulo">${ICONO_IMAGEN_CAT}${c.imagen ? `<img src="${escaparMant(rutaImg(c.imagen))}" alt="" onerror="this.remove()">` : ''}</span>
        <span>
          <strong>${escaparMant(c.nombre)}</strong>
          <small>${c.total_tipos || 0} recurso${Number(c.total_tipos) === 1 ? '' : 's'} · ${Number(c.total_unidades || 0).toLocaleString('en-US')} unidades</small>
        </span>
        <span class="acciones-cat-mant">
          <button type="button" data-accion="imagen" data-id="${c.id_categoria}" title="Cambiar imagen" aria-label="Cambiar imagen de ${escaparMant(c.nombre)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l1.4-2.5h5.2L16 7"/><circle cx="12" cy="13.5" r="3.4"/></svg>
          </button>
          <button type="button" data-accion="editar" data-id="${c.id_categoria}" title="Editar" aria-label="Editar ${escaparMant(c.nombre)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>
          </button>
          <button type="button" class="peligro" data-accion="eliminar" data-id="${c.id_categoria}" title="Eliminar" aria-label="Eliminar ${escaparMant(c.nombre)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
          </button>
        </span>
      </div>`).join('');

    caja.querySelectorAll('[data-accion]').forEach(b => b.addEventListener('click', () => {
      const c = categoriasMant.find(x => x.id_categoria === Number(b.dataset.id));
      if (!c) return;
      if (b.dataset.accion === 'editar') editarCategoria(c);
      if (b.dataset.accion === 'imagen') cambiarImagenCategoriaMant(c);
      if (b.dataset.accion === 'eliminar') {
        confirmar('¿Eliminar esta categoría?', `"${c.nombre}" se quitará del inventario. Solo se puede si no tiene recursos.`, 'Eliminar', async () => {
          try {
            await api('/api/inventario/recursos/categorias/' + c.id_categoria, { method: 'DELETE' });
            avisar('Categoría eliminada.');
            if (categoriaEditando && categoriaEditando.id_categoria === c.id_categoria) limpiarFormCategoria();
            cargarCategoriasMant();
          } catch (error) {
            avisar(error.message);
          }
        });
      }
    }));
  } catch (error) {
    caja.innerHTML = `<p class="vacio-mini">No se pudieron cargar las categorías: ${escaparMant(error.message)}</p>`;
  }
}

function cambiarImagenCategoriaMant(c){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/gif';
  input.addEventListener('change', async () => {
    const archivo = input.files[0];
    if (!archivo) return;
    try {
      const formulario = new FormData();
      formulario.append('imagen', archivo);
      await api('/api/inventario/recursos/categorias/' + c.id_categoria + '/imagen', { method: 'PATCH', body: formulario, headers: {} });
      avisar('Imagen de "' + c.nombre + '" actualizada.');
      cargarCategoriasMant();
    } catch (error) {
      avisar(error.message);
    }
  });
  input.click();
}

document.getElementById('formNuevaCategoria').addEventListener('submit', async e => {
  e.preventDefault();
  const campo = document.getElementById('categoriaNombre');
  const nombre = campo.value.trim();
  if (nombre.length < 2) { campo.closest('.campo').classList.add('mal'); campo.focus(); return; }
  campo.closest('.campo').classList.remove('mal');

  try {
    const formulario = new FormData();
    formulario.append('nombre', nombre);
    formulario.append('color', colorCategoriaElegido);
    if (archivoCategoria) formulario.append('imagen', archivoCategoria);

    const r = categoriaEditando
      ? await api('/api/inventario/recursos/categorias/' + categoriaEditando.id_categoria, { method: 'PUT', body: formulario, headers: {} })
      : await api('/api/inventario/recursos/categorias', { method: 'POST', body: formulario, headers: {} });
    avisar(r.mensaje || 'Categoría guardada.');
    limpiarFormCategoria();
    await cargarCategoriasMant();
    limpiarFormCategoria();
  } catch (error) {
    avisar(error.message || 'No se pudo guardar la categoría.');
  }
});

/* ---------- utilidades locales ---------- */
function escaparMant(t){
  return String(t ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}
function fechaHoraBonita(iso){
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-GT', { day:'2-digit', month:'2-digit', year:'numeric' }) + ' ' +
         d.toLocaleTimeString('es-GT', { hour:'2-digit', minute:'2-digit' });
}

/* ============================================================
   Arranque
   ============================================================ */
cargarRolesMant();
cargarPermisosMant();
cargarPuestosMant();
cargarUnidadesMant();
cargarEmpleadosParaUnidad();
pintarColoresCategoria();
pintarPreviaCategoria('');
cargarCategoriasMant();