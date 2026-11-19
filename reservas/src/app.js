const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { transaccion, ESTADOS } = require('./db');
const { aMinutos, esFechaValida, esHoraValida, ahoraEn, diaSemana } = require('./tiempo');
const { horasDelDia, motivoDiaNoReservable, reservasActivas, cabe, disponibilidad, ocupacionDelDia } = require('./disponibilidad');

const DURACION_SESION_MS = 12 * 60 * 60 * 1000;

class ErrorCliente extends Error {
  constructor(mensaje, estado = 400) { super(mensaje); this.estado = estado; }
}

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

function validarDatosCliente(body, config) {
  const nombre = texto(body.nombre);
  const telefono = texto(body.telefono);
  const email = texto(body.email).toLowerCase();
  const comentarios = texto(body.comentarios);
  const personas = Number(body.personas);
  const { fecha, hora } = body;

  if (!esFechaValida(fecha)) throw new ErrorCliente('La fecha no es válida.');
  if (!esHoraValida(hora)) throw new ErrorCliente('La hora no es válida.');
  if (!Number.isInteger(personas) || personas < 1 || personas > config.reservas.maxPersonasPorReserva) {
    throw new ErrorCliente(`El número de personas debe estar entre 1 y ${config.reservas.maxPersonasPorReserva}.`);
  }
  if (nombre.length < 2 || nombre.length > 80) throw new ErrorCliente('Indica un nombre (entre 2 y 80 caracteres).');
  if (!/^\+?[\d\s().-]{9,20}$/.test(telefono) || telefono.replace(/\D/g, '').length < 9) {
    throw new ErrorCliente('Indica un teléfono válido.');
  }
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorCliente('Indica un email válido.');
  if (comentarios.length > 500) throw new ErrorCliente('Los comentarios no pueden superar 500 caracteres.');
  return { fecha, hora, personas, nombre, telefono, email, comentarios };
}

const codigoCorto = () => {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(6), (b) => letras[b % letras.length]).join('');
};

const parsearCookies = (cabecera = '') => Object.fromEntries(
  cabecera.split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
);

const igualSeguro = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

const vistaPublica = (r) => ({ codigo: r.codigo, fecha: r.fecha, hora: r.hora, personas: r.personas, nombre: r.nombre, estado: r.estado });

