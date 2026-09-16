/* ============================================================
   SICORP — SEISA · módulo de USUARIOS
   Habla con el backend:
     GET    /api/credenciales        lista de usuarios
     POST   /api/usuarios            crear
     PUT    /api/usuarios/:id        actualizar
     DELETE /api/credenciales/:id    eliminar
     GET    /api/empleados           empleados para vincular
     GET    /api/roles               roles
     GET    /api/roles/:id/accesos   accesos de un rol
   Si el servidor no responde, la pantalla se queda con datos de
   ejemplo para poder seguir navegando (ver DEMO más abajo).
   ============================================================ */

const POR_PAGINA = 6;

let usuarios = [];
let empleados = [];
let roles = [];

let editandoId = null;
let pagina = 1;

/* Datos de respaldo por si el servidor no está encendido */
const DEMO = [
  { id:1, nombre:'Jonathan Duarte',  usuario:'j.duarte',  rol:'Administrador',        id_rol:1, estado:'activo',   accesos:['Todos los módulos'] },
  { id:2, nombre:'Jorge Chumil',     usuario:'j.chumil',  rol:'Seguridad Industrial', id_rol:2, estado:'activo',   accesos:['Inventario'] },
  { id:3, nombre:'Javier Hernández', usuario:'j.hernandez', rol:'Técnico',            id_rol:3, estado:'activo',   accesos:['Inventario'] },
  { id:4, nombre:'Erick Chilel',     usuario:'e.chilel',  rol:'Técnico',              id_rol:3, estado:'activo',   accesos:['Inventario'] },
  { id:5, nombre:'Oscar Tote',       usuario:'o.tote',    rol:'Técnico',              id_rol:3, estado:'activo',   accesos:['Inventario'] },
  { id:6, nombre:'Kevin Hernandez',  usuario:'k.hernandez', rol:'Auxiliar',           id_rol:4, estado:'inactivo', accesos:['Inventario'] }
];

/* ============================================================
   Navegación entre las dos vistas de esta página
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
  if (['lista','nuevo'].includes(destino)) irA(destino);
});

/* ============================================================
   Cargar datos
   ============================================================ */
function normalizar(u){
  return {
    id: u.id ?? u.id_credencial,
    nombre: u.nombre || '',
    usuario: u.usuario || '',
    rol: u.rol || 'Sin rol',
    id_rol: u.id_rol ?? '',
    codigo_empleado: u.codigo_empleado ?? '',
    estado: (u.estado) ? u.estado : (Number(u.Activo) === 0 ? 'inactivo' : 'activo'),
    accesos: Array.isArray(u.accesos)
      ? u.accesos
      : String(u.accesos || '').split(',').map(a => a.trim()).filter(Boolean)
  };
}

async function cargarUsuarios(){
  try {
    const respuesta = await api('/api/credenciales');
    usuarios = (respuesta.datos || []).map(normalizar);
  } catch (error) {
    console.warn('No se pudo consultar el servidor, se usan datos de ejemplo:', error);
    usuarios = DEMO.map(normalizar);
    avisar('No se pudo conectar con el servidor. Se muestran datos de ejemplo.');
  }
  pintarUsuarios();
}

async function cargarEmpleados(){
  const select = document.getElementById('empleado');
  try {
    const respuesta = await api('/api/empleados');
    empleados = respuesta.datos || [];
  } catch (error) {
    console.warn('No se pudieron cargar los empleados:', error);
    empleados = [];
  }
  select.innerHTML = '<option value="">Seleccionar empleado</option>';
  empleados.forEach(e => {
    const op = document.createElement('option');
    op.value = e.codigo_empleado;
    op.textContent = `${e.nombre} ${e.apellido}`;
    select.appendChild(op);
  });
}

async function cargarRoles(){
  const select = document.getElementById('rol');
  const chips = document.getElementById('listaRoles');
  const filtro = document.getElementById('filtroRol');
  try {
    const respuesta = await api('/api/roles');
    roles = respuesta.datos || [];
  } catch (error) {
    console.warn('No se pudieron cargar los roles:', error);
    roles = [];
  }

  select.innerHTML = '<option value="">Seleccionar rol</option>';
  filtro.innerHTML = '<option value="">Todos los roles</option>';
  chips.innerHTML = '';

  roles.forEach(r => {
    const op = document.createElement('option');
    op.value = r.id_rol;
    op.textContent = r.nombre;
    select.appendChild(op);

    const opf = document.createElement('option');
    opf.value = r.nombre;
    opf.textContent = r.nombre;
    filtro.appendChild(opf);

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'rol-chip';
    chip.dataset.idRol = r.id_rol;
    chip.textContent = r.nombre;
    chip.addEventListener('click', () => { select.value = r.id_rol; marcarRol(r.id_rol); });
    chips.appendChild(chip);
  });
}

