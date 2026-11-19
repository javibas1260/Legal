(async () => {
  const { api, fechaLarga, sumarDias, diaSemana, el, cargarRestaurante } = window.Comun;
  const $ = (id) => document.getElementById(id);
  const form = $('formulario');
  const error = $('error');
  let horaElegida = null;
  let cfg;

  const mostrarError = (msg) => {
    error.textContent = msg;
    error.classList.toggle('oculto', !msg);
    if (msg) error.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  try {
    cfg = await cargarRestaurante();
  } catch {
    mostrarError('No podemos conectar con el sistema de reservas. Inténtalo en unos minutos.');
    return;
  }

  // Personas: botones redondos 1…máximo
  let personas = 2;
  const pintarPersonas = () => $('personas').querySelectorAll('button')
    .forEach((b) => b.setAttribute('aria-pressed', String(Number(b.value) === personas)));
  for (let i = 1; i <= cfg.maxPersonasPorReserva; i += 1) {
    $('personas').append(el('button', {
      type: 'button', value: i, 'aria-label': `${i} ${i === 1 ? 'persona' : 'personas'}`,
      onclick: () => { personas = i; pintarPersonas(); cargarHoras(); },
    }, String(i)));
  }
  pintarPersonas();
  const contacto = cfg.restaurante.telefono
    ? `Llámanos al ${cfg.restaurante.telefono} o escríbenos a ${cfg.restaurante.email}.`
    : `Escríbenos a ${cfg.restaurante.email} y te preparamos la mesa.`;
  $('nota-grupos').textContent = `¿Sois más de ${cfg.maxPersonasPorReserva}? ${contacto}`;

  // Fecha: primer día abierto a partir de hoy
  const fecha = $('fecha');
  fecha.min = cfg.hoy;
  fecha.max = sumarDias(cfg.hoy, cfg.diasMaximosAntelacion);
  let primera = cfg.hoy;
  while (cfg.horario.diasCerrados.includes(diaSemana(primera))) primera = sumarDias(primera, 1);
  fecha.value = primera;

  async function cargarHoras() {
    const cont = $('horas');
    const nota = $('nota-horas');
    horaElegida = null;
    cont.replaceChildren();
    mostrarError('');
    if (!fecha.value) { nota.textContent = 'Elige una fecha para ver las horas libres.'; return; }
    nota.textContent = 'Buscando mesas libres…';
    try {
      const r = await api(`/api/disponibilidad?fecha=${fecha.value}&personas=${personas}`);
      if (r.cerrado) { nota.textContent = `${r.motivo} Elige otro día, por favor.`; return; }
      const libres = r.horas.filter((h) => h.disponible).length;
      for (const h of r.horas) {
        cont.append(el('button', {
          type: 'button', class: 'hora', disabled: !h.disponible, 'aria-pressed': 'false',
          'aria-label': `${h.hora}${h.disponible ? '' : ', completo'}`,
          onclick: (ev) => {
            cont.querySelectorAll('.hora').forEach((b) => b.setAttribute('aria-pressed', 'false'));
            ev.currentTarget.setAttribute('aria-pressed', 'true');
            horaElegida = h.hora;
          },
        }, h.hora));
      }
      nota.textContent = libres
        ? `${fechaLarga(fecha.value)} · cada reserva dura ${cfg.duracionMinutos} minutos.`
        : '¡Vaya! Ese día está completo. Prueba con otra fecha.';
    } catch (e) {
      nota.textContent = e.message;
    }
  }

  fecha.addEventListener('change', cargarHoras);
  cargarHoras();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    mostrarError('');
    if (!horaElegida) return mostrarError('Elige una hora, por favor.');
    for (const id of ['nombre', 'telefono', 'email']) {
      if (!$(id).checkValidity() || !$(id).value.trim()) {
        $(id).focus();
        return mostrarError(`Revisa el campo «${$(id).labels[0].textContent}».`);
      }
    }
    if (!$('privacidad').checked) return mostrarError('Debes aceptar la política de privacidad.');

    const boton = $('enviar');
    boton.disabled = true;
    boton.textContent = 'Reservando…';
    try {
      const r = await api('/api/reservas', {
        method: 'POST',
        body: {
          fecha: fecha.value, hora: horaElegida, personas,
          nombre: $('nombre').value, telefono: $('telefono').value, email: $('email').value,
          comentarios: $('comentarios').value, web: $('web').value, aceptaPrivacidad: true,
        },
      });
      $('codigo').textContent = r.codigo;
      $('resumen').replaceChildren(
        el('li', {}, `📅 ${fechaLarga(r.fecha)}`),
        el('li', {}, `🕗 ${r.hora}`),
        el('li', {}, `👥 ${r.personas} ${r.personas === 1 ? 'persona' : 'personas'}`),
        el('li', {}, `🙂 ${r.nombre}`),
      );
      $('paso-reserva').classList.add('oculto');
      $('paso-exito').classList.remove('oculto');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      mostrarError(e.message);
      if (e.estado === 409) cargarHoras();
    } finally {
      boton.disabled = false;
      boton.textContent = 'Confirmar reserva';
    }
  });

  $('otra').addEventListener('click', () => {
    form.reset();
    fecha.value = primera;
    personas = 2;
    pintarPersonas();
    $('paso-exito').classList.add('oculto');
    $('paso-reserva').classList.remove('oculto');
    cargarHoras();
  });
})();
