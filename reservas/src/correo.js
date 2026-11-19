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
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;color:#1f2430">
  <h2 style="color:#7a4b2a">${esc(titulo)}</h2>
  ${parrafos.map((p) => `<p>${esc(p)}</p>`).join('')}
  <table style="border-collapse:collapse;margin:16px 0">${lineas.map((l) => {
    const [k, ...v] = l.split(': ');
    return `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0"><strong>${esc(v.join(': '))}</strong></td></tr>`;
  }).join('')}</table>
  ${boton ? `<p><a href="${esc(boton.url)}" style="display:inline-block;background:#7a4b2a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${esc(boton.texto)}</a></p>` : ''}
  <p style="color:#888;font-size:13px;margin-top:24px">${esc(restaurante.nombre)} · ${esc(restaurante.direccion)}</p>
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