function marcarRol(idRol){
  document.querySelectorAll('.rol-chip').forEach(c => {
    c.classList.toggle('is-on', Number(c.dataset.idRol) === Number(idRol));
  });
}

/* ============================================================
   Lista, filtros y paginación
   ============================================================ */
const lista = document.getElementById('listaUsuarios');
const sinResultados = document.getElementById('sinResultados');
const buscarUsuario = document.getElementById('buscarUsuario');
const filtroRol = document.getElementById('filtroRol');
const filtroEstado = document.getElementById('filtroEstado');
const cajaPaginacion = document.getElementById('paginacionUsuarios');

function filtrados(){
  const texto = buscarUsuario.value.trim().toLowerCase();
  const rol = filtroRol.value;
  const estado = filtroEstado.value;
  return usuarios.filter(u => {
    const coincide = !texto || (u.nombre + ' ' + u.usuario + ' ' + u.rol).toLowerCase().includes(texto);
    const rolOk = !rol || u.rol.toLowerCase() === rol.toLowerCase();
    const estadoOk = !estado || u.estado === estado;
    return coincide && rolOk && estadoOk;
  });
}

function pintarUsuarios(idNuevo){
  const datos = filtrados();
  const paginas = Math.max(1, Math.ceil(datos.length / POR_PAGINA));
  if (pagina > paginas) pagina = paginas;

  const visibles = datos.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  lista.innerHTML = '';

  visibles.forEach((u, i) => {
    const fila = document.createElement('div');
    fila.className = 'fila' + (u.id === idNuevo ? ' nueva' : '');
    fila.style.animationDelay = (sinMovimiento ? 0 : i * 0.05) + 's';
    fila.innerHTML = `
      <span>${escapar(u.nombre)}</span>
      <span>${escapar(u.rol)}</span>
      <span><i class="etiqueta ${u.estado}">${u.estado === 'activo' ? 'Activo' : 'Inactivo'}</i></span>
      <span class="accesos-lista">${u.accesos.map(a => `<i class="acceso-chip">${escapar(a)}</i>`).join('')}</span>
      <span class="menu-fila">
        <button class="puntos" aria-label="Acciones de ${escapar(u.nombre)}" aria-expanded="false">⋮</button>
      </span>`;

    fila.querySelector('.puntos').addEventListener('click', e => {
      e.stopPropagation();
      abrirMenuAcciones(e.currentTarget, [
        { texto:'Ver usuario', accion: () => accionFila('ver', u.id) },
        { texto:'Editar usuario', accion: () => accionFila('editar', u.id) },
        { texto: u.estado === 'activo' ? 'Desactivar' : 'Activar', accion: () => accionFila('estado', u.id) },
        { texto:'Eliminar', peligro:true, accion: () => accionFila('eliminar', u.id) }
      ]);
    });

    lista.appendChild(fila);
  });

  sinResultados.hidden = datos.length > 0;
  pintarPaginacion(cajaPaginacion, pagina, paginas, datos.length, n => { pagina = n; pintarUsuarios(); });
  actualizarCifras();
}

function actualizarCifras(){
  const metas = [
    usuarios.length,
    usuarios.filter(u => u.estado === 'activo').length,
    usuarios.filter(u => u.estado === 'inactivo').length
  ];
  document.querySelectorAll('.cifra .conteo').forEach((el, i) => contar(el, metas[i]));
}

/* Mismo criterio que en empleados.js: "input" solo en el buscador,
   "change" solo en los select, para no disparar dos repintados por
   el mismo clic (uno por blur y otro por la acción real). */
buscarUsuario.addEventListener('input', () => { pagina = 1; pintarUsuarios(); });
[filtroRol, filtroEstado].forEach(c => {
  c.addEventListener('change', () => { pagina = 1; pintarUsuarios(); });
});

/* ============================================================
   Acciones de cada fila
   ============================================================ */
