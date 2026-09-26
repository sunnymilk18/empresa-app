const db = require('../db');
const config = require('../config');

// Limpieza automática de registros antiguos del historial de inicios de
// sesión y del registro de actividad, según los días configurados
// (LOGIN_HISTORY_RETENTION_DAYS, AUDIT_LOG_RETENTION_DAYS; 0 = no borrar).
// Corre al arrancar y luego cada 24 h.

const RETENTION_LOCK = 4242003; // distinto a los demás candados
const BATCH_SIZE = 1000;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

// Borra de a BATCH_SIZE filas por vez (cada tanda es su propia operación),
// para no mantener bloqueada la tabla mucho rato si hay muchas filas viejas.
async function deleteOlderThan(client, table, days) {
  if (!days) return 0;
  let total = 0;
  for (;;) {
    const res = await client.query(
      `DELETE FROM ${table}
       WHERE id IN (
         SELECT id FROM ${table}
         WHERE created_at < NOW() - make_interval(days => $1)
         LIMIT ${BATCH_SIZE}
       )`,
      [days]
    );
    total += res.rowCount;
    if (res.rowCount < BATCH_SIZE) return total;
  }
}

// Una pasada de limpieza. Si otra copia del backend ya está limpiando, esta
// no hace nada (pg_try_advisory_lock no espera: devuelve false al instante).
// Devuelve { skipped } o { loginHistory, auditLog } con lo borrado.
async function runRetention() {
  const client = await db.connect();
  let locked = false;
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [RETENTION_LOCK]);
    locked = rows[0].ok;
    if (!locked) return { skipped: true };

    const loginHistory = await deleteOlderThan(client, 'login_history', config.loginHistoryRetentionDays);
    const auditLog = await deleteOlderThan(client, 'audit_log', config.auditLogRetentionDays);
    return { loginHistory, auditLog };
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [RETENTION_LOCK]).catch(() => {});
    client.release();
  }
}

// Corre una pasada y deja el resultado en el log. Un error no detiene la
// app: se anota y se reintenta en la siguiente pasada.
async function runAndLog() {
  try {
    const result = await runRetention();
    if (result.skipped) return;
    // eslint-disable-next-line no-console
    console.log(
      `Limpieza de registros antiguos: ${result.loginHistory} inicios de sesión y ${result.auditLog} registros de actividad borrados`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Falló la limpieza de registros antiguos:', err.message);
  }
}

// Programa la limpieza: una vez ahora y luego cada 24 h. unref() para que el
// temporizador no mantenga vivo el proceso si el resto se apaga.
function scheduleRetention() {
  runAndLog();
  setInterval(runAndLog, INTERVAL_MS).unref();
}

module.exports = { runRetention, scheduleRetention };
