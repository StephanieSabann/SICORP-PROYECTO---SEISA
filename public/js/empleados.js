/* ============================================================
   SICORP — SEISA · módulo de EMPLEADOS
   ------------------------------------------------------------
   El backend de este proyecto (SICORP-PROYECTO) todavía solo
   tiene GET /api/empleados. Mientras se agregan los endpoints
   de crear/editar/eliminar/permisos, este módulo guarda todo
   en localStorage, sembrado con los datos reales del Excel
   (empleados-datos.js), así que ya funciona de principio a fin.

   Cuando el backend tenga POST/PUT/DELETE en /api/empleados y
   algo como /api/empleados/:codigo/permisos, solo hay que
   cambiar guardarTodos()/cargarTodos() por llamadas a api().
   Dejé marcado cada punto con "BACKEND:".
   ============================================================ */

const LLAVE_EMPLEADOS = 'seisa_empleados';
const POR_PAGINA_EMP = 6;

let empleados = [];
let pagina = 1;
let vistaActual = 'tarjetas';
let codigoActual = null;   /* empleado que se ve en el expediente */

//Funcion para reutilizar y resumir codigo
async function api(url, metodo = 'GET', cuerpo = null) {
  const opciones = { method: metodo, headers: {} };
  if (cuerpo) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  const res = await fetch(url, opciones);

  /* Siempre se intenta leer el cuerpo de la respuesta (aunque no sea
     GET), porque ahí es donde el backend manda el mensaje real del
     error (por ejemplo "El nombre no puede superar los 50 caracteres").
     Antes esto se descartaba y solo se veía un mensaje genérico. */
  let datos = null;
  try { datos = await res.json(); } catch (e) { /* respuesta sin cuerpo */ }

  if (!res.ok) {
    throw new Error((datos && datos.mensaje) || `Error en la llamada a la API (${res.status}).`);
  }
  return datos;
}

/* ---------------- Cargar Datos desde la API ---------------- */
/* BACKEND: Reemplaza tu cargarTodos() actual */
async function cargarTodos() {
  try {
    const respuesta = await api('/api/empleados'); // Ruta GET
    const lista = Array.isArray(respuesta) ? respuesta : (respuesta.datos || respuesta.recordset || []);
    empleados = lista.map(e => ({
      codigo: e.codigo_empleado,
      nombre: `${e.nombre} ${e.apellido}`.trim(),
      dpi: e.dpi || '',
      nit: e.nit || '',
      telefono: e.telefono || '',
      correo: e.email || '',
      direccion: e.direccion || '',
      ingreso: e.fecha_contratacion ? e.fecha_contratacion.split('T')[0] : '',
      estado: e.activo ? 'activo' : 'inactivo',
      tipo: e.id_puesto === 1 ? 'Administrativo' : 'Técnico',
      nacimiento: e.fecha_nacimiento ? e.fecha_nacimiento.split('T')[0] : '',
    }));

    llenarUnidades();
    actualizarCifras();
    pintarLista();
  } catch (error) {
    console.error(error);
    avisar('No se pudieron obtener los empleados.');
  }
}



/* ============================================================
   Navegación entre las tres vistas de esta página
   ============================================================ */
function irA(vista){
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('is-active', v.id === 'v-' + vista));
  cerrarMenus();
  window.scrollTo({ top:0 });
  location.hash = vista;
}
document.querySelectorAll('.migas [data-ir]').forEach(b => {
  b.addEventListener('click', () => {
    if (b.dataset.ir === 'inicio') window.location.href = 'inicio.html';
    else irA(b.dataset.ir);
  });
});
window.addEventListener('hashchange', () => {
  const destino = location.hash.slice(1);
  if (['lista','nuevo','expediente'].includes(destino) && destino !== 'expediente') irA(destino);
});



/* ============================================================
   Cifras del encabezado
   ============================================================ */
function actualizarCifras(){
  contar(document.getElementById('totalActivos'), empleados.filter(e => e.estado === 'activo').length);
  contar(document.getElementById('totalTecnicos'), empleados.filter(e => e.tipo === 'Técnico').length);
  contar(document.getElementById('totalAuxiliares'), empleados.filter(e => e.tipo === 'Auxiliar').length);
  contar(document.getElementById('totalAdmin'), empleados.filter(e => e.tipo === 'Administrativo').length);
}

/* ============================================================
   Filtros, orden y paginación de la lista
   ============================================================ */
const buscarEmpleado = document.getElementById('buscarEmpleado');
const filtroTipo = document.getElementById('filtroTipo');
const filtroUnidad = document.getElementById('filtroUnidad');
const filtroEstadoEmp = document.getElementById('filtroEstadoEmp');
const cajaPaginacionEmp = document.getElementById('paginacionEmpleados');
const sinEmpleados = document.getElementById('sinEmpleados');

function llenarUnidades(){
  const unidades = [...new Set(empleados.map(e => e.unidad).filter(Boolean))].sort();
  const valorActual = filtroUnidad.value;
  filtroUnidad.innerHTML = '<option value="">Unidad</option>' +
    unidades.map(u => `<option value="${escapar(u)}">${escapar(u)}</option>`).join('');
  filtroUnidad.value = valorActual;
}

