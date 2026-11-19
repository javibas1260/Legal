// Utilidades compartidas por todas las páginas.
window.Comun = (() => {
  async function api(url, opciones = {}) {
    const res = await fetch(url, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
      body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(datos.error || 'Ha ocurrido un error. Inténtalo de nuevo.');
      e.estado = res.status;
      throw e;
    }
    return datos;
  }

  function fechaLarga(fecha) {
    const [y, m, d] = fecha.split('-').map(Number);
    return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d)));
  }

  function sumarDias(fecha, dias) {
    const [y, m, d] = fecha.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
  }

  function diaSemana(fecha) {
    const [y, m, d] = fecha.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  function el(etiqueta, props = {}, ...hijos) {
    const n = document.createElement(etiqueta);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const h of hijos.flat()) if (h != null) n.append(h);
    return n;
  }

  async function cargarRestaurante() {
    const cfg = await api('/api/config');
    document.querySelectorAll('[data-nombre]').forEach((n) => { n.textContent = cfg.restaurante.nombre; });
    // Marca: "Cuadrilla Sky" → "cuadrilla" grande + "SKY" espaciado debajo
    const palabras = cfg.restaurante.nombre.trim().split(/\s+/);
    const secundaria = palabras.length > 1 ? palabras.pop() : '';
    document.querySelectorAll('[data-marca]').forEach((n) => {
      n.setAttribute('aria-label', cfg.restaurante.nombre);
      n.replaceChildren(el('span', { class: 'marca-principal' }, palabras.join(' ')),
        secundaria ? el('span', { class: 'marca-secundaria' }, secundaria) : null);
    });
    document.querySelectorAll('[data-direccion]').forEach((n) => { n.textContent = cfg.restaurante.direccion; });
    document.title = document.title.replace('Cuadrilla Sky', cfg.restaurante.nombre);
    return cfg;
  }

  return { api, fechaLarga, sumarDias, diaSemana, el, cargarRestaurante };
})();
