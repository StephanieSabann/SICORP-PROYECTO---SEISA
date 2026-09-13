/* ============================================================
   SEISA — comportamiento del sitio
   Navegación entre páginas 
   ============================================================ */
const paginas = ['inicio','nosotros','contacto','login'];
const nav = document.getElementById('nav');
const burger = document.getElementById('burger');

function irA(id, empujarHash = true){
  if(!paginas.includes(id)) id = 'inicio';
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('is-active', p.id === id));
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('is-active', a.dataset.go === id));
  nav.classList.remove('open');
  burger.classList.remove('open');
  burger.setAttribute('aria-expanded','false');
  if(window.__revelar) window.__revelar(id);
  if(empujarHash && location.hash !== '#'+id) history.pushState({p:id}, '', '#'+id);
  window.scrollTo({top:0, behavior:'instant' in window ? 'auto' : 'auto'});
  const h = document.querySelector('#'+id+' h1');
  if(h){ h.setAttribute('tabindex','-1'); h.focus({preventScroll:true}); }
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-go]');
  if(!t) return;
  e.preventDefault();
  irA(t.dataset.go);
});
window.addEventListener('popstate', () => irA((location.hash||'#inicio').slice(1), false));
burger.addEventListener('click', () => {
  const abierto = nav.classList.toggle('open');
  burger.classList.toggle('open', abierto);
  burger.setAttribute('aria-expanded', abierto ? 'true' : 'false');
});
irA((location.hash||'#inicio').slice(1), false);

/* ============================================================
   Formulario de contacto + modal
   ============================================================ */
const form = document.getElementById('formContacto');
const modal = document.getElementById('modalOk');
const emailRe = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

const reglas = {
  nombre:   v => v.trim().length >= 3,
  correo:   v => emailRe.test(v.trim()),
  telefono: v => v.replace(/\D/g,'').length >= 8,
  asunto:   v => v.trim().length >= 3,
  mensaje:  v => v.trim().length >= 10
};

function validarCampo(id){
  const input = document.getElementById(id);
  const campo = document.getElementById('f-'+id);
  const ok = reglas[id](input.value);
  campo.classList.toggle('error', !ok);
  input.setAttribute('aria-invalid', ok ? 'false' : 'true');
  return ok;
}

Object.keys(reglas).forEach(id => {
  const input = document.getElementById(id);
  input.addEventListener('blur', () => validarCampo(id));
  input.addEventListener('input', () => {
    const campo = document.getElementById('f-'+id);
    if(campo.classList.contains('error')) validarCampo(id);
  });
});

form.addEventListener('submit', e => {
  e.preventDefault();
  let todoOk = true, primerError = null;
  Object.keys(reglas).forEach(id => {
    const ok = validarCampo(id);
    if(!ok){ todoOk = false; if(!primerError) primerError = document.getElementById(id); }
  });
  if(!todoOk){ primerError.focus(); return; }

  /* Aquí puedes enviar los datos a tu backend, por ejemplo:
     fetch('enviar.php', { method:'POST', body:new FormData(form) })  */
  console.log('Datos del formulario:', Object.fromEntries(new FormData(form)));

  abrirModal();
  form.reset();
});

let ultimoFoco = null;
function abrirModal(){
  ultimoFoco = document.activeElement;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  const check = modal.querySelector('.check');   /* reinicia el dibujo del cheque */
  check.classList.remove('draw'); void check.offsetWidth; check.classList.add('draw');
  document.getElementById('cerrarModal').focus();
}
function cerrarModal(){
  modal.classList.remove('open');
  document.body.style.overflow = '';
  if(ultimoFoco) ultimoFoco.focus();
}
document.getElementById('cerrarModal').addEventListener('click', cerrarModal);
modal.addEventListener('click', e => { if(e.target === modal) cerrarModal(); });
document.addEventListener('keydown', e => { if(e.key === 'Escape' && modal.classList.contains('open')) cerrarModal(); });

/* ============================================================
   Login
   ============================================================ */
const formLogin = document.getElementById('formLogin');
const alerta = document.getElementById('loginAlert');
const inCorreo = document.getElementById('loginCorreo');
const inPass = document.getElementById('loginPass');
const recordar = document.getElementById('recordar');

/*Recuperar el correo guardado, si el navegador lo permite */
try{
  const guardado = localStorage.getItem('seisa_correo');
  if(guardado){ inCorreo.value = guardado; recordar.checked = true; }
}catch(err){}

function aviso(texto, tipo){
  alerta.textContent = texto;
  alerta.className = 'login-alert show ' + tipo;
}