function filtradosEmp(){
  const texto = buscarEmpleado.value.trim().toLowerCase();
  const tipo = filtroTipo.value;
  const unidad = filtroUnidad.value;
  const estado = filtroEstadoEmp.value;
  return empleados.filter(e => {
    const coincide = !texto || (e.nombre + ' ' + e.codigo).toLowerCase().includes(texto);
    return coincide
      && (!tipo || e.tipo === tipo)
      && (!unidad || e.unidad === unidad)
      && (!estado || e.estado === estado);
  });
}

function pintarLista(){
  const datos = filtradosEmp();
  const paginas = Math.max(1, Math.ceil(datos.length / POR_PAGINA_EMP));
  if (pagina > paginas) pagina = paginas;
  const visibles = datos.slice((pagina - 1) * POR_PAGINA_EMP, pagina * POR_PAGINA_EMP);

  sinEmpleados.hidden = datos.length > 0;
  /* Se usa style.display a propósito (y no el atributo "hidden") porque
     .rejilla-emp trae display:grid con la misma especificidad que la
     regla [hidden] del navegador, y podían pisarse entre sí. */
  document.getElementById('vistaTarjetas').style.display = vistaActual === 'tarjetas' ? 'grid' : 'none';
  document.getElementById('vistaLista').style.display = vistaActual === 'lista' ? 'block' : 'none';

  if (vistaActual === 'tarjetas') pintarTarjetas(visibles);
  else pintarTabla(visibles);

  pintarPaginacion(cajaPaginacionEmp, pagina, paginas, datos.length, n => { pagina = n; pintarLista(); });
}

function puntoTipo(tipo){
  return tipo === 'Técnico' ? 'tecnico' : tipo === 'Auxiliar' ? 'auxiliar' : 'administrativo';
}

function pintarTarjetas(lista){
  const cont = document.getElementById('vistaTarjetas');
  cont.innerHTML = '';
  lista.forEach((e, i) => {
    const el = document.createElement('article');
    el.className = 'tarjeta-emp';
    el.style.animationDelay = (sinMovimiento ? 0 : i * 0.05) + 's';
    el.innerHTML = `
      <div class="alto">
        <div>
          <h3>${escapar(e.nombre)}</h3>
          <span class="codigo">${e.codigo}</span>
        </div>
      </div>
      <div class="linea-dato">
        <span class="punto ${puntoTipo(e.tipo)}"></span>
        <span>${escapar(e.tipo)}</span>
        <i class="etiqueta ${e.estado}" style="margin-left:auto">${e.estado === 'activo' ? 'Activo' : 'Inactivo'}</i>
      </div>
      <div class="linea-dato">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3.5" y="7" width="17" height="13" rx="1.6"/><path d="M8.5 7V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2"/></svg>
        <span>${escapar(e.unidad || 'Sin unidad')}</span>
      </div>
      <div class="pie-emp">
        <button type="button" class="ver" data-accion="ver">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>
          Ver expediente
        </button>
        <span class="sep"></span>
        <button type="button" class="icono-btn" data-accion="editar" aria-label="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l.9-3.6L16.5 5a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.6 19.1 4 20z"/></svg>
        </button>
        <button type="button" class="icono-btn" data-accion="mas" aria-label="Más acciones" aria-expanded="false">⋮</button>
      </div>`;
    conectarAccionesTarjeta(el, e.codigo);
    cont.appendChild(el);
  });
}

function pintarTabla(lista){
  const cont = document.getElementById('listaEmpleadosTabla');
  cont.innerHTML = '';
  lista.forEach((e, i) => {
    const fila = document.createElement('div');
    fila.className = 'fila';
    fila.style.animationDelay = (sinMovimiento ? 0 : i * 0.05) + 's';
    fila.innerHTML = `
      <span>${e.codigo}</span>
      <span>${escapar(e.nombre)}</span>
      <span>${escapar(e.tipo)}</span>
      <span>${escapar(e.unidad || 'Sin unidad')}</span>
      <span><i class="etiqueta ${e.estado}">${e.estado === 'activo' ? 'Activo' : 'Inactivo'}</i></span>
      <span class="acciones-fila">
        <button type="button" class="icono-btn" data-accion="ver" aria-label="Ver expediente">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button type="button" class="icono-btn" data-accion="editar" aria-label="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l.9-3.6L16.5 5a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.6 19.1 4 20z"/></svg>
        </button>
        <button type="button" class="icono-btn" data-accion="mas" aria-label="Más acciones" aria-expanded="false">⋮</button>
      </span>`;
    conectarAccionesTarjeta(fila, e.codigo);
    cont.appendChild(fila);
  });
}

function conectarAccionesTarjeta(el, codigo){
  el.querySelectorAll('[data-accion]').forEach(b => {
    b.addEventListener('click', ev => {
      ev.stopPropagation();
      const accion = b.dataset.accion;
      if (accion === 'ver') abrirExpediente(codigo, false);
      else if (accion === 'editar') abrirExpediente(codigo, true);
      else if (accion === 'mas') abrirMenuEmpleado(b, codigo);
    });
  });
}

