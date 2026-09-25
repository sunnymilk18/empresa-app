const db = require('../db');

const insertStmt = db.prepare(`
  INSERT INTO login_history (auth_user_id, email, result, method, ip, user_agent)
  VALUES ($1, $2, $3, $4, $5, $6)
`);

const listStmt = db.prepare(`
  SELECT * FROM login_history
  WHERE auth_user_id = $1 AND ($2::int IS NULL OR id < $2)
  ORDER BY id DESC
  LIMIT $3
`);

async function recordLoginEvent({ authUserId, email, result, method, ip, userAgent }) {
  await insertStmt.run(authUserId, email, result, method, ip ?? null, userAgent ?? null);
}

// Más recientes primero. `before` (id) permite pedir la página siguiente.
async function listLoginHistory(authUserId, { before = null, limit = 50 } = {}) {
  return listStmt.all(authUserId, before, limit);
}

module.exports = { recordLoginEvent, listLoginHistory };
