const { test, describe, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const { abrirBaseDatos } = require('../src/db');
const { crearApp } = require('../src/app');
const { horasDelDia } = require('../src/disponibilidad');

// "Ahora" fijo: martes 1 de diciembre de 2026, 10:00 en Madrid (09:00 UTC).
const AHORA = new Date('2026-12-01T09:00:00Z');
const MARTES = '2026-12-01';
const MIERCOLES = '2026-12-02';
const LUNES = '2026-12-07';

const cfg = { ...config, adminPassword: 'secreta', urlBase: 'http://localhost' };

let servidor;
let base;
let emails;
let db;

function arrancar() {
  db = abrirBaseDatos(':memory:');
  emails = [];
  const correo = {
    smtpConfigurado: false,
    confirmacionCliente: (r) => emails.push(['confirmacion', r.email]),
    avisoRestaurante: (r, a) => emails.push([`aviso-${a}`, cfg.restaurante.email]),
    cancelacionCliente: (r) => emails.push(['cancelacion', r.email]),
  };
  const app = crearApp({ config: cfg, db, correo, ahora: () => AHORA });
  return new Promise((ok) => {
    servidor = app.listen(0, () => { base = `http://127.0.0.1:${servidor.address().port}`; ok(); });
  });
}

const llamar = async (ruta, { method = 'GET', body, cookie } = {}) => {
  const res = await fetch(base + ruta, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, datos: await res.json().catch(() => null), headers: res.headers };
};

let n = 0;
const reserva = (extra = {}) => {
  n += 1;
  return {
    fecha: MIERCOLES, hora: '21:00', personas: 4, nombre: `Cliente ${n}`, telefono: '600 123 456',
    email: `cliente${n}@ejemplo.com`, comentarios: '', aceptaPrivacidad: true, ...extra,
  };
};

const login = async () => {
  const r = await llamar('/api/admin/login', { method: 'POST', body: { password: 'secreta' } });
  return r.headers.get('set-cookie').split(';')[0];
};

describe('Reservas Cuadrilla Sky', () => {
  beforeEach(async () => { if (servidor) servidor.close(); await arrancar(); });
  after(() => servidor.close());

  test('horario: de 08:00 a 22:30 cada 30 minutos (la última termina a las 24:00)', () => {
    const horas = horasDelDia(cfg);
    assert.equal(horas[0], 8 * 60);
    assert.equal(horas.at(-1), 22 * 60 + 30);
    assert.equal(horas.length, 30);
  });

  test('crea una reserva, devuelve código y envía emails al cliente y al restaurante', async () => {
    const r = await llamar('/api/reservas', { method: 'POST', body: reserva() });
    assert.equal(r.status, 201);
    assert.match(r.datos.codigo, /^[A-Z2-9]{6}$/);
    assert.equal(r.datos.token, undefined, 'el token de cancelación no debe devolverse');
    assert.deepEqual(emails.map((e) => e[0]), ['confirmacion', 'aviso-nueva']);
  });

  test('los lunes está cerrado', async () => {
    const d = await llamar(`/api/disponibilidad?fecha=${LUNES}&personas=2`);
    assert.equal(d.datos.cerrado, true);
    const r = await llamar('/api/reservas', { method: 'POST', body: reserva({ fecha: LUNES }) });
    assert.equal(r.status, 400);
  });

  test('no permite fechas pasadas ni horas con menos de 60 min de antelación', async () => {
    assert.equal((await llamar('/api/reservas', { method: 'POST', body: reserva({ fecha: '2026-11-30' }) })).status, 400);
    const d = await llamar(`/api/disponibilidad?fecha=${MARTES}&personas=2`);
    const h = Object.fromEntries(d.datos.horas.map((x) => [x.hora, x.disponible]));
    assert.equal(h['10:30'], false); // son las 10:00
    assert.equal(h['11:00'], true);
  });

  test('máximo 6 personas por reserva online', async () => {
    const r = await llamar('/api/reservas', { method: 'POST', body: reserva({ personas: 7 }) });
    assert.equal(r.status, 400);
  });

  test('exige aceptar la privacidad y datos válidos', async () => {
    assert.equal((await llamar('/api/reservas', { method: 'POST', body: reserva({ aceptaPrivacidad: false }) })).status, 400);
    assert.equal((await llamar('/api/reservas', { method: 'POST', body: reserva({ email: 'no-es-email' }) })).status, 400);
    assert.equal((await llamar('/api/reservas', { method: 'POST', body: reserva({ telefono: '12' }) })).status, 400);
    assert.equal((await llamar('/api/reservas', { method: 'POST', body: reserva({ hora: '21:15' }) })).status, 400);
    assert.equal((await llamar('/api/reservas', { method: 'POST', body: reserva({ hora: '23:00' }) })).status, 400);
  });

  test('aforo: 16 mesas por franja; la 17.ª reserva solapada se rechaza', async () => {
    for (let i = 0; i < 16; i += 1) {
      const r = await llamar('/api/reservas', { method: 'POST', body: reserva({ personas: 2 }) });
      assert.equal(r.status, 201, `reserva ${i + 1}`);
    }
    const llena = await llamar('/api/reservas', { method: 'POST', body: reserva({ hora: '21:30', personas: 2 }) });
    assert.equal(llena.status, 409);
    // 90 minutos después la mesa queda libre
    const libre = await llamar('/api/reservas', { method: 'POST', body: reserva({ hora: '22:30', personas: 2 }) });
    assert.equal(libre.status, 201);
    const d = await llamar(`/api/disponibilidad?fecha=${MIERCOLES}&personas=2`);
    const h = Object.fromEntries(d.datos.horas.map((x) => [x.hora, x.disponible]));
    assert.equal(h['20:00'], false); // 20:00–21:30 se solapa con las de 21:00
    assert.equal(h['19:30'], true); // 19:30–21:00 no se solapa
  });

  test('aforo: nunca más de 100 comensales a la vez', async () => {
    // 16 mesas de 6 = 96 personas → cabe; el límite de mesas salta antes.
    // Comprobamos con un aforo menor que el límite de personas también se respeta.
    servidor.close();
    const pequeno = { ...cfg, reservas: { ...cfg.reservas, aforoMaximo: 10 } };
    db = abrirBaseDatos(':memory:');
    const app = crearApp({ config: pequeno, db, correo: { confirmacionCliente() {}, avisoRestaurante() {}, cancelacionCliente() {} }, ahora: () => AHORA });
    await new Promise((ok) => { servidor = app.listen(0, () => { base = `http://127.0.0.1:${servidor.address().port}`; ok(); }); });
    assert.equal((await llamar('/api/reservas', { method: 'POST', body: reserva({ personas: 6 }) })).status, 201);
    assert.equal((await llamar('/api/reservas', { method: 'POST', body: reserva({ personas: 5 }) })).status, 409);
    assert.equal((await llamar('/api/reservas', { method: 'POST', body: reserva({ personas: 4 }) })).status, 201);
  });

  test('el cliente puede cancelar con el enlace del email y libera la mesa', async () => {
    await llamar('/api/reservas', { method: 'POST', body: reserva() });
    const { token } = db.prepare('SELECT token FROM reservas').get();
    const ver = await llamar(`/api/reservas/cancelar/${token}`);
    assert.equal(ver.datos.estado, 'confirmada');
    const c = await llamar(`/api/reservas/cancelar/${token}`, { method: 'POST' });
    assert.equal(c.datos.estado, 'cancelada');
    assert.ok(emails.some((e) => e[0] === 'cancelacion'));
    assert.ok(emails.some((e) => e[0] === 'aviso-cancelada'));
    assert.equal((await llamar('/api/reservas/cancelar/token-falso-que-no-existe-123')).status, 404);
  });

  test('panel: requiere contraseña', async () => {
    assert.equal((await llamar(`/api/admin/reservas?fecha=${MIERCOLES}`)).status, 401);
    assert.equal((await llamar('/api/admin/login', { method: 'POST', body: { password: 'mala' } })).status, 401);
    const cookie = await login();
    const r = await llamar(`/api/admin/reservas?fecha=${MIERCOLES}`, { cookie });
    assert.equal(r.status, 200);
    assert.equal(r.datos.mesas, 16);
  });

  test('panel: lista, filtra, cambia estado y crea reservas telefónicas', async () => {
    await llamar('/api/reservas', { method: 'POST', body: reserva({ nombre: 'Ana García' }) });
    await llamar('/api/reservas', { method: 'POST', body: reserva({ nombre: 'Luis Pérez', hora: '14:00' }) });
    const cookie = await login();

    let r = await llamar(`/api/admin/reservas?fecha=${MIERCOLES}`, { cookie });
    assert.deepEqual(r.datos.reservas.map((x) => x.nombre), ['Luis Pérez', 'Ana García']);

    r = await llamar(`/api/admin/reservas?fecha=${MIERCOLES}&q=ana`, { cookie });
    assert.equal(r.datos.reservas.length, 1);

    const id = r.datos.reservas[0].id;
    assert.equal((await llamar(`/api/admin/reservas/${id}`, { method: 'PATCH', body: { estado: 'completada' }, cookie })).status, 200);
    assert.equal((await llamar(`/api/admin/reservas/${id}`, { method: 'PATCH', body: { estado: 'inventado' }, cookie })).status, 400);

    // Telefónica, sin email, para hoy dentro de los 60 min (el restaurante sí puede)
    const t = await llamar('/api/admin/reservas', {
      method: 'POST', cookie, body: { fecha: MARTES, hora: '10:30', personas: 3, nombre: 'Mesa teléfono', telefono: '912345678' },
    });
    assert.equal(t.status, 201);
    assert.equal(t.datos.origen, 'restaurante');
  });

  test('panel: no deja reactivar una reserva cancelada si ya no hay sitio', async () => {
    const cookie = await login();
    await llamar('/api/reservas', { method: 'POST', body: reserva() });
    const { id } = db.prepare('SELECT id FROM reservas').get();
    await llamar(`/api/admin/reservas/${id}`, { method: 'PATCH', body: { estado: 'cancelada' }, cookie });
    for (let i = 0; i < 16; i += 1) await llamar('/api/reservas', { method: 'POST', body: reserva() });
    const r = await llamar(`/api/admin/reservas/${id}`, { method: 'PATCH', body: { estado: 'confirmada' }, cookie });
    assert.equal(r.status, 409);
  });

  test('cabeceras de seguridad y campo trampa anti-bots', async () => {
    const r = await llamar('/api/config');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.datos.restaurante.nombre, 'Cuadrilla Sky');
    assert.equal((await llamar('/api/reservas', { method: 'POST', body: reserva({ web: 'spam' }) })).status, 400);
  });
});