/* Menú de "⋮" de cada tarjeta/fila: activar-desactivar y eliminar.
   Usa abrirMenuAcciones() (en comun.js), que agrega el menú suelto a
   <body> y lo posiciona con "fixed" — así no lo recorta el overflow
   de la tarjeta ni de la tabla, y se abre hacia arriba solo si no
   cabe hacia abajo. */
/* ============================================================
   Menú de "⋮" de cada tarjeta/fila: activar-desactivar y eliminar.
   ============================================================ */
function abrirMenuEmpleado(boton, codigo) {
  const emp = empleados.find(e => e.codigo === codigo); // Buscar al empleado en el estado actual
  if (!emp) return;

  abrirMenuAcciones(boton, [
    {
      // Botón 1: Activar / Desactivar
      texto: emp.estado === 'activo' ? 'Desactivar' : 'Activar',
      accion: async () => {
        const nuevoEstado = emp.estado === 'activo' ? false : true;
        try {
          // Llamada a la API para actualizar el estado
          await api(`/api/empleados/${codigo}`, 'PATCH', { activo: nuevoEstado });
          
          // Refrescar los datos desde el backend
          await cargarTodos();
          avisar(emp.nombre + (nuevoEstado ? ' quedó activo.' : ' quedó inactivo.'));
        } catch (error) {
          console.error('Error al cambiar estado:', error);
          avisar('No se pudo cambiar el estado del empleado.');
        }
      }
    },
    {
      // Botón 2: Borrado Lógico (Eliminar)
      texto: 'Eliminar empleado', peligro: true, // Se mantiene el estilo de peligro[cite: 1]
      accion: () => confirmar(
        '¿Eliminar a ' + emp.nombre + '?',
        'El empleado será dado de baja del sistema (borrado lógico).', // Texto adaptado
        'Eliminar',
        async () => {
          try {
            // Borrado lógico enviando activo: false
            await api(`/api/empleados/${codigo}`, 'PATCH', { activo: false }); 
            
            // Refrescar la tabla con los datos reales
            await cargarTodos();
            avisar(emp.nombre + ' fue eliminado correctamente.');
          } catch (error) {
            console.error('Error al eliminar:', error);
            avisar('No se pudo eliminar al empleado.');
          }
        }
      )
    }
  ]);
}
/* El buscador usa "input" (se actualiza mientras escribes).
   Los select usan "change" (una sola vez, al elegir la opción).
   OJO: si un mismo campo escuchara los dos eventos, un clic que le
   quita el foco al buscador dispara "change" justo antes del clic
   siguiente y vuelve a pintar la lista en ese instante, lo que puede
   hacer fallar el clic sobre la tarjeta que se recién dibujó. */
buscarEmpleado.addEventListener('input', () => { pagina = 1; pintarLista(); });
[filtroTipo, filtroUnidad, filtroEstadoEmp].forEach(c => {
  c.addEventListener('change', () => { pagina = 1; pintarLista(); });
});

document.getElementById('btnTarjetas').addEventListener('click', () => cambiarVista('tarjetas'));
document.getElementById('btnLista').addEventListener('click', () => cambiarVista('lista'));
function cambiarVista(v){
  vistaActual = v;
  document.getElementById('btnTarjetas').classList.toggle('is-on', v === 'tarjetas');
  document.getElementById('btnLista').classList.toggle('is-on', v === 'lista');
  pintarLista();
}

/* ============================================================
   Exportar a CSV
   ============================================================ */
let urlDescarga = null;
document.getElementById('btnExportar').addEventListener('click', () => {
  const filas = [['No.','Nombre','Tipo','Puesto','Unidad','Estado','DPI','Teléfono','Correo','Fecha de ingreso','Salario']];
  filtradosEmp().forEach(e => filas.push([
    e.codigo, e.nombre, e.tipo, e.puesto, e.unidad, e.estado, e.dpi, e.telefono, e.correo, e.ingreso, e.salario
  ]));
  const csv = filas.map(f => f.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  if (urlDescarga) URL.revokeObjectURL(urlDescarga);
  urlDescarga = URL.createObjectURL(blob);
  document.getElementById('textoExportar').textContent =
    `El directorio de empleados se exportó correctamente (${filtradosEmp().length} registros).`;
  abrirModal('modalExportar');
});
document.getElementById('btnDescargar').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = urlDescarga;
  a.download = 'empleados-seisa.csv';
  document.body.appendChild(a); a.click(); a.remove();
  cerrarModal('modalExportar');
});

/* ============================================================
   Formulario: crear / editar empleado
   ============================================================ */
const formEmpleado = document.getElementById('formEmpleado');
const fCampos = {
  nombre: document.getElementById('fNombre'),
  dpi: document.getElementById('fDpi'),
  nit: document.getElementById('fNit'),
  nacimiento: document.getElementById('fNacimiento'),
  telefono: document.getElementById('fTelefono'),
  correo: document.getElementById('fCorreo'),
  direccion: document.getElementById('fDireccion'),
  puesto: document.getElementById('fPuesto'),
  ingreso: document.getElementById('fIngreso'),
  salario: document.getElementById('fSalario'),
  unidad: document.getElementById('fUnidad')
};
let tipoSeleccionado = 'Técnico';

/* Contador de caracteres para los campos que tienen un límite corto
   en la base de datos (nombre completo y dirección). Se pone amarillo
   cerca del límite y rojo al llegar al tope. */
