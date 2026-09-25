const db = require('../db');

// Resumen para el dashboard del superadmin. "Recientes" = últimos 7 días.
const usersStmt = db.prepare(`
  SELECT
    COUNT(*)::int                                                          AS total,
    COUNT(*) FILTER (WHERE role = 'superadmin')::int                       AS superadmin,
    COUNT(*) FILTER (WHERE role = 'admin')::int                            AS admin,
    COUNT(*) FILTER (WHERE role = 'user')::int                             AS "user",
    COUNT(*) FILTER (WHERE blocked_at IS NOT NULL)::int                    AS blocked,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int   AS new_last_7d,
    COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '7 days')::int AS active_last_7d
  FROM local_users
`);

const loginsStmt = db.prepare(`
  SELECT
    COUNT(*) FILTER (WHERE result = 'success')::int AS success_last_7d,
    COUNT(*) FILTER (WHERE result = 'blocked')::int AS blocked_last_7d
  FROM login_history
  WHERE created_at >= NOW() - INTERVAL '7 days'
`);

const recentLoginsStmt = db.prepare(`
  SELECT id, auth_user_id, email, result, method, ip, user_agent, created_at
  FROM login_history
  ORDER BY id DESC
  LIMIT 5
`);

async function getDashboardStats() {
  const [users, logins, recentLogins] = await Promise.all([
    usersStmt.get(),
    loginsStmt.get(),
    recentLoginsStmt.all(),
  ]);
  const { superadmin, admin, user, ...userTotals } = users;
  return {
    users: { ...userTotals, byRole: { superadmin, admin, user } },
    logins,
    recentLogins,
  };
}

module.exports = { getDashboardStats };
