const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ESTADOS = ['confirmada', 'cancelada', 'completada', 'no_presentado'];

function abrirBaseDatos(ruta) {
  if (ruta !== ':memory:') fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS reservas (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo       TEXT NOT NULL UNIQUE,
      token        TEXT NOT NULL UNIQUE,
      fecha        TEXT NOT NULL,
      hora         TEXT NOT NULL,
      inicio_min   INTEGER NOT NULL,
      personas     INTEGER NOT NULL,
      nombre       TEXT NOT NULL,
      telefono     TEXT NOT NULL,
      email        TEXT NOT NULL,
      comentarios  TEXT NOT NULL DEFAULT '',
      estado       TEXT NOT NULL DEFAULT 'confirmada',
      origen       TEXT NOT NULL DEFAULT 'web',
      creada_en    TEXT NOT NULL DEFAULT (datetime('now')),
      actualizada_en TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reservas_fecha ON reservas (fecha, estado);
  `);
  return db;
}

// Ejecuta fn dentro de una transacción con bloqueo de escritura, para que la
// comprobación de aforo y la inserción sean atómicas.
function transaccion(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { abrirBaseDatos, transaccion, ESTADOS };