function activarContador(input, elementoContador){
  if (!input || !elementoContador) return;
  const maximo = Number(input.getAttribute('maxlength')) || 0;
  const actualizar = () => {
    const usados = input.value.length;
    elementoContador.textContent = `${usados} / ${maximo}`;
    elementoContador.classList.toggle('cerca', usados >= maximo * 0.85 && usados < maximo);
    elementoContador.classList.toggle('lleno', usados >= maximo);
  };
  input.addEventListener('input', actualizar);
  actualizar();
}
activarContador(document.getElementById('fNombre'), document.getElementById('contadorNombre'));
activarContador(document.getElementById('fDireccion'), document.getElementById('contadorDireccion'));
let editandoCodigo = null;

document.querySelectorAll('#segmentadoTipo [data-tipo]').forEach(b => {
  b.addEventListener('click', () => {
    tipoSeleccionado = b.dataset.tipo;
    document.querySelectorAll('#segmentadoTipo [data-tipo]').forEach(x => x.classList.toggle('is-on', x === b));
    fCampos.unidad.closest('.campo').style.opacity = tipoSeleccionado === 'Administrativo' ? '.5' : '1';
  });
});

document.getElementById('btnNuevoEmpleado').addEventListener('click', () => abrirFormularioEmpleado(null));
document.getElementById('btnCancelarEmpleado').addEventListener('click', () => {
  formEmpleado.reset();
  limpiarErroresForm();
  irA('lista');
});

function dibujarFotoForm(url){
  document.getElementById('previaFoto').innerHTML = url
    ? `<img src="${url}" alt="">`
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8.6" r="3.6"/><path d="M4.8 20c.9-3.7 3.8-5.7 7.2-5.7s6.3 2 7.2 5.7"/></svg>';
  document.getElementById('btnQuitarFoto').hidden = !url;
  if (url) formEmpleado.dataset.foto = url; else delete formEmpleado.dataset.foto;
}

document.getElementById('btnSubirFoto').addEventListener('click', () => document.getElementById('inputFoto').click());
document.getElementById('inputFoto').addEventListener('change', e => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => dibujarFotoForm(lector.result);
  lector.readAsDataURL(archivo);
  e.target.value = '';   /* para poder elegir el mismo archivo otra vez si hace falta */
});
document.getElementById('btnQuitarFoto').addEventListener('click', () => dibujarFotoForm(null));

function abrirFormularioEmpleado(emp){
  editandoCodigo = emp ? emp.codigo : null;
  formEmpleado.reset();
  limpiarErroresForm();
  dibujarFotoForm(emp && emp.foto ? emp.foto : null);

  const titulo = emp ? 'Editar empleado' : 'Registrar empleado';
  document.getElementById('tituloForm').textContent = titulo;
  document.getElementById('migaForm').textContent = titulo;
  document.getElementById('subForm').textContent = emp
    ? 'Actualiza el expediente laboral de esta persona.'
    : 'Crea el expediente laboral de una nueva persona.';
  document.getElementById('btnGuardarEmpleado').lastChild.textContent = emp ? ' Guardar cambios' : ' Crear empleado';

  tipoSeleccionado = emp ? emp.tipo : 'Técnico';
  document.querySelectorAll('#segmentadoTipo [data-tipo]').forEach(x =>
    x.classList.toggle('is-on', x.dataset.tipo === tipoSeleccionado));

  if (emp){
    fCampos.nombre.value = emp.nombre;
    fCampos.dpi.value = emp.dpi;
    fCampos.nit.value = emp.nit || '';
    fCampos.nacimiento.value = emp.nacimiento || '';
    fCampos.telefono.value = emp.telefono;
    fCampos.correo.value = emp.correo || '';
    fCampos.direccion.value = emp.direccion || '';
    fCampos.puesto.value = emp.puesto || '';
    fCampos.ingreso.value = emp.ingreso || '';
    fCampos.salario.value = emp.salario || '';
    fCampos.unidad.value = emp.unidad || '';
    fCampos.nacimiento.value = emp.nacimiento;
  }
  irA('nuevo');
  fCampos.nombre.focus();
}

function reglasEmpleado(){
  return {
    fNombre: fCampos.nombre.value.trim().length >= 3,
    fDpi: fCampos.dpi.value.replace(/\D/g,'').length >= 10,
    fNacimiento: !!fCampos.nacimiento.value,
    fTelefono: fCampos.telefono.value.replace(/\D/g,'').length === 8,
    fDireccion: fCampos.direccion.value.trim().length >= 5,
    fPuesto: fCampos.puesto.value.trim().length >= 2,
    fIngreso: !!fCampos.ingreso.value,
    fSalario: Number(fCampos.salario.value) > 0
  };
}
function validarEmpleado(marcar){
  const r = reglasEmpleado();
  let ok = true, primero = null;
  Object.entries(r).forEach(([id, bien]) => {
    const campo = document.getElementById(id).closest('.campo');
    if (marcar) campo.classList.toggle('mal', !bien);
    if (!bien){ ok = false; if (!primero) primero = document.getElementById(id); }
  });
  if (!ok && marcar && primero) primero.focus();
  return ok;
}
Object.keys(reglasEmpleado()).forEach(id => {
  const input = document.getElementById(id);
  input.addEventListener('blur', () => input.closest('.campo').classList.toggle('mal', !reglasEmpleado()[id]));
  input.addEventListener('input', () => {
    const campo = input.closest('.campo');
    if (campo.classList.contains('mal') && reglasEmpleado()[id]) campo.classList.remove('mal');
  });
});
function limpiarErroresForm(){ document.querySelectorAll('.campo.mal').forEach(c => c.classList.remove('mal')); }

