# Cuadrilla Sky · Reservas online

Web de reservas para el restaurante **Cuadrilla Sky** (Paseo de la Castellana, 259, Madrid).

- **Clientes** (`/`): eligen día, personas y hora libre, dejan sus datos y reciben un email de confirmación con enlace para cancelar.
- **Restaurante** (`/admin.html`, con contraseña): ve las reservas del día, la ocupación por franja, cambia estados (confirmada, completada, no presentado, cancelada) y apunta reservas telefónicas.

## Reglas del negocio

| Regla | Valor |
|---|---|
| Horario | 08:00–24:00, **cerrado los lunes** |
| Horas de reserva | cada 30 min, de 08:00 a 22:30 (la última acaba a las 24:00) |
| Duración de cada reserva | 90 minutos |
| Mesas | 16 mesas de 6 (96 plazas); cada reserva ocupa una mesa |
| Aforo máximo | 100 comensales a la vez |
| Máximo por reserva online | 6 personas |
| Antelación | mínimo 60 min, máximo 60 días |

Todo se cambia en [`src/config.js`](src/config.js).

## Ponerla en marcha en tu ordenador

Necesitas [Node.js](https://nodejs.org) 22.13 o superior.

```bash
cd reservas
npm install
cp .env.example .env     # y rellena ADMIN_PASSWORD (y SMTP_PASS si quieres enviar emails)
npm start
```

Abre <http://localhost:3000> (clientes) y <http://localhost:3000/admin.html> (restaurante).
Sin SMTP configurado, los emails se muestran en la consola en lugar de enviarse.

## Emails con Gmail

1. En la cuenta `grupocuadrilla@gmail.com`, activa la **verificación en 2 pasos**.
2. Crea una **contraseña de aplicación** en <https://myaccount.google.com/apppasswords>.
3. Ponla en `SMTP_PASS` del `.env` (nunca en el código ni en GitHub).

Gmail permite unos 500 envíos al día, de sobra para empezar.

## Publicarla en internet

Esta app necesita un servidor Node.js con disco persistente (la base de datos es un archivo SQLite);
**GitHub Pages no sirve**, porque solo publica páginas estáticas. Opciones sencillas:
Render, Railway o Fly.io (con un volumen montado para `RUTA_BASE_DATOS`), o cualquier VPS.
Configura las mismas variables del `.env` en el proveedor y pon `URL_BASE` con la dirección https definitiva.

## Tests

```bash
npm test
```

Cubren horario, días cerrados, antelación, validaciones, control de aforo (mesas y comensales),
cancelación por enlace, acceso al panel y cambios de estado.

## Estructura

```
src/config.js          ← datos del restaurante y reglas
src/app.js             ← API (pública y del panel)
src/disponibilidad.js  ← cálculo de huecos y aforo
src/correo.js          ← emails de confirmación y cancelación
src/db.js              ← base de datos SQLite
public/                ← web de clientes, cancelación, privacidad y panel
test/                  ← pruebas automáticas
```

## Pendiente antes de abrir al público

- Completar la [política de privacidad](public/privacidad.html) con la razón social y el NIF del titular.
- Añadir el teléfono del restaurante (`RESTAURANTE_TELEFONO`) si queréis que aparezca.
