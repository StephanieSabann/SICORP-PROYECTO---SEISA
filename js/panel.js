/* ============================================================
   SICORP — SEISA · lógica del panel
   ============================================================ */

const LLAVE = 'sicorp_usuarios';
const sinMovimiento = matchMedia('(prefers-reduced-motion:reduce)').matches;

/* Accesos que sugiere cada rol */
const ACCESOS_POR_ROL = {
  'Administrador': ['Empleados', 'Inventario', 'Nóminas', 'Reportes', 'Usuarios'],
  'Seguridad Industrial': ['Inventario'],
  'Técnico': ['Inventario'],
  'Auxiliares': ['Inventario']
};

const SEMILLA = [
  { id:1, nombre:'Jonathan',        usuario:'jonathan',   correo:'jonathan@seisa.com.gt',  rol:'Administrador',        estado:'activo',   accesos:['Empleados','Inventario','Nóminas','Reportes','Usuarios'] },
  { id:2, nombre:'Luis García',     usuario:'l.garcia',   correo:'l.garcia@seisa.com.gt',  rol:'Seguridad Industrial', estado:'activo',   accesos:['Inventario'] },
  { id:3, nombre:'Andrés López',    usuario:'a.lopez',    correo:'a.lopez@seisa.com.gt',   rol:'Técnico',              estado:'activo',   accesos:['Inventario'] },
  { id:4, nombre:'Mario Hernández', usuario:'m.hernandez',correo:'m.hernandez@seisa.com.gt',rol:'Técnico',             estado:'activo',   accesos:['Inventario'] },
  { id:5, nombre:'Jose Ramiréz',    usuario:'j.ramirez',  correo:'j.ramirez@seisa.com.gt', rol:'Auxiliares',           estado:'activo',   accesos:['Inventario'] },
  { id:6, nombre:'Carlos Méndez',   usuario:'c.mendez',   correo:'c.mendez@seisa.com.gt',  rol:'Técnico',              estado:'inactivo', accesos:['Inventario'] }
];

let usuarios = cargar();
let editandoId = null;   /* null = estamos creando */

function cargar(){
  try{
    const guardado = localStorage.getItem(LLAVE);
    if(guardado) return JSON.parse(guardado);
  }catch(e){}
  return SEMILLA.map(u => ({...u}));
}
function guardar(){
  try{ localStorage.setItem(LLAVE, JSON.stringify(usuarios)); }catch(e){}
}

/* ============================================================
   Navegación entre vistas
   ============================================================ */
const vistas = document.querySelectorAll('.vista');

function irA(vista){
  vistas.forEach(v => v.classList.toggle('is-active', v.id === 'v-' + vista));
  cerrarMenus();
  window.scrollTo({ top:0, behavior:'auto' });
  if(vista === 'usuarios') pintarUsuarios();
  location.hash = vista;
}

document.getElementById('btnCuenta').addEventListener('click', e => {
  e.stopPropagation();
  const menu = document.getElementById('menuCuenta');
  const abierto = menu.classList.toggle('abierto');
  e.currentTarget.classList.toggle('abierto', abierto);
  e.currentTarget.setAttribute('aria-expanded', abierto ? 'true' : 'false');
});

document.querySelectorAll('#menuCuenta [data-ir]').forEach(b => {
  b.addEventListener('click', () => {
    const destino = b.dataset.ir;
    if(destino === 'cuenta'){ cerrarMenus(); avisar('La pantalla de cuenta todavía está en construcción.'); return; }
    irA(destino);
  });
});

document.getElementById('btnSalir').addEventListener('click', () => {
  avisar('Cerrando sesión…');
  setTimeout(() => { window.location.href = 'index.html#login'; }, 500);
});

/* Módulos del menú lateral y de las tarjetas: aún no tienen pantalla */
document.querySelectorAll('[data-modulo]').forEach(el => {
  el.addEventListener('click', () => avisar('El módulo de ' + el.dataset.modulo + ' está en construcción.'));
});

function cerrarMenus(){
  document.getElementById('menuCuenta').classList.remove('abierto');
  const chev = document.getElementById('btnCuenta');
  chev.classList.remove('abierto');
  chev.setAttribute('aria-expanded','false');
  document.querySelectorAll('.opciones.abierto').forEach(o => o.classList.remove('abierto'));
  document.querySelectorAll('.fila.encima').forEach(f => f.classList.remove('encima'));
}
document.addEventListener('click', e => {
  if(!e.target.closest('.cuenta') && !e.target.closest('.menu-fila')) cerrarMenus();
});
document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  const abierto = document.querySelector('.fondo-modal.abierto');
  if(abierto) cerrarModal(abierto.id); else cerrarMenus();
});

