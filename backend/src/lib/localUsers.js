const db = require('../db');
const { logAction } = require('./audit');

const ROLES = ['superadmin', 'admin', 'user'];

const findStmt = db.prepare('SELECT * FROM local_users WHERE auth_user_id = $1');
const recordLoginStmt = db.prepare(`
  UPDATE local_users
  -- COALESCE: si la auth-api no entregó el perfil, se conservan los datos previos
  SET email = $1, username = COALESCE($2, username), rut = COALESCE($3, rut),
      -- un intento de una cuenta bloqueada no cuenta como ingreso
      last_login_at = CASE WHEN blocked_at IS NULL THEN NOW() ELSE last_login_at END
  WHERE auth_user_id = $4
`);

// Llave del candado que serializa la creación de usuarios (cualquier número
// fijo sirve; solo tiene que ser el mismo en todas las llamadas).
const CREATE_USER_LOCK = 4242001;

// La primera cuenta de toda la demo queda como superadmin; el resto, user.
async function getOrCreateLocalUser(authUserId, email) {
  const existing = await findStmt.get(authUserId);
  if (existing) return existing;

  // El candado evita que dos cuentas nuevas que entran al mismo tiempo vean
  // la tabla vacía y queden las dos como superadmin. Se libera solo al
  // terminar la transacción.
  return db.transaction(async (query) => {
    await query('SELECT pg_advisory_xact_lock($1)', [CREATE_USER_LOCK]);
    const { rows } = await query(
      `INSERT INTO local_users (auth_user_id, email, role)
       SELECT $1, $2, CASE WHEN EXISTS (SELECT 1 FROM local_users) THEN 'user' ELSE 'superadmin' END
       ON CONFLICT (auth_user_id) DO NOTHING
       RETURNING *`,
      [authUserId, email]
    );
    return rows[0] ?? (await query('SELECT * FROM local_users WHERE auth_user_id = $1', [authUserId])).rows[0];
  });
}

// Se llama cada vez que alguien completa el login (OTP o TOTP): asegura que
// exista localmente y refresca los datos de perfil que vienen de la auth-api.
async function recordLogin(authUserId, { email, username, rut }) {
  await getOrCreateLocalUser(authUserId, email);
  await recordLoginStmt.run(email, username ?? null, rut ?? null, authUserId);
  return findStmt.get(authUserId);
}

// Error de una acción de administración que no se puede aplicar. `status` es
// el código HTTP que el handler de errores de server.js devuelve tal cual.
class AdminChangeError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AdminChangeError';
    this.status = status;
  }
}

// Candado que ordena, una detrás de otra, las acciones de administración
// (cambiar rol, bloquear). Distinto al de creación de usuarios.
const ADMIN_CHANGES_LOCK = 4242002;

function isActiveSuperadmin(user) {
  return user.role === 'superadmin' && !user.blocked_at;
}

// Primer paso de toda acción de administración: esperar su turno. Así dos
// superadmin no pueden degradarse o bloquearse mutuamente en el mismo
// instante. Va antes de leer cualquier fila, para que nunca queden dos
// acciones esperándose entre sí.
async function waitAdminTurn(query) {
  await query('SELECT pg_advisory_xact_lock($1)', [ADMIN_CHANGES_LOCK]);
}