function siguienteCodigo(){
  const max = empleados.reduce((m, e) => Math.max(m, Number((e.codigo || '').replace('EMP-','')) || 0), 0);
  return 'EMP-' + String(max + 1).padStart(3, '0');
}

/* ============================================================
   Formulario: crear / editar empleado (Conectado a la API)
   ============================================================ */
formEmpleado.addEventListener('submit', async e => { // Agregamos 'async'
  e.preventDefault();
  if (!validarEmpleado(true)) return; // Validaciones de la interfaz[cite: 1]

  // 1. Separar el nombre del formulario para la base de datos
  const partesNombre = fCampos.nombre.value.trim().split(' ');
  const nombreDB = partesNombre[0] || '';
  const apellidoDB = partesNombre.slice(1).join(' ') || '';

  const mapaPuestos = {
    'Administrativo': 1,
    'Técnico': 2,
    'Auxiliar': 3
  };

  // 2. Preparar el objeto con los datos que espera tu SQL
  const valorNit = fCampos.nit.value.trim();
  const datosDB = {
  id_puesto: mapaPuestos[tipoSeleccionado] || 1, // Se envía como número entero positivo
  nombre: nombreDB,
  apellido: apellidoDB,
  dpi: fCampos.dpi.value.trim(),
  nit: valorNit ? parseInt(valorNit) : null,
  direccion: fCampos.direccion.value.trim(),
  telefono: fCampos.telefono.value.trim(),
  email: fCampos.correo.value.trim(),
  fecha_contratacion: fCampos.ingreso.value,
  activo: true,
  fecha_nacimiento: fCampos.nacimiento.value
};

  try {
    // 3. Hacer la llamada a la API correspondiente (Crear o Actualizar)
    if (editandoCodigo) {
      await api(`/api/empleados/${editandoCodigo}`, 'PATCH', datosDB); // Actualiza si hay un código[cite: 1]
    } else {
      await api('/api/empleados', 'POST', datosDB); // Crea uno nuevo si no hay código[cite: 1]
    }

    // 4. Recargar la lista desde el servidor (esto actualiza cifras y tabla automáticamente)
    await cargarTodos();

    // 5. Mostrar mensajes de éxito en el modal[cite: 1]
    document.getElementById('tituloOk').textContent = editandoCodigo ? 'Cambios guardados' : 'Empleado registrado correctamente';
    document.getElementById('textoOk').textContent = editandoCodigo
      ? 'El expediente se actualizó correctamente.'
      : 'El expediente se creó y ya está disponible en el directorio.';
    
    document.getElementById('okNombre').textContent = fCampos.nombre.value.trim();
    document.getElementById('okDatos').textContent = tipoSeleccionado + ' • ' + (fCampos.puesto.value.trim() || 'Sin puesto');

    // Limpiar formulario y cerrar[cite: 1]
    formEmpleado.reset();
    limpiarErroresForm();
    abrirModal('modalOk');

  } catch (error) {
    console.error('Error al enviar el formulario:', error);
    /* Se muestra el mensaje real que manda el servidor (por ejemplo
       "El nombre no puede superar los 50 caracteres") en vez de uno
       genérico, para saber exactamente qué corregir. */
    avisar(error.message || 'Hubo un problema al guardar el empleado. Intenta nuevamente.');
  }
});
document.getElementById('btnAceptar').addEventListener('click', () => {
  cerrarModal('modalOk');
  irA('lista');
  pintarLista();
});

/* ============================================================
   Expediente: ver y editar
   ============================================================ */
const camposExp = ['dDpi','dTelefono','dNit','dCorreo','dNacimiento','dDireccion','dIngreso','dPuesto','dSalario','dUnidad'];

/* Mientras se edita, la foto nueva (o la orden de quitarla) se guarda
   aquí y solo se aplica de verdad al hacer clic en "Guardar cambios".
   undefined = no se tocó la foto, null = se pidió quitarla, texto = foto nueva. */
let fotoPendiente;

function dibujarFotoExp(url){
  document.getElementById('expFoto').innerHTML = url
    ? `<img src="${url}" alt="">`
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8.6" r="3.8"/><path d="M4.5 20c1-3.9 4-6 7.5-6s6.5 2.1 7.5 6"/></svg>';
  document.getElementById('btnQuitarFotoExp').hidden = !url;
}