//IMPORTANTE: AQUI ES DONDE SE ENVIA LA INFO DEL FORM A EL BACKEND
formLogin.addEventListener('submit', async e => {
    e.preventDefault();

    const usuario = inCorreo.value.trim();
    const contraseña = inPass.value;

    
    const passOk = contraseña.length >= 1; //conprobacion que quedó del login anterior

    document.getElementById('l-pass')
        .classList.toggle('error', !passOk);

    if (!passOk) {
        aviso('La contraseña debe tener al menos 1 caracter.', 'bad');
        inPass.focus();
        return;
    }

    try {

        if (recordar.checked) {
            localStorage.setItem('seisa_correo', usuario);
        } else {
            localStorage.removeItem('seisa_correo');
        }

        aviso('Verificando credenciales...', 'ok');

        const respuesta = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                usuario: usuario,
                contraseña: contraseña
            })
        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            aviso(datos.mensaje || 'Usuario o contraseña incorrectos.', 'bad');
            return;
        }

        if (datos.exito) {
            aviso('Credenciales verificadas. Abriendo SICORP...', 'ok');

            setTimeout(() => {
                window.location.href = '/inicio';
            }, 700);
        }

    } catch (error) {

        console.error('Error comunicando con el servidor:', error);

        aviso(
            'No se pudo conectar con el servidor.',
            'bad'
        );
    }
});

document.getElementById('olvide').addEventListener('click', () => {
  aviso('Escribe tu correo y el administrador te enviará un enlace para restablecer la contraseña.','ok');
  inCorreo.focus();
});

/* ============================================================
   MOVIMIENTO: revelado al hacer scroll, parallax y detalles
   ============================================================ */
const sinMovimiento = matchMedia('(prefers-reduced-motion:reduce)').matches;

/* -- revelado progresivo de bloques -- */
const revelables = '.services .card, .stats, .infobar, .duo .card, .timeline, .zones';
document.querySelectorAll(revelables).forEach(el => el.classList.add('reveal'));
document.querySelectorAll('.services .card, .duo .card').forEach((el, i) => {
  el.style.setProperty('--d', (i % 3) * 0.1 + 's');
});

const observador = new IntersectionObserver(entradas => {
  entradas.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
}, { threshold: .12, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('.reveal').forEach(el => observador.observe(el));

/* Al cambiar de página se vuelve a animar lo que entra en pantalla */
function reiniciarRevelado(id){
  document.querySelectorAll('#' + id + ' .reveal').forEach(el => el.classList.remove('in'));
  requestAnimationFrame(() => {
    document.querySelectorAll('#' + id + ' .reveal').forEach(el => {
      observador.unobserve(el); observador.observe(el);
    });
  });
}

/* -- encabezado compacto al bajar -- */
const cabecera = document.querySelector('.site-header');
addEventListener('scroll', () => {
  cabecera.classList.toggle('scrolled', scrollY > 30);
}, { passive:true });

/* -- parallax suave del hero siguiendo el cursor -- */
if (matchMedia('(pointer:fine)').matches && !sinMovimiento) {
  document.querySelectorAll('.hero').forEach(hero => {
    hero.addEventListener('mousemove', e => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;
      const y = (e.clientY - r.top) / r.height - .5;
      hero.querySelectorAll('.circuit').forEach((c, i) => {
        const f = 14 + i * 8;
        c.style.transform = `translate3d(${x * f}px, ${y * f}px, 0)`;
      });
      const copy = hero.querySelector('.hero-copy');
      if (copy) copy.style.transform = `translate3d(${x * -10}px, ${y * -7}px, 0)`;
    });
    hero.addEventListener('mouseleave', () => {
      hero.querySelectorAll('.circuit').forEach(c => c.style.transform = '');
      const copy = hero.querySelector('.hero-copy');
      if (copy) copy.style.transform = '';
    });
  });
}

/* -- el 38 del equipo técnico cuenta hacia arriba -- */
document.querySelectorAll('.stat span').forEach(span => {
  const m = span.textContent.match(/^(\d+)\s+(.*)$/);
  if (!m) return;
  span.innerHTML = '<b class="conteo">0</b> ' + m[2];
  span.querySelector('.conteo').dataset.meta = m[1];
});

function contar(el){
  const meta = +el.dataset.meta;
  if (sinMovimiento) { el.textContent = meta; return; }
  const inicio = performance.now();
  const paso = t => {
    const p = Math.min((t - inicio) / 900, 1);
    el.textContent = Math.round(meta * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

const obsConteo = new IntersectionObserver(entradas => {
  entradas.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.querySelectorAll('.conteo').forEach(contar);
    obsConteo.unobserve(e.target);
  });
}, { threshold:.3 });
document.querySelectorAll('.stats').forEach(s => obsConteo.observe(s));

window.__revelar = reiniciarRevelado;