// Ya con el turno tomado:
//  1. Verifica que quien actúa SIGA siendo superadmin activo (otro pudo
//     quitarle el rol o bloquearlo justo antes).
//  2. Si el cambio saca a `target` de los superadmin activos, verifica que
//     quede al menos otro: el sistema nunca se queda sin superadmin. Hoy el
//     paso 1 ya lo garantiza (quien actúa es otro superadmin activo y nadie
//     puede cambiarse a sí mismo); queda como resguardo por si en el futuro
//     algún cambio de rol se hace desde otro lugar.
async function checkAdminChange(query, actor, target, removesActiveSuperadmin) {
  const { rows: actorRows } = await query('SELECT * FROM local_users WHERE auth_user_id = $1', [actor.id]);
  if (!actorRows[0] || !isActiveSuperadmin(actorRows[0])) {
    throw new AdminChangeError('Ya no tienes permisos de superadmin para hacer este cambio', 403);
  }

  if (removesActiveSuperadmin) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM local_users
       WHERE role = 'superadmin' AND blocked_at IS NULL AND auth_user_id <> $1`,
      [target.auth_user_id]
    );
    if (rows[0].n === 0) {
      throw new AdminChangeError('Debe quedar al menos un superadmin activo en el sistema', 409);
    }
  }
}

// Cambios hechos por un superadmin (`actor` = { id, email, ip }). Cada uno
// se guarda junto con su registro de auditoría en una misma transacción. Si
// el cambio no altera nada, no se registra. Devuelve el usuario actualizado,
// o null si no existe. Lanza AdminChangeError si el cambio no se permite.
async function setRole(authUserId, role, actor) {
  return db.transaction(async (query) => {
    await waitAdminTurn(query);
    const { rows } = await query('SELECT * FROM local_users WHERE auth_user_id = $1 FOR UPDATE', [authUserId]);
    const user = rows[0];
    if (!user || user.role === role) return user ?? null;
    await checkAdminChange(query, actor, user, isActiveSuperadmin(user) && role !== 'superadmin');

    const updated = await query(
      'UPDATE local_users SET role = $1 WHERE auth_user_id = $2 RETURNING *',
      [role, authUserId]
    );
    await logAction(query, actor, 'role_changed', user, { from: user.role, to: role });
    return updated.rows[0];
  });
}

// Un usuario bloqueado no puede usar empresa-app aunque su login en la
// auth-api sea válido. Es reversible: desbloquear deja blocked_at en NULL.
async function setBlocked(authUserId, blocked, actor) {
  return db.transaction(async (query) => {
    await waitAdminTurn(query);
    const { rows } = await query('SELECT * FROM local_users WHERE auth_user_id = $1 FOR UPDATE', [authUserId]);
    const user = rows[0];
    if (!user || Boolean(user.blocked_at) === blocked) return user ?? null;
    await checkAdminChange(query, actor, user, isActiveSuperadmin(user) && blocked);

    const updated = await query(
      `UPDATE local_users SET blocked_at = ${blocked ? 'NOW()' : 'NULL'}
       WHERE auth_user_id = $1 RETURNING *`,
      [authUserId]
    );
    await logAction(query, actor, blocked ? 'user_blocked' : 'user_unblocked', user);
    return updated.rows[0];
  });
}

async function getLocalUser(authUserId) {
  return findStmt.get(authUserId);
}

// Escapa % _ y \ para que el texto buscado se tome literal en ILIKE.
function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`;
}

// Lista paginada con búsqueda y filtros, más recientes primero.
// - q: busca en email, username o rut (el rut con o sin puntos/guion)
// - role: 'superadmin' | 'admin' | 'user'
// - status: 'active' | 'blocked'
// Devuelve { users, total } (total = cuántos cumplen los filtros).
async function listLocalUsers({ q, role, status, limit = 20, offset = 0 } = {}) {
  const where = [];
  const params = [];
  const param = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (q) {
    const text = param(likePattern(q));
    const conditions = [`email ILIKE ${text}`, `username ILIKE ${text}`];
    // Solo si el texto parece un RUT (números, puntos, guion, K): así
    // "usuario1" no trae a todos los que tienen un 1 en el RUT.
    if (/^[\d.\-\skK]+$/.test(q)) {
      const rutDigits = q.replace(/[^0-9kK]/g, '');
      if (rutDigits) conditions.push(`rut ILIKE ${param(likePattern(rutDigits))}`);
    }
    where.push(`(${conditions.join(' OR ')})`);
  }
  if (role) where.push(`role = ${param(role)}`);
  if (status === 'active') where.push('blocked_at IS NULL');
  if (status === 'blocked') where.push('blocked_at IS NOT NULL');

  // COUNT(*) OVER() trae el total junto con la página, en una sola consulta.
  const sql = `
    SELECT *, COUNT(*) OVER() AS total_count
    FROM local_users
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC, id DESC
    LIMIT ${param(limit)} OFFSET ${param(offset)}
  `;
  const rows = await db.prepare(sql).all(...params);
  let total = rows.length ? Number(rows[0].total_count) : 0;

  // Página fuera de rango (p. ej. tras filtrar): igual informamos el total
  // para que el frontend pueda volver a una página válida.
  if (!rows.length && offset > 0) {
    const countSql = `SELECT COUNT(*) AS n FROM local_users ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
    const count = await db.prepare(countSql).get(...params.slice(0, -2));
    total = Number(count.n);
  }
  return { users: rows.map(({ total_count, ...user }) => user), total };
}

module.exports = {
  ROLES,
  AdminChangeError,
  getOrCreateLocalUser,
  getLocalUser,
  recordLogin,
  setRole,
  setBlocked,
  listLocalUsers,
};
