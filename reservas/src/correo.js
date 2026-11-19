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

  // Marca: "Cuadrilla Sky" → "cuadrilla" + "SKY"
  const palabras = restaurante.nombre.trim().split(/\s+/);
  const marcaSec = palabras.length > 1 ? palabras.pop() : '';
  const marcaHtml = `<div style="font-size:30px;letter-spacing:.5px;text-transform:lowercase">${esc(palabras.join(' '))}</div>`
    + (marcaSec ? `<div style="font-size:11px;letter-spacing:6px;text-transform:uppercase;color:#bfd8ea;margin-top:4px">${esc(marcaSec)}</div>` : '');

  const plantilla = (titulo, parrafos, lineas, boton) => `
<div style="background:#f3f6f3;padding:24px 12px;font-family:Questrial,'Helvetica Neue',Arial,sans-serif;color:#14261c">
 <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dce4df">
  <div style="background:#15294a;color:#f3f6f3;text-align:center;padding:28px 16px">${marcaHtml}</div>
  <div style="padding:24px 28px">
   <h2 style="font-weight:400;font-size:22px;margin:0 0 12px">${esc(titulo)}</h2>
   ${parrafos.map((p) => `<p style="margin:0 0 12px;line-height:1.5">${esc(p)}</p>`).join('')}
   <table style="border-collapse:collapse;margin:16px 0;width:100%">${lineas.map((l) => {
    const [k, ...v] = l.split(': ');
    return `<tr><td style="padding:6px 12px 6px 0;color:#56605e;font-size:11px;letter-spacing:2px;text-transform:uppercase;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0">${esc(v.join(': '))}</td></tr>`;
  }).join('')}</table>
   ${boton ? `<p style="text-align:center;margin:24px 0 8px"><a href="${esc(boton.url)}" style="display:inline-block;background:#5e7872;color:#ffffff;padding:12px 26px;border-radius:999px;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase">${esc(boton.texto)}</a></p>` : ''}
  </div>
  <div style="border-top:1px solid #dce4df;color:#56605e;font-size:11px;letter-spacing:2px;text-transform:uppercase;text-align:center;padding:14px">${esc(restaurante.nombre)} · ${esc(restaurante.direccion)}</div>
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