function accionFila(accion, id){
  const u = usuarios.find(x => x.id === id);
  if (!u) return;

  if (accion === 'ver'){ abrirFormulario(u, true); return; }
  if (accion === 'editar'){ abrirFormulario(u, false); return; }

  if (accion === 'estado'){
    const activar = u.estado !== 'activo';
    confirmar(
      activar ? '¿Activar a ' + u.nombre + '?' : '¿Desactivar a ' + u.nombre + '?',
      activar ? 'Podrá volver a iniciar sesión con sus credenciales.'
              : 'No podrá entrar al sistema hasta que lo actives de nuevo.',
      activar ? 'Activar' : 'Desactivar',
      async () => {
        try {
          await api('/api/usuarios/' + id, {
            method: 'PUT',
            body: JSON.stringify({
              usuario: u.usuario,
              codigo_empleado: Number(u.codigo_empleado) || undefined,
              id_rol: Number(u.id_rol) || undefined,
              Activo: activar ? 1 : 0
            })
          });
        } catch (error) {
          console.warn('El cambio de estado no se guardó en el servidor:', error);
          avisar('Se cambió en pantalla, pero el servidor no lo guardó.');
        }
        u.estado = activar ? 'activo' : 'inactivo';
        pintarUsuarios();
        avisar(u.nombre + (activar ? ' quedó activo.' : ' quedó inactivo.'));
      }
    );
    return;
  }

  if (accion === 'eliminar'){
    confirmar(
      '¿Eliminar a ' + u.nombre + '?',
      'Se borrará la cuenta y sus accesos. Esta acción no se puede deshacer.',
      'Eliminar',
      async () => {
        try {
          await api('/api/credenciales/' + id, { method: 'DELETE' });
        } catch (error) {
          console.warn('No se pudo eliminar en el servidor:', error);
          avisar('Se quitó de la lista, pero el servidor no lo eliminó.');
        }
        usuarios = usuarios.filter(x => x.id !== id);
        pintarUsuarios();
        avisar(u.nombre + ' fue eliminado.');
      }
    );
  }
}

/* ============================================================
   Formulario
   ============================================================ */
const form = document.getElementById('formUsuario');
const campos = {
  empleado: document.getElementById('empleado'),
  nombre:   document.getElementById('nombre'),
  usuario:  document.getElementById('usuario'),
  clave:    document.getElementById('clave'),
  clave2:   document.getElementById('clave2'),
  rol:      document.getElementById('rol')
};

document.getElementById('btnNuevo').addEventListener('click', () => abrirFormulario(null));
document.getElementById('btnCancelar').addEventListener('click', () => {
  form.reset();
  limpiarErrores();
  irA('lista');
});

async function abrirFormulario(u, soloLectura){
  editandoId = u ? u.id : null;
  limpiarErrores();
  form.reset();

  if (!empleados.length) await cargarEmpleados();
  if (!roles.length) await cargarRoles();

  const titulo = soloLectura ? 'Ver usuario' : (u ? 'Editar usuario' : 'Nuevo usuario');
  document.getElementById('tituloForm').textContent = titulo;
  document.getElementById('migaForm').textContent = titulo;
  document.getElementById('subForm').textContent = soloLectura
    ? 'Datos de la cuenta (solo lectura).'
    : u ? 'Actualiza los datos de esta cuenta'
        : 'Crea una cuenta y define el rol que tendrá dentro del sistema';

  if (u){
    campos.nombre.value = u.nombre;
    campos.usuario.value = u.usuario;
    if (u.codigo_empleado) campos.empleado.value = u.codigo_empleado;
    if (u.id_rol) campos.rol.value = u.id_rol;
    marcarRol(u.id_rol);
  } else {
    marcarRol('');
  }

  /* Modo "Ver usuario": todo deshabilitado, sin contraseñas y sin botón
     de guardar — solo un botón para volver a la lista. */
  [campos.empleado, campos.usuario, campos.clave, campos.clave2, campos.rol].forEach(c => c.disabled = soloLectura);
  document.querySelectorAll('.rol-chip').forEach(c => c.disabled = soloLectura);
  campos.clave.closest('.campo').hidden = soloLectura;
  campos.clave2.closest('.campo').hidden = soloLectura;
  document.getElementById('btnGuardar').textContent = u ? 'Guardar cambios' : 'Crear usuario';
  document.getElementById('btnGuardar').hidden = soloLectura;
  document.getElementById('btnCancelar').textContent = soloLectura ? 'Volver' : 'Cancelar';

  irA('nuevo');
  campos.empleado.focus();
}

campos.rol.addEventListener('change', () => marcarRol(campos.rol.value));

