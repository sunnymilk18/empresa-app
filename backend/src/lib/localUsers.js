const db = require('../db');
const { logAction } = require('./audit');
const { systemAdminAction } = require('./authApi');

const ROLES = ['superadmin', 'admin', 'user'];

const findStmt = db.prepare('SELECT * FROM local_users WHERE auth_user_id = $1');
const recordLoginStmt = db.prepare(`
  UPDATE local_users
  -- COALESCE: si la auth-api no entregó el perfil, se conservan los datos previos
  SET email = $1, username = COALESCE($2, username), rut = COALESCE($3, rut),
      -- un intento de una cuenta bloqueada no cuenta como ingreso (ni su IP)
      last_login_at = CASE WHEN blocked_at IS NULL THEN NOW() ELSE last_login_at END,
      last_login_ip = CASE WHEN blocked_at IS NULL THEN $5 ELSE last_login_ip END
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
// exista localmente y refresca los datos de perfil que vienen de la auth-api,
// la hora y la IP del ingreso.
async function recordLogin(authUserId, { email, username, rut, ip }) {
  await getOrCreateLocalUser(authUserId, email);
  await recordLoginStmt.run(email, username ?? null, rut ?? null, authUserId, ip ?? null);
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
async function setRole(authUserId, role, actor, reason) {
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
    await logAction(query, actor, 'role_changed', user, { from: user.role, to: role, reason });
    return updated.rows[0];
  });
}

// Bloquea o desbloquea en los dos lados:
//  1. Localmente: un usuario bloqueado no puede usar empresa-app aunque su
//     login en la auth-api sea válido. Siempre se aplica.
//  2. En la auth-api (si hay credencial): ban/unban de la cuenta, que además
//     cierra sus sesiones al banear. Si falla (caída o credencial inválida),
//     queda anotado en auth_api_pending_action para reintentar.
// Repetir la misma acción con algo pendiente reintenta solo la parte de la
// auth-api (y registra "auth_api_synced" si ahora funciona).
// La llamada a la auth-api se hace dentro del turno, para que el resultado
// quede en el mismo registro de actividad; solo son acciones del superadmin.
// Devuelve { user, authApi } (authApi: ver authApi.systemAdminAction, o null
// si no había nada que hacer) o null si el usuario no existe. `reason` solo
// se guarda cuando el estado realmente cambia (bloqueo/desbloqueo real); un
// reintento de lo pendiente en la auth-api no es una decisión nueva, así que
// no lo necesita (ver routes/me.js).
async function setBlocked(authUserId, blocked, actor, reason) {
  return db.transaction(async (query) => {
    await waitAdminTurn(query);
    const { rows } = await query('SELECT * FROM local_users WHERE auth_user_id = $1 FOR UPDATE', [authUserId]);
    const user = rows[0];
    if (!user) return null;

    const action = blocked ? 'ban' : 'unban';
    const changed = Boolean(user.blocked_at) !== blocked;
    if (!changed && user.auth_api_pending_action !== action) return { user, authApi: null };
    await checkAdminChange(query, actor, user, changed && isActiveSuperadmin(user) && blocked);

    const authApi = await systemAdminAction(authUserId, action);
    const pending = authApi === 'unavailable' || authApi === 'unauthorized' ? action : null;
    const updated = await query(
      `UPDATE local_users
       SET blocked_at = ${blocked ? 'COALESCE(blocked_at, NOW())' : 'NULL'},
           auth_api_pending_action = $2
       WHERE auth_user_id = $1 RETURNING *`,
      [authUserId, pending]
    );
    if (changed) {
      await logAction(query, actor, blocked ? 'user_blocked' : 'user_unblocked', user, { auth_api: authApi, reason });
    } else if (authApi === 'ok' || authApi === 'not_found') {
      await logAction(query, actor, 'auth_api_synced', user, { action, auth_api: authApi });
    }
    return { user: updated.rows[0], authApi };
  });
}

// Acciones solo de la auth-api sobre la cuenta de otra persona:
// 'revoke-sessions' (cerrar todas sus sesiones) o 'disable-totp' (desactivar
// su app autenticadora, p. ej. si perdió el celular). No cambian nada local;
// se registran en la actividad solo si la auth-api las aplicó.
// Devuelve { user, authApi } o null si el usuario no existe.
const IDENTITY_ACTION_AUDIT = {
  'revoke-sessions': 'sessions_revoked',
  'disable-totp': 'totp_disabled_by_admin',
  'reset-pin': 'pin_reset',
};
async function runIdentityAction(authUserId, action, actor) {
  return db.transaction(async (query) => {
    await waitAdminTurn(query);
    const { rows } = await query('SELECT * FROM local_users WHERE auth_user_id = $1', [authUserId]);
    const user = rows[0];
    if (!user) return null;
    await checkAdminChange(query, actor, user, false);

    const authApi = await systemAdminAction(authUserId, action);
    if (authApi === 'ok') await logAction(query, actor, IDENTITY_ACTION_AUDIT[action], user);
    return { user, authApi };
  });
}

async function getLocalUser(authUserId) {
  return findStmt.get(authUserId);
}

// Escapa % _ y \ para que el texto buscado se tome literal en ILIKE.
function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`;
}

// Lista paginada con búsqueda y filtros, más recientes primero. Cada usuario
// trae `last_login_ip` (IP de su último ingreso exitoso, guardada en la ficha).
// - q: busca en email, username o rut (el rut con o sin puntos/guion) y, si
//   parece una IP, en todas las IPs desde las que la persona inició sesión
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
    // Solo si parece una IP (dígitos/hex con puntos o dos puntos): IPv4 como
    // "190.22" o IPv6 como "2800:150::1". Busca en todo el historial, no solo
    // en el último login, para ver todas las cuentas que usaron esa IP.
    if (/^[0-9a-fA-F.:]+$/.test(q) && /[.:]/.test(q)) {
      conditions.push(`EXISTS (
        SELECT 1 FROM login_history lh
        WHERE lh.auth_user_id = local_users.auth_user_id AND lh.ip ILIKE ${text}
      )`);
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
  runIdentityAction,
  listLocalUsers,
};