function abrirExpediente(codigo, editar){
  const emp = empleados.find(e => e.codigo === codigo);
  if (!emp) return;
  codigoActual = codigo;
  fotoPendiente = undefined;

  document.getElementById('migaExpediente').textContent = emp.codigo;
  document.getElementById('expTitulo').textContent = 'Expediente del empleado';
  document.getElementById('expNombre').value = emp.nombre;
  document.getElementById('expCodigo').textContent = emp.codigo;
  document.getElementById('expEstado').textContent = emp.estado === 'activo' ? 'Activo' : 'Inactivo';
  document.getElementById('expEstado').className = 'etiqueta ' + emp.estado;
  document.getElementById('expTipo').value = emp.tipo;
  document.getElementById('expPunto').className = 'punto ' + puntoTipo(emp.tipo);
  document.getElementById('expPuesto').textContent = emp.puesto || '—';
  document.getElementById('expUnidad').textContent = emp.unidad || 'Sin unidad';
  dibujarFotoExp(emp.foto);

  document.getElementById('dDpi').value = emp.dpi || '';
  document.getElementById('dTelefono').value = emp.telefono || '';
  document.getElementById('dNit').value = emp.nit || '';
  document.getElementById('dCorreo').value = emp.correo || '';
  document.getElementById('dNacimiento').value = emp.nacimiento || '';
  document.getElementById('dDireccion').value = emp.direccion || '';
  document.getElementById('dIngreso').value = emp.ingreso || '';
  document.getElementById('dPuesto').value = emp.puesto || '';
  document.getElementById('dSalario').value = emp.salario || '';
  document.getElementById('dUnidad').value = emp.unidad || '';

  /* Asignación actual: enlaza técnico <-> auxiliar de la misma unidad */
  const caja = document.getElementById('cajaAsignacion');
  let pareja = null;
  if (emp.unidad){
    pareja = empleados.find(x => x.unidad === emp.unidad && x.codigo !== emp.codigo &&
      ((emp.tipo === 'Técnico' && x.tipo === 'Auxiliar') || (emp.tipo === 'Auxiliar' && x.tipo === 'Técnico')));
  }
  if (emp.tipo === 'Administrativo' || (!pareja && !emp.vehiculo)){
    caja.innerHTML = `<span style="color:var(--tenue);font-family:var(--serif)">Sin asignación registrada.</span>`;
  } else {
    const tecnico = emp.tipo === 'Técnico' ? emp : pareja;
    const auxiliar = emp.tipo === 'Auxiliar' ? emp : pareja;
    let html = '';
    if (tecnico) html += `<div class="nodo"><span class="aro"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="3.4"/><path d="M4.8 20c.8-3.6 3.7-5.6 7.2-5.6s6.4 2 7.2 5.6"/></svg></span><div><small>Técnico</small><strong>${escapar(tecnico.nombre)}</strong></div></div>`;
    if (emp.vehiculo || (tecnico && tecnico.vehiculo)){
      const v = emp.vehiculo || tecnico.vehiculo;
      html += `<span class="flecha-asig">→</span><div class="nodo"><span class="aro"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="10" width="18" height="7" rx="1.5"/><path d="M5 10l2-4h10l2 4"/><circle cx="7.5" cy="17.5" r="1.4"/><circle cx="16.5" cy="17.5" r="1.4"/></svg></span><div><small>Vehículo</small><strong>${escapar(v.placas || v.modelo || '—')}</strong></div></div>`;
    }
    if (auxiliar){
      html += `<span class="flecha-asig">→</span><div class="nodo rojo"><span class="aro"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="3.4"/><path d="M4.8 20c.8-3.6 3.7-5.6 7.2-5.6s6.4 2 7.2 5.6"/></svg></span><div><small>Auxiliar</small><strong>${escapar(auxiliar.nombre)}</strong></div></div>`;
    }
    caja.innerHTML = html;
  }

  /* Actividad reciente: se arma con lo que hay en el expediente */
  const act = document.getElementById('cajaActividad');
  const eventos = [];
  if (emp.unidad) eventos.push({ texto: 'Asignado a ' + emp.unidad, fecha: emp.ingreso });
  eventos.push({ texto: 'Expediente creado', fecha: emp.ingreso });
  act.innerHTML = eventos.map(ev => `
    <div class="evento">
      <span class="aro"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9.2"/><path d="M12 7v5l3.2 2"/></svg></span>
      <div>${escapar(ev.texto)}<small>${fechaBonita(ev.fecha)}</small></div>
    </div>`).join('');

  modoEdicionExp(!!editar);
  pintarPermisos();
  irAExpediente();
}

function irAExpediente(){
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('is-active', v.id === 'v-expediente'));
  cerrarMenus();
  window.scrollTo({ top:0 });
  location.hash = 'expediente';
}

function modoEdicionExp(activo){
  document.getElementById('cajaExpediente').classList.toggle('editando', activo);
  camposExp.forEach(id => document.getElementById(id).readOnly = !activo);
  document.getElementById('expNombre').readOnly = !activo;
  document.getElementById('expTipo').disabled = !activo;
  document.getElementById('fotoAccionesExp').hidden = !activo;
  if (activo){
    const hayFoto = !!document.querySelector('#expFoto img');
    document.getElementById('btnQuitarFotoExp').hidden = !hayFoto;
  }
  document.getElementById('btnEditarExp').hidden = activo;
  document.getElementById('btnGuardarExp').hidden = !activo;
}
document.getElementById('btnEditarExp').addEventListener('click', () => modoEdicionExp(true));
document.getElementById('btnVolverExp').addEventListener('click', () => {
  const volviendo = () => { irA('lista'); pintarLista(); };
  if (!document.getElementById('btnGuardarExp').hidden){
    confirmar('¿Salir sin guardar?', 'Los cambios que no hayas guardado se perderán.', 'Salir', () => {
      /* si venía cambiando la foto y cancela, se descarta el cambio */
      fotoPendiente = undefined;
      volviendo();
    });
  } else volviendo();
});

