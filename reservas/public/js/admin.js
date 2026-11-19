(async () => {
  const { api, fechaLarga, sumarDias, el, cargarRestaurante } = window.Comun;
  const $ = (id) => document.getElementById(id);
  const ESTADOS = { confirmada: 'Confirmada', cancelada: 'Cancelada', completada: 'Completada', no_presentado: 'No presentado' };

  const cfg = await cargarRestaurante();
  const aviso = (id, msg) => { $(id).textContent = msg || ''; $(id).classList.toggle('oculto', !msg); };

  // ---------- Sesión ----------
  async function mostrarPanel() {
    $('vista-login').classList.add('oculto');
    $('vista-panel').classList.remove('oculto');
    if (!$('f-fecha').value) $('f-fecha').value = cfg.hoy;
    await cargar();
  }

  const volverAlLogin = () => {
    $('vista-panel').classList.add('oculto');
    $('vista-login').classList.remove('oculto');
  };

  try { await api('/api/admin/sesion'); await mostrarPanel(); } catch { /* sin sesión */ }

  $('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    aviso('error-login');
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: $('password').value } });
      $('password').value = '';
      await mostrarPanel();
    } catch (e) { aviso('error-login', e.message); }
  });

  $('salir').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    volverAlLogin();
  });

  // ---------- Listado ----------
  let temporizador;
  async function cargar() {
    const fecha = $('f-fecha').value;
    if (!fecha) return;
    aviso('error-panel');
    $('titulo-dia').textContent = fechaLarga(fecha) + (cfg.horario.diasCerrados.includes(new Date(`${fecha}T12:00:00Z`).getUTCDay()) ? ' · cerrado' : '');
    const params = new URLSearchParams({ fecha, estado: $('f-estado').value, q: $('f-buscar').value });
    try {
      const d = await api(`/api/admin/reservas?${params}`);
      pintarKpis(d);
      pintarOcupacion(d);
      pintarTabla(d.reservas);
    } catch (e) {
      if (e.estado === 401) return volverAlLogin();
      aviso('error-panel', e.message);
    }
  }

  function pintarKpis({ reservas, ocupacion, mesas }) {
    const activas = reservas.filter((r) => r.estado !== 'cancelada');
    const pax = activas.reduce((s, r) => s + r.personas, 0);
    const pico = ocupacion.reduce((m, o) => (o.mesas > m.mesas ? o : m), { mesas: 0, hora: '—' });
    $('kpis').replaceChildren(
      el('div', { class: 'kpi' }, el('b', {}, String(activas.length)), el('span', {}, 'reservas activas')),
      el('div', { class: 'kpi' }, el('b', {}, String(pax)), el('span', {}, 'comensales')),
      el('div', { class: 'kpi' }, el('b', {}, `${pico.mesas}/${mesas}`), el('span', {}, `mesas en el pico (${pico.hora})`)),
      el('div', { class: 'kpi' }, el('b', {}, String(reservas.filter((r) => r.estado === 'cancelada').length)), el('span', {}, 'canceladas')),
    );
  }

  function pintarOcupacion({ ocupacion, mesas, aforoMaximo }) {
    $('leyenda').textContent = `mesas ocupadas de ${mesas} · máx. ${aforoMaximo} pax`;
    $('ocupacion').replaceChildren(...ocupacion.map((o) => {
      const pct = Math.round((o.mesas / mesas) * 100);
      const nivel = o.mesas >= mesas ? ' llena' : pct >= 75 ? ' alta' : '';
      return el('div', { class: `franja${nivel}`, title: `${o.hora}: ${o.mesas} mesas, ${o.personas} personas` },
        el('b', {}, o.hora), `${o.mesas} · ${o.personas}p`,
        el('div', { class: 'barrita' }, el('i', { style: `width:${pct}%` })));
    }));
  }

  function pintarTabla(reservas) {
    if (!reservas.length) {
      $('tabla').replaceChildren(el('tr', {}, el('td', { colspan: 6, class: 'vacio' }, 'No hay reservas con estos filtros. ¡Día tranquilo! ☕')));
      return;
    }
    $('tabla').replaceChildren(...reservas.map((r) => {
      const selector = el('select', { 'aria-label': `Estado de la reserva ${r.codigo}` },
        ...Object.entries(ESTADOS).map(([v, t]) => el('option', { value: v, selected: v === r.estado }, t)));
      selector.addEventListener('change', async () => {
        try {
          await api(`/api/admin/reservas/${r.id}`, { method: 'PATCH', body: { estado: selector.value } });
          cargar();
        } catch (e) {
          aviso('error-panel', e.message);
          selector.value = r.estado;
        }
      });
      const contacto = [r.telefono, r.email.endsWith('@reserva.local') ? '' : r.email].filter(Boolean).join(' · ');
      return el('tr', {},
        el('td', {}, el('b', {}, r.hora)),
        el('td', {}, String(r.personas)),
        el('td', {}, r.nombre, el('small', {}, contacto), r.origen === 'restaurante' ? el('small', {}, '📞 añadida por el restaurante') : null),
        el('td', {}, r.comentarios || '—'),
        el('td', {}, el('code', {}, r.codigo)),
        el('td', {}, el('span', { class: `estado ${r.estado}` }, ESTADOS[r.estado]), el('div', {}, selector)),
      );
    }));
  }

  const moverDia = (n) => { $('f-fecha').value = sumarDias($('f-fecha').value || cfg.hoy, n); cargar(); };
  $('anterior').addEventListener('click', () => moverDia(-1));
  $('siguiente').addEventListener('click', () => moverDia(1));
  $('hoy').addEventListener('click', () => { $('f-fecha').value = cfg.hoy; cargar(); });
  $('f-fecha').addEventListener('change', cargar);
  $('f-estado').addEventListener('change', cargar);
  $('f-buscar').addEventListener('input', () => { clearTimeout(temporizador); temporizador = setTimeout(cargar, 300); });
  setInterval(() => { if (!document.hidden && !$('vista-panel').classList.contains('oculto')) cargar(); }, 60_000);

  // ---------- Nueva reserva ----------
  for (let i = 1; i <= cfg.maxPersonasPorReserva; i += 1) $('n-personas').append(el('option', { value: i, selected: i === 2 }, String(i)));

  async function cargarHorasNueva() {
    const sel = $('n-hora');
    sel.replaceChildren(el('option', { value: '' }, 'Cargando…'));
    try {
      const r = await api(`/api/disponibilidad?fecha=${$('n-fecha').value}&personas=${$('n-personas').value}`);
      if (r.cerrado) { sel.replaceChildren(el('option', { value: '' }, r.motivo)); return; }
      sel.replaceChildren(...r.horas.map((h) => el('option', { value: h.hora, disabled: !h.disponible }, `${h.hora}${h.disponible ? '' : ' · completo'}`)));
      const primera = r.horas.find((h) => h.disponible);
      if (primera) sel.value = primera.hora;
    } catch (e) { sel.replaceChildren(el('option', { value: '' }, e.message)); }
  }

  $('nueva').addEventListener('click', () => {
    $('form-nueva').reset();
    $('n-fecha').value = $('f-fecha').value || cfg.hoy;
    $('n-personas').value = '2';
    aviso('error-nueva');
    cargarHorasNueva();
    $('dialogo').showModal();
  });
  $('cerrar').addEventListener('click', () => $('dialogo').close());
  $('n-fecha').addEventListener('change', cargarHorasNueva);
  $('n-personas').addEventListener('change', cargarHorasNueva);

  $('form-nueva').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    aviso('error-nueva');
    $('guardar').disabled = true;
    try {
      await api('/api/admin/reservas', {
        method: 'POST',
        body: {
          fecha: $('n-fecha').value, hora: $('n-hora').value, personas: Number($('n-personas').value),
          nombre: $('n-nombre').value, telefono: $('n-telefono').value, email: $('n-email').value,
          comentarios: $('n-comentarios').value, enviarEmail: $('n-enviar').checked,
        },
      });
      $('dialogo').close();
      $('f-fecha').value = $('n-fecha').value;
      cargar();
    } catch (e) {
      aviso('error-nueva', e.message);
    } finally {
      $('guardar').disabled = false;
    }
  });
})();
