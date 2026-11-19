// Configuración del restaurante. Todo lo que el negocio puede querer cambiar está aquí.
// Los valores sensibles (contraseñas, SMTP) se leen de variables de entorno (.env).

const num = (v, def) => (v === undefined || v === '' ? def : Number(v));

const config = {
  restaurante: {
    nombre: process.env.RESTAURANTE_NOMBRE || 'Cuadrilla Sky',
    direccion: process.env.RESTAURANTE_DIRECCION || 'Paseo de la Castellana, 259, Madrid',
    email: process.env.RESTAURANTE_EMAIL || 'grupocuadrilla@gmail.com',
    telefono: process.env.RESTAURANTE_TELEFONO || '',
  },

  zonaHoraria: 'Europe/Madrid',

  horario: {
    apertura: '08:00',
    cierre: '24:00',
    // 0 = domingo, 1 = lunes, ... 6 = sábado
    diasCerrados: [1],
    intervaloMinutos: 30, // cada cuánto se puede empezar una reserva
  },

  reservas: {
    duracionMinutos: 90,
    maxPersonasPorReserva: 6,
    mesas: 16, // 16 mesas de 6 = 96 plazas
    personasPorMesa: 6,
    aforoMaximo: 100, // nunca más de 100 comensales a la vez
    antelacionMinimaMinutos: num(process.env.ANTELACION_MINIMA_MINUTOS, 60),
    diasMaximosAntelacion: num(process.env.DIAS_MAXIMOS_ANTELACION, 60),
  },

  puerto: num(process.env.PORT, 3000),
  urlBase: (process.env.URL_BASE || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000').replace(/\/$/, ''),
  rutaBaseDatos: process.env.RUTA_BASE_DATOS || 'data/reservas.db',
  adminPassword: process.env.ADMIN_PASSWORD || '',

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 465),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
};

module.exports = config;