/* Saludo según la hora */
(function saludar(){
  const h = new Date().getHours();
  const momento = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  document.getElementById('saludoTexto').textContent =
    momento + ', ' + document.getElementById('nombreUsuario').textContent;
})();

/* ============================================================
   Lista de usuarios
   ============================================================ */
const lista = document.getElementById('listaUsuarios');
const sinResultados = document.getElementById('sinResultados');
const buscarUsuario = document.getElementById('buscarUsuario');
const filtroRol = document.getElementById('filtroRol');
const filtroEstado = document.getElementById('filtroEstado');

function filtrados(){
  const texto = buscarUsuario.value.trim().toLowerCase();
  const rol = filtroRol.value;
  const estado = filtroEstado.value;
  return usuarios.filter(u => {
    const coincide = !texto ||
      (u.nombre + ' ' + u.usuario + ' ' + u.correo + ' ' + u.rol).toLowerCase().includes(texto);
    const rolOk = !rol || u.rol.toLowerCase() === rol.toLowerCase();
    const estadoOk = !estado || u.estado === estado;
    return coincide && rolOk && estadoOk;
  });
}

function pintarUsuarios(idNuevo){
  const datos = filtrados();
  lista.innerHTML = '';

  datos.forEach((u, i) => {
    const fila = document.createElement('div');
    fila.className = 'fila' + (u.id === idNuevo ? ' nueva' : '');
    fila.style.animationDelay = (sinMovimiento ? 0 : i * 0.05) + 's';
    fila.innerHTML = `
      <span>${escapar(u.nombre)}</span>
      <span>${escapar(u.rol)}</span>
      <span><i class="etiqueta ${u.estado}">${u.estado === 'activo' ? 'Activo' : 'Inactivo'}</i></span>
      <span class="accesos-lista">${u.accesos.map(a => `<i class="acceso-chip">${escapar(a)}</i>`).join('')}</span>
      <span class="menu-fila">
        <button class="puntos" aria-label="Acciones de ${escapar(u.nombre)}">⋮</button>
        <span class="opciones">
          <button data-accion="editar">Editar usuario</button>
          <button data-accion="estado">${u.estado === 'activo' ? 'Desactivar' : 'Activar'}</button>
          <button data-accion="eliminar" class="peligro">Eliminar</button>
        </span>
      </span>`;

    fila.querySelector('.puntos').addEventListener('click', e => {
      e.stopPropagation();
      const caja = fila.querySelector('.opciones');
      const abierto = caja.classList.contains('abierto');
      cerrarMenus();
      caja.classList.toggle('abierto', !abierto);
      fila.classList.toggle('encima', !abierto);
    });
    fila.querySelectorAll('.opciones button').forEach(b => {
      b.addEventListener('click', () => { cerrarMenus(); accionFila(b.dataset.accion, u.id); });
    });

    lista.appendChild(fila);
  });

  sinResultados.hidden = datos.length > 0;
  actualizarCifras();
}

