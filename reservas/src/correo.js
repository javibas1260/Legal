// Envío de emails. Si no hay SMTP configurado, los emails se muestran por consola
// (útil para probar en local sin enviar nada).

const nodemailer = require('nodemailer');
const { fechaLarga } = require('./tiempo');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function crearCorreo(config, { transporte } = {}) {
  const { smtp, restaurante } = config;
  const smtpConfigurado = Boolean(smtp.host && smtp.user && smtp.pass);
  const transport = transporte || (smtpConfigurado
    ? nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.pass } })
    : null);
  const remitente = `"${restaurante.nombre}" <${smtp.user || restaurante.email}>`;

  async function enviar(mensaje) {
    if (!transport) {
      console.log(`\n📧 [email no enviado: SMTP sin configurar]\nPara: ${mensaje.to}\nAsunto: ${mensaje.subject}\n${mensaje.text}\n`);
      return;
    }
    await transport.sendMail({ from: remitente, ...mensaje });
  }

  // Los fallos de email no deben romper la reserva: se registran y ya.
  const enviarSinFallar = (mensaje) => enviar(mensaje).catch((e) => console.error('Error enviando email:', e.message));

  const detalle = (r) => [
    `Fecha: ${fechaLarga(r.fecha)}`,
    `Hora: ${r.hora}`,
    `Personas: ${r.personas}`,
    `Nombre: ${r.nombre}`,
    `Código: ${r.codigo}`,
  ];

  const plantilla = (titulo, parrafos, lineas, boton) => `
<div style="background:#f7f3ee;padding:24px 12px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2430">
 <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3ddd4">
  <div style="background:#2c3550;background-image:linear-gradient(160deg,#1b2233 0%,#2c3550 55%,#8a5a33 140%);color:#f7f3ee;text-align:center;padding:26px 16px;font-size:26px;font-weight:700;letter-spacing:.5px">${esc(restaurante.nombre)}</div>
  <div style="padding:24px 28px">
   <h2 style="font-size:22px;margin:0 0 12px;color:#7a4b2a">${esc(titulo)}</h2>
   ${parrafos.map((p) => `<p style="margin:0 0 12px;line-height:1.5">${esc(p)}</p>`).join('')}
   <table style="border-collapse:collapse;margin:16px 0;width:100%">${lineas.map((l) => {
    const [k, ...v] = l.split(': ');
    return `<tr><td style="padding:6px 12px 6px 0;color:#6b6f7a;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0"><strong>${esc(v.join(': '))}</strong></td></tr>`;
  }).join('')}</table>
   ${boton ? `<p style="text-align:center;margin:24px 0 8px"><a href="${esc(boton.url)}" style="display:inline-block;background:#8a5a33;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">${esc(boton.texto)}</a></p>` : ''}
  </div>
  <div style="border-top:1px solid #e3ddd4;color:#888;font-size:13px;text-align:center;padding:14px">${esc(restaurante.nombre)} · ${esc(restaurante.direccion)}</div>
 </div>
</div>`;

  return {
    smtpConfigurado,

    confirmacionCliente(r) {
      const urlCancelar = `${config.urlBase}/cancelar.html?t=${r.token}`;
      const lineas = detalle(r);
      return enviarSinFallar({
        to: r.email,
        subject: `Reserva confirmada en ${restaurante.nombre} · ${r.fecha} ${r.hora}`,
        text: [`¡Hola, ${r.nombre}!`, '', `Tu reserva en ${restaurante.nombre} está confirmada.`, '', ...lineas,
          `Dirección: ${restaurante.direccion}`, '', `Si no puedes venir, cancela aquí: ${urlCancelar}`].join('\n'),
        html: plantilla(`¡Reserva confirmada!`, [`Hola, ${r.nombre}. Te esperamos en ${restaurante.nombre}.`],
          [...lineas, `Dirección: ${restaurante.direccion}`], { url: urlCancelar, texto: 'Cancelar reserva' }),
      });
    },

    avisoRestaurante(r, accion) {
      const lineas = [...detalle(r), `Teléfono: ${r.telefono}`, `Email: ${r.email}`, `Comentarios: ${r.comentarios || '—'}`];
      return enviarSinFallar({
        to: restaurante.email,
        subject: `${accion === 'cancelada' ? '❌ Reserva cancelada' : '🆕 Nueva reserva'}: ${r.fecha} ${r.hora} · ${r.personas} pax · ${r.nombre}`,
        text: lineas.join('\n'),
        html: plantilla(accion === 'cancelada' ? 'Reserva cancelada' : 'Nueva reserva', [], lineas),
      });
    },

    cancelacionCliente(r) {
      const lineas = detalle(r);
      return enviarSinFallar({
        to: r.email,
        subject: `Reserva cancelada en ${restaurante.nombre} · ${r.fecha} ${r.hora}`,
        text: [`Hola, ${r.nombre}.`, '', 'Tu reserva ha sido cancelada.', '', ...lineas, '', `Esperamos verte pronto: ${config.urlBase}`].join('\n'),
        html: plantilla('Reserva cancelada', [`Hola, ${r.nombre}. Tu reserva ha sido cancelada. ¡Esperamos verte pronto!`], lineas,
          { url: config.urlBase, texto: 'Hacer otra reserva' }),
      });
    },
  };
}

module.exports = { crearCorreo };
