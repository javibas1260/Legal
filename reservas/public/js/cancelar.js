(async () => {
  const { api, fechaLarga, el, cargarRestaurante } = window.Comun;
  const $ = (id) => document.getElementById(id);
  const token = new URLSearchParams(location.search).get('t') || '';
  const url = `/api/reservas/cancelar/${encodeURIComponent(token)}`;

  cargarRestaurante().catch(() => {});

  const mensaje = (texto, tipo) => {
    $('mensaje').textContent = texto;
    $('mensaje').className = `aviso ${tipo}`;
  };

  const pintar = (r) => {
    $('resumen').replaceChildren(
      el('li', {}, `📅 ${fechaLarga(r.fecha)}`),
      el('li', {}, `🕗 ${r.hora}`),
      el('li', {}, `👥 ${r.personas} ${r.personas === 1 ? 'persona' : 'personas'}`),
      el('li', {}, `🔖 Código ${r.codigo}`),
    );
    if (r.estado === 'cancelada') {
      $('icono').textContent = '👋';
      $('titulo').textContent = 'Reserva cancelada';
      mensaje('Tu reserva está cancelada. ¡Esperamos verte pronto!', 'ok');
      $('cancelar').classList.add('oculto');
      $('volver').classList.remove('oculto');
    } else if (r.estado === 'confirmada') {
      $('icono').textContent = '🍽️';
      $('titulo').textContent = `Hola, ${r.nombre}. ¿Quieres cancelar tu reserva?`;
      $('cancelar').classList.remove('oculto');
    } else {
      $('titulo').textContent = 'Esta reserva ya no se puede modificar';
      $('volver').classList.remove('oculto');
    }
  };

  try {
    pintar(await api(url));
  } catch (e) {
    $('icono').textContent = '🤔';
    $('titulo').textContent = 'No encontramos la reserva';
    mensaje(e.message, 'error');
    $('volver').classList.remove('oculto');
  }

  $('cancelar').addEventListener('click', async () => {
    $('cancelar').disabled = true;
    try {
      pintar(await api(url, { method: 'POST' }));
    } catch (e) {
      mensaje(e.message, 'error');
      $('cancelar').disabled = false;
    }
  });
})();
