const db = require('../db');

// Acciones registradas (el frontend las traduce a texto legible):
//  - de un superadmin sobre otra cuenta: role_changed, user_blocked,
//    user_unblocked (details.auth_api: cómo terminó en la auth-api),
//    auth_api_synced (reintento exitoso de un ban/unban pendiente),
//    sessions_revoked, totp_disabled_by_admin
//  - de una persona sobre su propia cuenta: totp_enabled, totp_disabled
// Inserta una fila de auditoría usando la conexión de la transacción en curso,
// para que la acción y su registro se guarden juntos o no se guarde ninguno.
async function logAction(query, actor, action, target, details = {}) {
  await query(
    `INSERT INTO audit_log
       (actor_auth_user_id, actor_email, action, target_auth_user_id, target_email, details, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actor.id, actor.email, action, target?.auth_user_id ?? null, target?.email ?? null, details, actor.ip ?? null]
  );
}

// Acciones válidas para el filtro `action` (ver routes/me.js). Única fuente
// de verdad: el frontend arma su desplegable a partir de esta misma lista
// (GET /api/audit-log no la expone; el frontend la trae de un objeto propio
// con las mismas claves, ver ActividadPage.jsx).
const AUDIT_ACTIONS = [
  'role_changed',
  'user_blocked',
  'user_unblocked',
  'auth_api_synced',
  'sessions_revoked',
  'totp_disabled_by_admin',
  'totp_enabled',
  'totp_disabled',
];

// Escapa % _ y \ para que el texto buscado se tome literal en ILIKE (mismo
// criterio que localUsers.js).
function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`;
}

// Más recientes primero. `before` (id) permite pedir la página siguiente.
// Filtros opcionales, todos ya validados por quien llama (routes/me.js):
//   - actor: búsqueda parcial por email de quien hizo la acción, o por la IP
//     desde donde la hizo si el texto tiene forma de IP (mismo criterio que
//     la búsqueda de Usuarios: IPv4 como "190.22" o IPv6 como "2800:150::1")
//   - target: búsqueda parcial por email de quien recibió la acción
//   - action: una de AUDIT_ACTIONS
//   - from / to: rango de fechas 'YYYY-MM-DD', ambos límites incluidos
async function listAuditLog({ before = null, limit = 50, actor, target, action, from, to } = {}) {
  const where = [];
  const params = [];
  const param = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (before != null) where.push(`id < ${param(before)}`);
  if (actor) {
    const text = param(likePattern(actor));
    // "quién hizo la acción" busca por su email, o por la IP desde donde la
    // hizo si el texto parece una IP (no un email, así que no hace falta OR).
    const looksLikeIp = /^[0-9a-fA-F.:]+$/.test(actor) && /[.:]/.test(actor);
    where.push(looksLikeIp ? `ip ILIKE ${text}` : `actor_email ILIKE ${text}`);
  }
  if (target) where.push(`target_email ILIKE ${param(likePattern(target))}`);
  if (action) where.push(`action = ${param(action)}`);
  if (from) where.push(`created_at >= ${param(from)}::date`);
  // < (to + 1 día) en vez de <= to, para incluir todas las horas del día "hasta".
  if (to) where.push(`created_at < (${param(to)}::date + INTERVAL '1 day')`);

  const sql = `
    SELECT * FROM audit_log
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT ${param(limit)}
  `;
  return db.prepare(sql).all(...params);
}

module.exports = { logAction, listAuditLog, AUDIT_ACTIONS };