campos.empleado.addEventListener('change', () => {
  const codigo = Number(campos.empleado.value);
  const empleado = empleados.find(e => Number(e.codigo_empleado) === codigo);
  if (!empleado){ campos.nombre.value = ''; return; }
  campos.nombre.value = `${empleado.nombre} ${empleado.apellido}`;
  if (!campos.usuario.dataset.tocado){
    campos.usuario.value = generarUsuario(empleado.nombre, empleado.apellido);
  }
});
campos.usuario.addEventListener('input', () => campos.usuario.dataset.tocado = '1');

function generarUsuario(nombre, apellido){
  const n = quitarTildes(nombre || ''), a = quitarTildes(apellido || '');
  if (!n || !a) return n || a;
  return (n.charAt(0) + '.' + a).toLowerCase();
}

function quitarTildes(t){
  return t.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

/* Ojitos de las contraseñas */
document.querySelectorAll('.ojo').forEach(b => {
  b.addEventListener('click', () => {
    const input = document.getElementById(b.dataset.ojo);
    const oculto = input.type === 'password';
    input.type = oculto ? 'text' : 'password';
    b.classList.toggle('viendo', oculto);
    b.setAttribute('aria-label', oculto ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
});

function reglas(){
  const repetido = usuarios.some(u =>
    u.usuario.toLowerCase() === campos.usuario.value.trim().toLowerCase() && u.id !== editandoId);
  return {
    nombre:  campos.nombre.value.trim().length >= 3,
    usuario: campos.usuario.value.trim().length >= 4 && !repetido,
    clave:   editandoId !== null ? (campos.clave.value === '' || campos.clave.value.length >= 8)
                                 : campos.clave.value.length >= 8,
    clave2:  campos.clave.value === campos.clave2.value
  };
}

function validar(marcar){
  const r = reglas();
  let ok = true, primero = null;
  Object.entries(r).forEach(([id, bien]) => {
    const campo = document.getElementById(id).closest('.campo');
    if (marcar) campo.classList.toggle('mal', !bien);
    if (!bien){ ok = false; if (!primero) primero = document.getElementById(id); }
  });
  if (!ok && marcar && primero) primero.focus();
  return ok;
}

Object.keys(reglas()).forEach(id => {
  const input = document.getElementById(id);
  input.addEventListener('blur', () => input.closest('.campo').classList.toggle('mal', !reglas()[id]));
  input.addEventListener('input', () => {
    const campo = input.closest('.campo');
    if (campo.classList.contains('mal') && reglas()[id]) campo.classList.remove('mal');
  });
});

function limpiarErrores(){
  document.querySelectorAll('.campo.mal').forEach(c => c.classList.remove('mal'));
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!validar(true)) return;

  const payload = { usuario: campos.usuario.value.trim(), Activo: 1 };
  if (campos.empleado.value) payload.codigo_empleado = Number(campos.empleado.value);
  if (campos.rol.value) payload.id_rol = Number(campos.rol.value);
  if (campos.clave.value) payload.contrasenia = campos.clave.value;

  const esEdicion = editandoId !== null;
  const url = esEdicion ? `/api/usuarios/${editandoId}` : '/api/usuarios';

  try {
    await api(url, { method: esEdicion ? 'PUT' : 'POST', body: JSON.stringify(payload) });
  } catch (error) {
    console.error('Error guardando el usuario:', error);
    avisar(error.message || 'No se pudo guardar el usuario.');
    return;
  }

  const nombreRol = roles.find(r => Number(r.id_rol) === Number(campos.rol.value))?.nombre || 'Sin rol';

  document.getElementById('tituloOk').textContent = esEdicion ? 'Cambios guardados' : 'Usuario creado correctamente';
  document.getElementById('textoOk').textContent = esEdicion
    ? 'Los datos de la cuenta quedaron actualizados.'
    : 'La cuenta fue creada y los accesos se asignaron correctamente.';
  document.getElementById('okNombre').textContent = campos.nombre.value.trim();
  document.getElementById('okDatos').textContent = 'Usuario: ' + payload.usuario + '  •  Rol: ' + nombreRol;

  form.reset();
  limpiarErrores();
  abrirModal('modalOk');
});

document.getElementById('btnAceptar').addEventListener('click', async () => {
  cerrarModal('modalOk');
  irA('lista');
  await cargarUsuarios();          /* vuelve a leer la lista del servidor */
});

/* ============================================================
   Arranque
   ============================================================ */
cargarUsuarios();
cargarRoles();
if (location.hash.slice(1) === 'nuevo') abrirFormulario(null);
