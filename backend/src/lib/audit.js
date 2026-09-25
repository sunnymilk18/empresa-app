const db = require('../db');

// Acciones registradas (el frontend las traduce a texto legible):
//  - de un superadmin sobre otra cuenta: role_changed, user_blocked, user_unblocked
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

const listStmt = db.prepare(`
  SELECT * FROM audit_log
  WHERE ($1::int IS NULL OR id < $1)
  ORDER BY id DESC
  LIMIT $2
`);

// Más recientes primero. `before` (id) permite pedir la página siguiente.
async function listAuditLog({ before = null, limit = 50 } = {}) {
  return listStmt.all(before, limit);
}

module.exports = { logAction, listAuditLog };
