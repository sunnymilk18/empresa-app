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
    COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '7 days')::int AS active_last_7d,
    COUNT(*) FILTER (WHERE auth_api_pending_action IS NOT NULL)::int       AS pending_sync
  FROM local_users
`);

// Mismos 7 días calendario de Chile (incluido hoy) que el gráfico por día, para
// que los totales de uno y otro coincidan.
const loginsStmt = db.prepare(`
  SELECT
    COUNT(*) FILTER (WHERE result = 'success')::int AS success_last_7d,
    COUNT(*) FILTER (WHERE result = 'blocked')::int AS blocked_last_7d
  FROM login_history
  WHERE created_at >= (((NOW() AT TIME ZONE 'America/Santiago')::date - 6)::timestamp AT TIME ZONE 'America/Santiago')
`);

// Inicios de sesión por día de los últimos 7 días (día calendario de Chile,
// incluido hoy), con los días sin actividad en cero para el gráfico.
const dailyStmt = db.prepare(`
  SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
         COALESCE(s.ok, 0)::int AS ok,
         COALESCE(s.blocked, 0)::int AS blocked
  FROM generate_series(
    (NOW() AT TIME ZONE 'America/Santiago')::date - 6,
    (NOW() AT TIME ZONE 'America/Santiago')::date,
    INTERVAL '1 day'
  ) AS d(day)
  LEFT JOIN (
    SELECT (created_at AT TIME ZONE 'America/Santiago')::date AS day,
           COUNT(*) FILTER (WHERE result = 'success') AS ok,
           COUNT(*) FILTER (WHERE result = 'blocked') AS blocked
    FROM login_history
    WHERE created_at >= NOW() - INTERVAL '8 days'
    GROUP BY 1
  ) s ON s.day = d.day::date
  ORDER BY d.day
`);

async function getDashboardStats() {
  const [users, logins, daily] = await Promise.all([
    usersStmt.get(),
    loginsStmt.get(),
    dailyStmt.all(),
  ]);
  const { superadmin, admin, user, ...userTotals } = users;
  return {
    users: { ...userTotals, byRole: { superadmin, admin, user } },
    logins,
    daily,
  };
}

module.exports = { getDashboardStats };
