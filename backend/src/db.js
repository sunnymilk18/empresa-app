const { Pool } = require('pg');
const config = require('./config');

// Base de datos propia de la empresa (PostgreSQL), totalmente separada de la
// base de la auth-api. La configuración SSL se toma de la propia URL
// (p. ej. ?sslmode=require en Neon).
const pool = new Pool({ connectionString: config.databaseUrl });

const initSql = `
  CREATE TABLE IF NOT EXISTS local_users (
    id SERIAL PRIMARY KEY,
    auth_user_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Migraciones idempotentes (se pueden correr en cada arranque): datos del
  -- perfil que se copian de la auth-api al iniciar sesión, el bloqueo de
  -- cuentas y el rol superadmin.
  ALTER TABLE local_users ADD COLUMN IF NOT EXISTS username TEXT;
  ALTER TABLE local_users ADD COLUMN IF NOT EXISTS rut TEXT;
  ALTER TABLE local_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
  -- NULL = activo; con fecha = bloqueado desde ese momento.
  ALTER TABLE local_users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
  ALTER TABLE local_users DROP CONSTRAINT IF EXISTS local_users_role_check;
  ALTER TABLE local_users ADD CONSTRAINT local_users_role_check
    CHECK (role IN ('superadmin', 'admin', 'user'));

  -- Registro de auditoría: la app solo agrega filas, nunca las edita. Las más
  -- antiguas que AUDIT_LOG_RETENTION_DAYS las borra la limpieza automática.
  -- Los emails se copian al momento de la acción para que el registro siga
  -- siendo legible aunque después cambien.
  CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    actor_auth_user_id TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_auth_user_id TEXT,
    target_email TEXT,
    details JSONB NOT NULL DEFAULT '{}',
    ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);

  -- Historial de inicios de sesión completos (contraseña + OTP/TOTP).
  -- result: 'success' = entró; 'blocked' = cuenta bloqueada intentando entrar.
  CREATE TABLE IF NOT EXISTS login_history (
    id SERIAL PRIMARY KEY,
    auth_user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('success', 'blocked')),
    method TEXT NOT NULL CHECK (method IN ('otp', 'totp')),
    ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS login_history_user_idx ON login_history (auth_user_id, id DESC);
  -- Para que la limpieza de registros antiguos encuentre rápido lo que borra.
  CREATE INDEX IF NOT EXISTS login_history_created_at_idx ON login_history (created_at);

  -- Acción de moderación ('ban' o 'unban') que no se pudo aplicar en la
  -- auth-api (caída o credencial inválida) y queda por reintentar desde el
  -- panel. NULL = nada pendiente.
  ALTER TABLE local_users ADD COLUMN IF NOT EXISTS auth_api_pending_action TEXT;

  -- IP del último ingreso exitoso, guardada en la ficha para que sobreviva a
  -- la limpieza del historial. La primera vez se completa desde el historial.
  ALTER TABLE local_users ADD COLUMN IF NOT EXISTS last_login_ip TEXT;
  UPDATE local_users lu
  SET last_login_ip = (
    SELECT lh.ip FROM login_history lh
    WHERE lh.auth_user_id = lu.auth_user_id AND lh.result = 'success'
    ORDER BY lh.id DESC LIMIT 1
  )
  WHERE lu.last_login_ip IS NULL
    AND EXISTS (
      SELECT 1 FROM login_history lh
      WHERE lh.auth_user_id = lu.auth_user_id AND lh.result = 'success' AND lh.ip IS NOT NULL
    );
`;

// Pequeña capa tipo "prepared statement" para que las rutas no dependan de
// pg directamente. Las consultas usan placeholders $1, $2, ...
const prepare = (sql) => ({
  all: async (...params) => (await pool.query(sql, params)).rows,
  get: async (...params) => (await pool.query(sql, params)).rows[0],
  run: async (...params) => {
    const res = await pool.query(sql, params);
    return { rows: res.rows, rowCount: res.rowCount };
  },
});

// Ejecuta fn dentro de una transacción: o se aplica todo, o nada.
// fn recibe query(sql, params) ligado a la misma conexión.
async function transaction(fn) {
  const client = await pool.connect();
  let broken = null;
  try {
    await client.query('BEGIN');
    const result = await fn((sql, params = []) => client.query(sql, params));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // Si ni siquiera se puede deshacer, la conexión quedó inservible: se
    // descarta (release con error) en vez de devolverla al pool. Siempre se
    // propaga el error original.
    await client.query('ROLLBACK').catch((rollbackErr) => {
      broken = rollbackErr;
    });
    throw err;
  } finally {
    client.release(broken || undefined);
  }
}

// Llave del candado para poner la base al día (distinta a las de
// localUsers.js; cualquier número fijo sirve).
const INIT_LOCK = 4242000;

// Pone la base al día al arrancar (tablas, columnas, reglas). Si arrancan
// varias copias del backend a la vez, cada una espera su turno: la primera
// aplica los cambios y las demás, al entrar, ven que ya está todo hecho. Sin
// esto, dos copias creando la misma tabla al mismo tiempo chocan y una se
// apaga. En Postgres estos cambios son transaccionales: o se aplican todos,
// o ninguno.
function init() {
  return transaction(async (query) => {
    await query('SELECT pg_advisory_xact_lock($1)', [INIT_LOCK]);
    await query(initSql);
  });
}

module.exports = {
  prepare,
  transaction,
  init,
  // Conexión dedicada (hay que liberarla con client.release()). La usa la
  // limpieza automática para sostener un candado mientras borra por tandas.
  connect: () => pool.connect(),
  close: () => pool.end(),
};
