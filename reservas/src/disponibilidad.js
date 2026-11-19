// Cálculo de huecos y aforo.
// Modelo: cada reserva ocupa UNA mesa durante `duracionMinutos`. En cualquier momento
// no puede haber más reservas activas que mesas, ni más comensales que el aforo máximo.

const { aMinutos, aHora, diaSemana, sumarDias, ahoraEn } = require('./tiempo');

// Horas de inicio posibles de un día (la última reserva termina justo al cierre).
function horasDelDia(config) {
  const { apertura, cierre, intervaloMinutos } = config.horario;
  const ultima = aMinutos(cierre) - config.reservas.duracionMinutos;
  const horas = [];
  for (let m = aMinutos(apertura); m <= ultima; m += intervaloMinutos) horas.push(m);
  return horas;
}

// Motivo por el que no se puede reservar ese día (o null si se puede).
function motivoDiaNoReservable(config, fecha, ahora = new Date()) {
  const hoy = ahoraEn(config.zonaHoraria, ahora).fecha;
  if (fecha < hoy) return 'La fecha ya ha pasado.';
  if (fecha > sumarDias(hoy, config.reservas.diasMaximosAntelacion)) {
    return `Solo se puede reservar con ${config.reservas.diasMaximosAntelacion} días de antelación como máximo.`;
  }
  if (config.horario.diasCerrados.includes(diaSemana(fecha))) return 'Ese día el restaurante está cerrado.';
  return null;
}

// Reservas que cuentan para el aforo en un día.
function reservasActivas(db, fecha, excluirId = null) {
  return db.prepare(
    `SELECT id, inicio_min, personas FROM reservas
     WHERE fecha = ? AND estado != 'cancelada' AND id != ?`,
  ).all(fecha, excluirId ?? -1);
}

// Ocupación (mesas y personas) en el instante t (minutos desde medianoche).
function ocupacionEn(reservas, t, duracion) {
  let mesas = 0;
  let personas = 0;
  for (const r of reservas) {
    if (r.inicio_min <= t && t < r.inicio_min + duracion) {
      mesas += 1;
      personas += r.personas;
    }
  }
  return { mesas, personas };
}

// ¿Cabe una reserva de `personas` que empieza en `inicio`?
function cabe(config, reservas, inicio, personas) {
  const { duracionMinutos, mesas, aforoMaximo } = config.reservas;
  // Basta con mirar los instantes en que empieza alguna reserva dentro del intervalo,
  // porque la ocupación solo cambia en esos puntos.
  const puntos = new Set([inicio]);
  for (const r of reservas) {
    if (r.inicio_min > inicio && r.inicio_min < inicio + duracionMinutos) puntos.add(r.inicio_min);
  }
  for (const t of puntos) {
    const o = ocupacionEn(reservas, t, duracionMinutos);
    if (o.mesas + 1 > mesas || o.personas + personas > aforoMaximo) return false;
  }
  return true;
}

// Lista de horas del día con su disponibilidad para un grupo de `personas`.
function disponibilidad(config, db, fecha, personas, { ahora = new Date(), ignorarAntelacion = false } = {}) {
  const reservas = reservasActivas(db, fecha);
  const { fecha: hoy, minutos } = ahoraEn(config.zonaHoraria, ahora);
  const limite = fecha === hoy && !ignorarAntelacion ? minutos + config.reservas.antelacionMinimaMinutos : -1;
  return horasDelDia(config).map((m) => ({
    hora: aHora(m),
    disponible: m >= limite && cabe(config, reservas, m, personas),
  }));
}

// Resumen de ocupación por franja (para el panel del restaurante).
function ocupacionDelDia(config, db, fecha) {
  const reservas = reservasActivas(db, fecha);
  return horasDelDia(config).map((m) => ({ hora: aHora(m), ...ocupacionEn(reservas, m, config.reservas.duracionMinutos) }));
}

module.exports = { horasDelDia, motivoDiaNoReservable, reservasActivas, cabe, disponibilidad, ocupacionDelDia };