/* Cambiar / quitar la foto del expediente (solo se aplica al Guardar) */
document.getElementById('btnCambiarFotoExp').addEventListener('click', () => document.getElementById('inputFotoExp').click());
document.getElementById('inputFotoExp').addEventListener('change', e => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => {
    fotoPendiente = lector.result;
    dibujarFotoExp(lector.result);
    document.getElementById('btnQuitarFotoExp').hidden = false;
  };
  lector.readAsDataURL(archivo);
  e.target.value = '';   /* para poder volver a elegir el mismo archivo si hace falta */
});
document.getElementById('btnQuitarFotoExp').addEventListener('click', () => {
  fotoPendiente = null;
  dibujarFotoExp(null);
});

/* ============================================================
   Guardar cambios desde el Expediente (Conectado a la API)
   ============================================================ */
document.getElementById('btnGuardarExp').addEventListener('click', async () => {
  const emp = empleados.find(e => e.codigo === codigoActual);
  if (!emp) return;

  const nombreNuevo = document.getElementById('expNombre').value.trim();
  if (nombreNuevo.length < 3) {
    avisar('Escribe el nombre completo del empleado.');
    document.getElementById('expNombre').focus();
    return;
  }

  // 1. Separar nombre y apellido para el backend
  const partesNombre = nombreNuevo.split(' ');
  const nombreDB = partesNombre[0] || '';
  const apellidoDB = partesNombre.slice(1).join(' ') || '';

  // 2. Mapear puesto
  const mapaPuestos = {
    'Administrativo': 1,
    'Técnico': 2,
    'Auxiliar': 3
  };
  const tipoSeleccionado = document.getElementById('expTipo').value;

  // 3. Preparar objeto para SQL
  const valorNitExp = document.getElementById('dNit').value.trim();
  const datosDB = {
    nombre: nombreDB,
    apellido: apellidoDB,
    dpi: document.getElementById('dDpi').value.trim(),
    nit: valorNitExp ? parseInt(valorNitExp) : null,
    telefono: document.getElementById('dTelefono').value.trim(),
    email: document.getElementById('dCorreo').value.trim(),
    direccion: document.getElementById('dDireccion').value.trim(),
    fecha_contratacion: document.getElementById('dIngreso').value,
    id_puesto: mapaPuestos[tipoSeleccionado] || 1,
    fecha_nacimiento: document.getElementById('dNacimiento').value,
  };

  try {
    // 4. Petición PATCH al backend
    await api(`/api/empleados/${codigoActual}`, 'PATCH', datosDB);

    // 5. Recargar la lista desde el servidor
    await cargarTodos();

    modoEdicionExp(false);
    
    // Actualizar datos visibles en pantalla
    const empActualizado = empleados.find(e => e.codigo === codigoActual);
    if (empActualizado) {
      document.getElementById('expPunto').className = 'punto ' + puntoTipo(empActualizado.tipo);
      document.getElementById('expPuesto').textContent = empActualizado.puesto || '—';
      document.getElementById('expUnidad').textContent = empActualizado.unidad || 'Sin unidad';
    }
    
    fotoPendiente = undefined;
    avisar('Los cambios de ' + nombreNuevo + ' se guardaron correctamente.');

  } catch (error) {
    console.error('Error al actualizar expediente:', error);
    avisar(error.message || 'No se pudieron guardar los cambios en el servidor.');
  }
});

/* ============================================================
   Permisos y descansos (dentro del expediente)
   ============================================================ */
let tiposPermisoCache = null;

async function cargarTiposPermiso(){
  if (tiposPermisoCache) return tiposPermisoCache;
  try {
    const r = await api('/api/permisos/tipos');
    tiposPermisoCache = r.datos || [];
  } catch (error) {
    console.warn('No se pudieron cargar los tipos de permiso:', error);
    tiposPermisoCache = [];
  }
  const select = document.getElementById('pTipo');
  select.innerHTML = tiposPermisoCache.length
    ? tiposPermisoCache.map(t => `<option value="${t.id_tipo}">${escapar(t.nombre)}</option>`).join('')
    : '<option value="">No se pudieron cargar los tipos</option>';
  return tiposPermisoCache;
}

function nombreTipoPermiso(idTipo){
  const t = (tiposPermisoCache || []).find(x => x.id_tipo === idTipo);
  return t ? t.nombre : 'Tipo ' + idTipo;
}

