const db = require('../db');

const insertStmt = db.prepare(
  'INSERT INTO local_users (auth_user_id, email, role) VALUES ($1, $2, $3)'
);
const findStmt = db.prepare('SELECT * FROM local_users WHERE auth_user_id = $1');
const countStmt = db.prepare('SELECT COUNT(*) AS n FROM local_users');
const updateRoleStmt = db.prepare('UPDATE local_users SET role = $1 WHERE auth_user_id = $2');
const listStmt = db.prepare('SELECT * FROM local_users ORDER BY created_at ASC');

async function getOrCreateLocalUser(authUserId, email) {
  const existing = await findStmt.get(authUserId);
  if (existing) return existing;

  const count = await countStmt.get();
  const isFirstEver = Number(count?.n || 0) === 0;
  const role = isFirstEver ? 'admin' : 'user';
  await insertStmt.run(authUserId, email, role);
  return findStmt.get(authUserId);
}

async function setRole(authUserId, role) {
  await updateRoleStmt.run(role, authUserId);
  return findStmt.get(authUserId);
}

async function listLocalUsers() {
  return listStmt.all();
}

module.exports = { getOrCreateLocalUser, setRole, listLocalUsers };