function escapar(t){
  return String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function actualizarCifras(){
  const metas = [
    usuarios.length,
    usuarios.filter(u => u.estado === 'activo').length,
    usuarios.filter(u => u.estado === 'inactivo').length
  ];
  document.querySelectorAll('.cifra .conteo').forEach((el, i) => contar(el, metas[i]));
}

function contar(el, meta){
  const desde = parseInt(el.textContent, 10) || 0;
  if(sinMovimiento || desde === meta){ el.textContent = meta; el.dataset.meta = meta; return; }
  const inicio = performance.now();
  const paso = t => {
    const p = Math.min((t - inicio) / 600, 1);
    el.textContent = Math.round(desde + (meta - desde) * (1 - Math.pow(1 - p, 3)));
    if(p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

[buscarUsuario, filtroRol, filtroEstado].forEach(c => {
  c.addEventListener('input', () => pintarUsuarios());
  c.addEventListener('change', () => pintarUsuarios());
});

/* ============================================================
   Acciones de cada fila
   ============================================================ */
let pendiente = null;   /* {accion, id} a confirmar */

function accionFila(accion, id){
  const u = usuarios.find(x => x.id === id);
  if(!u) return;

  if(accion === 'editar'){ abrirFormulario(u); return; }

  if(accion === 'estado'){
    pendiente = { accion:'estado', id };
    abrirConfirmacion(
      u.estado === 'activo' ? '¿Desactivar a ' + u.nombre + '?' : '¿Activar a ' + u.nombre + '?',
      u.estado === 'activo'
        ? 'No podrá entrar al sistema hasta que lo actives de nuevo.'
        : 'Podrá volver a iniciar sesión con sus credenciales.',
      u.estado === 'activo' ? 'Desactivar' : 'Activar'
    );
    return;
  }

  if(accion === 'eliminar'){
    pendiente = { accion:'eliminar', id };
    abrirConfirmacion('¿Eliminar a ' + u.nombre + '?', 'Se borrará la cuenta y sus accesos. Esta acción no se puede deshacer.', 'Eliminar');
  }
}

document.getElementById('btnSi').addEventListener('click', () => {
  if(!pendiente) return;
  const u = usuarios.find(x => x.id === pendiente.id);

  if(pendiente.accion === 'estado'){
    u.estado = u.estado === 'activo' ? 'inactivo' : 'activo';
    avisar(u.nombre + (u.estado === 'activo' ? ' quedó activo.' : ' quedó inactivo.'));
  }
  if(pendiente.accion === 'eliminar'){
    usuarios = usuarios.filter(x => x.id !== pendiente.id);
    avisar(u.nombre + ' fue eliminado.');
  }

  guardar();
  pendiente = null;
  cerrarModal('modalConfirmar');
  pintarUsuarios();
});
document.getElementById('btnNo').addEventListener('click', () => { pendiente = null; cerrarModal('modalConfirmar'); });

/* ============================================================
   Formulario de usuario
   ============================================================ */
const form = document.getElementById('formUsuario');
const campos = {
  empleado: document.getElementById('empleado'),
  nombre:   document.getElementById('nombre'),
  usuario:  document.getElementById('usuario'),
  correo:   document.getElementById('correo'),
  clave:    document.getElementById('clave'),
  clave2:   document.getElementById('clave2'),
  rol:      document.getElementById('rol')
};
const cajasAcceso = () => Array.from(document.querySelectorAll('.accesos .acceso input'));

document.getElementById('btnNuevo').addEventListener('click', () => abrirFormulario(null));
document.getElementById('btnCancelar').addEventListener('click', () => {
  form.reset();
  limpiarErrores();
  irA('usuarios');
});

function abrirFormulario(u){
  editandoId = u ? u.id : null;
  limpiarErrores();
  form.reset();

  document.getElementById('tituloForm').textContent = u ? 'Editar usuario' : 'Nuevo usuario';
  document.getElementById('subForm').textContent = u
    ? 'Actualiza los datos y los accesos de esta cuenta'
    : 'Crea una cuenta y define los accesos que tendrá dentro del sistema';
  document.getElementById('btnGuardar').textContent = u ? 'Guardar cambios' : 'Crear usuario';

  if(u){
    campos.nombre.value = u.nombre;
    campos.usuario.value = u.usuario;
    campos.correo.value = u.correo;
    campos.rol.value = u.rol;
    marcarRol(u.rol, false);
    cajasAcceso().forEach(c => {
      c.checked = u.accesos.includes(c.value);
    });
  }else{
    campos.rol.value = 'Técnico';
    marcarRol('Técnico', true);
  }
  irA('nuevo');
  campos.nombre.focus();
}

/* Sugerir el usuario a partir del nombre (solo al crear) */
campos.nombre.addEventListener('input', () => {
  if(editandoId !== null || campos.usuario.dataset.tocado) return;
  const partes = campos.nombre.value.trim().toLowerCase().split(/\s+/);
  if(partes.length >= 2) campos.usuario.value = partes[0][0] + '.' + quitarTildes(partes[1]);
  else if(partes[0]) campos.usuario.value = quitarTildes(partes[0]);
});
campos.usuario.addEventListener('input', () => campos.usuario.dataset.tocado = '1');
campos.empleado.addEventListener('change', () => {
  if(campos.empleado.value){
    campos.nombre.value = campos.empleado.value;
    campos.nombre.dispatchEvent(new Event('input'));
  }
});
function quitarTildes(t){
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

/* Rol: el select y los tres botones van sincronizados */
document.querySelectorAll('.rol-chip').forEach(chip => {
  chip.addEventListener('click', () => { campos.rol.value = chip.dataset.rol; marcarRol(chip.dataset.rol, true); });
});
campos.rol.addEventListener('change', () => marcarRol(campos.rol.value, true));

function marcarRol(rol, aplicarAccesos){
  document.querySelectorAll('.rol-chip').forEach(c => c.classList.toggle('is-on', c.dataset.rol === rol));
  if(aplicarAccesos){
    const sugeridos = ACCESOS_POR_ROL[rol] || [];
    cajasAcceso().forEach(c => c.checked = sugeridos.includes(c.value));
  }
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

/* Validación */
const correoRe = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

function reglas(){
  const usuarioRepetido = usuarios.some(u =>
    u.usuario.toLowerCase() === campos.usuario.value.trim().toLowerCase() && u.id !== editandoId);
  return {
    nombre:  campos.nombre.value.trim().length >= 3,
    usuario: campos.usuario.value.trim().length >= 4 && !usuarioRepetido,
    correo:  correoRe.test(campos.correo.value.trim()),
    clave:   editandoId !== null ? (campos.clave.value === '' || campos.clave.value.length >= 8) : campos.clave.value.length >= 8,
    clave2:  campos.clave.value === campos.clave2.value
  };
}

function validar(marcar){
  const r = reglas();
  let ok = true, primero = null;
  Object.entries(r).forEach(([id, bien]) => {
    const campo = document.getElementById(id).closest('.campo');
    if(marcar) campo.classList.toggle('mal', !bien);
    if(!bien){ ok = false; if(!primero) primero = document.getElementById(id); }
  });
  if(!ok && marcar && primero) primero.focus();
  return ok;
}

Object.keys(reglas()).forEach(id => {
  const input = document.getElementById(id);
  input.addEventListener('blur', () => {
    const campo = input.closest('.campo');
    campo.classList.toggle('mal', !reglas()[id]);
  });
  input.addEventListener('input', () => {
    const campo = input.closest('.campo');
    if(campo.classList.contains('mal') && reglas()[id]) campo.classList.remove('mal');
  });
});
function limpiarErrores(){
  document.querySelectorAll('.campo.mal').forEach(c => c.classList.remove('mal'));
}

form.addEventListener('submit', e => {
  e.preventDefault();
  if(!validar(true)) return;

  const accesos = cajasAcceso().filter(c => c.checked).map(c => c.value);

  const datos = {
    nombre:  campos.nombre.value.trim(),
    usuario: campos.usuario.value.trim(),
    correo:  campos.correo.value.trim(),
    rol:     campos.rol.value,
    accesos: accesos.length ? accesos : ['Sin accesos']
  };

  let id;
  if(editandoId !== null){
    const u = usuarios.find(x => x.id === editandoId);
    Object.assign(u, datos);
    id = u.id;
  }else{
    id = Date.now();
    usuarios.push({ id, estado:'activo', ...datos });
  }
  guardar();

  /* Aquí es donde mandarías los datos a tu backend:
     fetch('api/usuarios.php', { method:'POST', body:JSON.stringify(datos) }) */

  document.getElementById('tituloOk').textContent =
    editandoId !== null ? 'Cambios guardados' : 'Usuario creado correctamente';
  document.getElementById('textoOk').textContent =
    editandoId !== null
      ? 'Los datos y los accesos de la cuenta quedaron actualizados.'
      : 'La cuenta fue creada y los accesos se asignaron correctamente.';
  document.getElementById('okNombre').textContent = datos.nombre;
  document.getElementById('okDatos').textContent = 'Usuario: ' + datos.usuario + '  •  Rol: ' + datos.rol;

  form.reset();
  limpiarErrores();
  abrirModal('modalOk');
  document.getElementById('btnAceptar').dataset.id = id;
});

document.getElementById('btnAceptar').addEventListener('click', e => {
  cerrarModal('modalOk');
  irA('usuarios');
  pintarUsuarios(Number(e.currentTarget.dataset.id));
});

/* ============================================================
   Modales y avisos
   ============================================================ */
let focoPrevio = null;

function abrirModal(id){
  focoPrevio = document.activeElement;
  document.getElementById(id).classList.add('abierto');
  document.body.style.overflow = 'hidden';
  const boton = document.querySelector('#' + id + ' .btn-rojo');
  if(boton) boton.focus();
}
function cerrarModal(id){
  document.getElementById(id).classList.remove('abierto');
  document.body.style.overflow = '';
  if(focoPrevio) focoPrevio.focus();
}
document.querySelectorAll('.fondo-modal').forEach(f => {
  f.addEventListener('click', e => { if(e.target === f) cerrarModal(f.id); });
});

function abrirConfirmacion(titulo, texto, textoBoton){
  document.getElementById('tituloConfirmar').textContent = titulo;
  document.getElementById('textoConfirmar').textContent = texto;
  document.getElementById("btnSi").textContent = textoBoton;
  abrirModal('modalConfirmar');
}

let tiempoAviso;
function avisar(texto){
  const caja = document.getElementById('aviso');
  caja.textContent = texto;
  caja.classList.add('visible');
  clearTimeout(tiempoAviso);
  tiempoAviso = setTimeout(() => caja.classList.remove('visible'), 2600);
}

window.addEventListener('hashchange', () => {
  const destino = location.hash.slice(1);
  if(['inicio','usuarios','nuevo'].includes(destino)) irA(destino);
});

/* ============================================================
   Arranque
   ============================================================ */
pintarUsuarios();
irA(['inicio','usuarios','nuevo'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'inicio');