async function pintarPermisos(){
  const cont = document.getElementById('listaPermisos');
  const vacio = document.getElementById('sinPermisos');
  await cargarTiposPermiso();

  let permisos = [];
  try {
    const r = await api('/api/permisos?empleado=' + codigoActual);
    permisos = r.datos || [];
  } catch (error) {
    cont.innerHTML = `<p class="vacio-mini">No se pudieron cargar los permisos: ${escapar(error.message)}</p>`;
    vacio.hidden = true;
    return;
  }

  cont.innerHTML = '';
  vacio.hidden = permisos.length > 0;

  permisos.forEach(p => {
    const fila = document.createElement('div');
    fila.className = 'fila';
    fila.innerHTML = `
      <span>${escapar(p.tipo_nombre)}</span>
      <span>📅 ${fechaBonita(p.desde)}</span>
      <span>${diasEntre(p.desde, p.hasta)}</span>
      <span>${escapar(p.motivo || '—')}</span>
      <span><i class="estado-permiso ${p.estado_texto}">${p.estado_texto.charAt(0).toUpperCase() + p.estado_texto.slice(1)}</i></span>
      <span class="acciones-fila">
        ${p.estado_texto === 'pendiente' ? `
          <button type="button" class="icono-btn" data-a="aprobar" aria-label="Aprobar"><svg viewBox="0 0 24 24" fill="none" stroke="#18BE2D" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg></button>
          <button type="button" class="icono-btn" data-a="rechazar" aria-label="Rechazar"><svg viewBox="0 0 24 24" fill="none" stroke="#E3453F" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}
        <button type="button" class="icono-btn" data-a="eliminar" aria-label="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg></button>
      </span>`;
    fila.querySelectorAll('[data-a]').forEach(b => {
      b.addEventListener('click', () => accionPermiso(b.dataset.a, p.id_permiso, p.tipo_nombre));
    });
    cont.appendChild(fila);
  });

  contar(document.getElementById('permTotal'), permisos.length);
  contar(document.getElementById('permAprobados'), permisos.filter(p => p.estado_texto === 'aprobado').length);
  contar(document.getElementById('permPendientes'), permisos.filter(p => p.estado_texto === 'pendiente').length);

  await pintarDiasDisponibles();
}

async function pintarDiasDisponibles(){
  try {
    const r = await api('/api/permisos/limite?empleado=' + codigoActual);
    const d = r.datos;
    document.getElementById('permAnio').textContent = d.anio;
    contar(document.getElementById('permDisponibles'), d.dias_disponibles);
    document.getElementById('avisoSinDias').hidden = d.dias_disponibles > 0;
  } catch (error) {
    console.warn('No se pudo cargar el límite de vacaciones:', error);
    document.getElementById('permDisponibles').textContent = '—';
  }
}

function accionPermiso(accion, id, tipoNombre){
  if (accion === 'aprobar'){
    api('/api/permisos/' + id + '/estado', 'PATCH', { aprobado: true })
      .then(() => { avisar('Permiso aprobado.'); pintarPermisos(); })
      .catch(error => avisar(error.message || 'No se pudo aprobar el permiso.'));
    return;
  }
  if (accion === 'rechazar'){
    api('/api/permisos/' + id + '/estado', 'PATCH', { aprobado: false })
      .then(() => { avisar('Permiso rechazado.'); pintarPermisos(); })
      .catch(error => avisar(error.message || 'No se pudo rechazar el permiso.'));
    return;
  }
  if (accion === 'eliminar'){
    confirmar('¿Eliminar este permiso?', 'El registro de ' + tipoNombre.toLowerCase() + ' se borrará del expediente.', 'Eliminar', () => {
      api('/api/permisos/' + id, 'DELETE')
        .then(() => { avisar('Permiso eliminado.'); pintarPermisos(); })
        .catch(error => avisar(error.message || 'No se pudo eliminar el permiso.'));
    });
  }
}

/* Contador de caracteres del motivo (máximo 30, es lo que permite la BD) */
(function activarContadorMotivo(){
  const campo = document.getElementById('pMotivo');
  const contador = document.getElementById('contadorMotivo');
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

document.getElementById('formPermiso').addEventListener('submit', async e => {
  e.preventDefault();
  const id_tipo = Number(document.getElementById('pTipo').value);
  const desde = document.getElementById('pDesde').value;
  const hasta = document.getElementById('pHasta').value;
  const motivo = document.getElementById('pMotivo').value.trim();

  if (!id_tipo){ avisar('Selecciona el tipo de permiso.'); return; }
  if (!desde || !hasta){ avisar('Indica las fechas del permiso.'); return; }
  if (hasta < desde){ avisar('La fecha "hasta" no puede ser anterior a "desde".'); return; }
  if (!motivo){ avisar('Escribe el motivo.'); return; }

  try {
    const r = await api('/api/permisos', 'POST', { id_empleado: codigoActual, id_tipo, desde, hasta, motivo });
    e.target.reset();
    document.getElementById('contadorMotivo').textContent = '0 / 30';
    pintarPermisos();
    avisar(r.mensaje || 'Permiso registrado y en espera de aprobación.');
  } catch (error) {
    /* Aquí es donde sale el aviso de "ya no puede pedir más
       vacaciones" cuando se acabó el límite del año. */
    avisar(error.message || 'No se pudo registrar el permiso.');
  }
});

/* ============================================================
   Arranque
   ============================================================ */
cargarTodos();
llenarUnidades();
actualizarCifras();
pintarLista();
if (location.hash.slice(1) === 'nuevo') abrirFormularioEmpleado(null);