function crearApp({ config, db, correo, ahora = () => new Date() }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
    });
    next();
  });
  app.use(express.json({ limit: '20kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ---------- Reserva con control de aforo ----------
  function crearReserva(datos, { origen, comprobarCalendario }) {
    if (comprobarCalendario) {
      const motivo = motivoDiaNoReservable(config, datos.fecha, ahora());
      if (motivo) throw new ErrorCliente(motivo);
    } else if (config.horario.diasCerrados.includes(diaSemana(datos.fecha))) {
      throw new ErrorCliente('Ese día el restaurante está cerrado.');
    }
    const inicio = aMinutos(datos.hora);
    if (!horasDelDia(config).includes(inicio)) throw new ErrorCliente('Esa hora no está disponible para reservar.');

    return transaccion(db, () => {
      const huecos = disponibilidad(config, db, datos.fecha, datos.personas, { ahora: ahora(), ignorarAntelacion: !comprobarCalendario });
      const hueco = huecos.find((h) => h.hora === datos.hora);
      if (!hueco || !hueco.disponible) {
        throw new ErrorCliente('Lo sentimos, esa hora ya no está disponible. Elige otra, por favor.', 409);
      }
      const reserva = { ...datos, inicio_min: inicio, codigo: codigoCorto(), token: crypto.randomBytes(24).toString('base64url'), origen };
      const { lastInsertRowid } = db.prepare(
        `INSERT INTO reservas (codigo, token, fecha, hora, inicio_min, personas, nombre, telefono, email, comentarios, origen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(reserva.codigo, reserva.token, reserva.fecha, reserva.hora, reserva.inicio_min, reserva.personas,
        reserva.nombre, reserva.telefono, reserva.email, reserva.comentarios, reserva.origen);
      return db.prepare('SELECT * FROM reservas WHERE id = ?').get(lastInsertRowid);
    });
  }

  // ---------- API pública ----------
  app.get('/api/config', (req, res) => {
    res.json({
      restaurante: config.restaurante,
      horario: config.horario,
      maxPersonasPorReserva: config.reservas.maxPersonasPorReserva,
      duracionMinutos: config.reservas.duracionMinutos,
      diasMaximosAntelacion: config.reservas.diasMaximosAntelacion,
      hoy: ahoraEn(config.zonaHoraria, ahora()).fecha,
    });
  });

  app.get('/api/disponibilidad', (req, res) => {
    const { fecha } = req.query;
    const personas = Number(req.query.personas || 1);
    if (!esFechaValida(fecha)) throw new ErrorCliente('La fecha no es válida.');
    if (!Number.isInteger(personas) || personas < 1 || personas > config.reservas.maxPersonasPorReserva) {
      throw new ErrorCliente('Número de personas no válido.');
    }
    const motivo = motivoDiaNoReservable(config, fecha, ahora());
    if (motivo) return res.json({ fecha, cerrado: true, motivo, horas: [] });
    res.json({ fecha, cerrado: false, horas: disponibilidad(config, db, fecha, personas, { ahora: ahora() }) });
  });

  app.post('/api/reservas', (req, res) => {
    if (req.body?.aceptaPrivacidad !== true) throw new ErrorCliente('Debes aceptar la política de privacidad.');
    if (texto(req.body?.web)) throw new ErrorCliente('Solicitud no válida.'); // campo trampa anti-bots
    const reserva = crearReserva(validarDatosCliente(req.body, config), { origen: 'web', comprobarCalendario: true });
    correo.confirmacionCliente(reserva);
    correo.avisoRestaurante(reserva, 'nueva');
    res.status(201).json(vistaPublica(reserva));
  });

  const buscarPorToken = (token) => {
    const r = typeof token === 'string' && token.length > 20 ? db.prepare('SELECT * FROM reservas WHERE token = ?').get(token) : null;
    if (!r) throw new ErrorCliente('No encontramos esa reserva. Revisa el enlace del email.', 404);
    return r;
  };

  app.get('/api/reservas/cancelar/:token', (req, res) => res.json(vistaPublica(buscarPorToken(req.params.token))));

  app.post('/api/reservas/cancelar/:token', (req, res) => {
    const r = buscarPorToken(req.params.token);
    if (r.estado === 'cancelada') return res.json(vistaPublica(r));
    if (r.estado !== 'confirmada') throw new ErrorCliente('Esta reserva ya no se puede cancelar.', 409);
    const { fecha: hoy, minutos } = ahoraEn(config.zonaHoraria, ahora());
    if (r.fecha < hoy || (r.fecha === hoy && r.inicio_min <= minutos)) throw new ErrorCliente('Esta reserva ya ha pasado.', 409);
    db.prepare(`UPDATE reservas SET estado = 'cancelada', actualizada_en = datetime('now') WHERE id = ?`).run(r.id);
    const actualizada = { ...r, estado: 'cancelada' };
    correo.cancelacionCliente(actualizada);
    correo.avisoRestaurante(actualizada, 'cancelada');
    res.json(vistaPublica(actualizada));
  });

  // ---------- Panel del restaurante ----------
  const sesiones = new Map(); // token -> caduca (ms)
  const intentos = new Map(); // ip -> { n, desde }

  app.post('/api/admin/login', (req, res) => {
    if (!config.adminPassword) throw new ErrorCliente('El panel no está activado: falta ADMIN_PASSWORD en la configuración.', 503);
    const ip = req.ip;
    const i = intentos.get(ip) || { n: 0, desde: Date.now() };
    if (Date.now() - i.desde > 15 * 60 * 1000) { i.n = 0; i.desde = Date.now(); }
    if (i.n >= 10) throw new ErrorCliente('Demasiados intentos. Espera unos minutos.', 429);
    if (!igualSeguro(req.body?.password || '', config.adminPassword)) {
      i.n += 1; intentos.set(ip, i);
      throw new ErrorCliente('Contraseña incorrecta.', 401);
    }
    intentos.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    sesiones.set(token, Date.now() + DURACION_SESION_MS);
    const segura = config.urlBase.startsWith('https://') ? '; Secure' : '';
    res.set('Set-Cookie', `sesion=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${DURACION_SESION_MS / 1000}${segura}`);
    res.json({ ok: true });
  });

  const requiereAdmin = (req, res, next) => {
    const token = parsearCookies(req.headers.cookie).sesion;
    const caduca = token && sesiones.get(token);
    if (!caduca || caduca < Date.now()) {
      if (token) sesiones.delete(token);
      throw new ErrorCliente('Sesión no iniciada.', 401);
    }
    req.sesion = token;
    next();
  };

  app.get('/api/admin/sesion', requiereAdmin, (req, res) => res.json({ ok: true }));

  app.post('/api/admin/logout', requiereAdmin, (req, res) => {
    sesiones.delete(req.sesion);
    res.set('Set-Cookie', 'sesion=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0');
    res.json({ ok: true });
  });

  app.get('/api/admin/reservas', requiereAdmin, (req, res) => {
    const { fecha, estado } = req.query;
    const q = texto(req.query.q);
    if (!esFechaValida(fecha)) throw new ErrorCliente('La fecha no es válida.');
    const filtros = ['fecha = ?'];
    const params = [fecha];
    if (estado && ESTADOS.includes(estado)) { filtros.push('estado = ?'); params.push(estado); }
    if (q) {
      filtros.push('(nombre LIKE ? OR telefono LIKE ? OR email LIKE ? OR codigo LIKE ?)');
      params.push(...Array(4).fill(`%${q}%`));
    }
    const reservas = db.prepare(`SELECT id, codigo, fecha, hora, personas, nombre, telefono, email, comentarios, estado, origen, creada_en
      FROM reservas WHERE ${filtros.join(' AND ')} ORDER BY inicio_min, id`).all(...params);
    res.json({ reservas, ocupacion: ocupacionDelDia(config, db, fecha), mesas: config.reservas.mesas, aforoMaximo: config.reservas.aforoMaximo });
  });

  app.post('/api/admin/reservas', requiereAdmin, (req, res) => {
    const body = { ...req.body };
    if (!texto(body.email)) body.email = 'sin-email@reserva.local';
    const datos = validarDatosCliente(body, config);
    const reserva = crearReserva(datos, { origen: 'restaurante', comprobarCalendario: false });
    if (req.body?.enviarEmail && texto(req.body.email)) correo.confirmacionCliente(reserva);
    res.status(201).json(reserva);
  });

  app.patch('/api/admin/reservas/:id', requiereAdmin, (req, res) => {
    const { estado } = req.body || {};
    if (!ESTADOS.includes(estado)) throw new ErrorCliente('Estado no válido.');
    const actualizada = transaccion(db, () => {
      const r = db.prepare('SELECT * FROM reservas WHERE id = ?').get(Number(req.params.id));
      if (!r) throw new ErrorCliente('Reserva no encontrada.', 404);
      if (r.estado === 'cancelada' && estado !== 'cancelada'
        && !cabe(config, reservasActivas(db, r.fecha, r.id), r.inicio_min, r.personas)) {
        throw new ErrorCliente('No se puede reactivar: ya no hay sitio en esa franja.', 409);
      }
      db.prepare(`UPDATE reservas SET estado = ?, actualizada_en = datetime('now') WHERE id = ?`).run(estado, r.id);
      return { ...r, estado };
    });
    res.json(actualizada);
  });

  // ---------- Errores ----------
  app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ErrorCliente) return res.status(err.estado).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Datos mal formados.' });
    console.error(err);
    res.status(500).json({ error: 'Ha ocurrido un error inesperado. Inténtalo de nuevo.' });
  });

  return app;
}

module.exports = { crearApp };
