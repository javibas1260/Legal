// Punto de entrada: carga .env (si existe), abre la base de datos y arranca el servidor.
try { process.loadEnvFile(); } catch { /* sin .env: se usan variables de entorno o valores por defecto */ }

const config = require('./config');
const { abrirBaseDatos } = require('./db');
const { crearCorreo } = require('./correo');
const { crearApp } = require('./app');

const db = abrirBaseDatos(config.rutaBaseDatos);
const correo = crearCorreo(config);
const app = crearApp({ config, db, correo });

app.listen(config.puerto, () => {
  console.log(`🍽️  ${config.restaurante.nombre} · reservas en ${config.urlBase}`);
  console.log(`   Panel del restaurante: ${config.urlBase}/admin.html`);
  if (!config.adminPassword) console.warn('⚠️  Falta ADMIN_PASSWORD: el panel del restaurante está desactivado.');
  if (!correo.smtpConfigurado) console.warn('⚠️  SMTP sin configurar: los emails se mostrarán aquí en vez de enviarse.');
});
