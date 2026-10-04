require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    // eslint-disable-next-line no-console
    console.error(`Falta la variable de entorno ${name}. Copia .env.example a .env y complétala.`);
    process.exit(1);
  }
  return value;
}

// Días de retención (entero >= 0; 0 = no borrar nunca). Un valor inválido
// detiene el arranque: mejor no arrancar que borrar registros por error.
function retentionDays(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw.trim())) {
    // eslint-disable-next-line no-console
    console.error(`${name} debe ser un número entero de días (0 = no borrar nunca). Valor recibido: "${raw}"`);
    process.exit(1);
  }
  return Number(raw.trim());
}

// Zona horaria en la que se interpretan los filtros por fecha del registro de
// actividad ('YYYY-MM-DD'). Un valor inválido detiene el arranque.
function timezone(name, fallback) {
  const value = (process.env[name] || fallback).trim();
  try {
    new Intl.DateTimeFormat('es-CL', { timeZone: value });
  } catch {
    // eslint-disable-next-line no-console
    console.error(`${name} no es una zona horaria válida (p. ej. America/Santiago). Valor recibido: "${value}"`);
    process.exit(1);
  }
  return value;
}

const config = {
  port: process.env.PORT || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  authApiUrl: required('AUTH_API_URL').replace(/\/+$/, ''),
  authApiKey: required('AUTH_API_KEY'),
  // Opcional: credencial de administración de la auth-api acotada a este
  // sistema (header X-System-Admin-Token). Sin ella, el panel solo bloquea
  // localmente y no ofrece cerrar sesiones ni desactivar la app autenticadora.
  authApiSystemAdminToken: process.env.AUTH_API_SYSTEM_ADMIN_TOKEN || null,
  // Tiempo máximo de espera de cada llamada a la auth-api (ms).
  authApiTimeoutMs: Number(process.env.AUTH_API_TIMEOUT_MS) || 10000,
  databaseUrl: required('DATABASE_URL'),
  // Cookie httpOnly donde vive el refresh_token (ver README, "Seguridad").
  // Secure por defecto: el navegador no la manda salvo por HTTPS. Ponla en
  // "false" SOLO para desarrollo local por HTTP (nunca en producción).
  cookieSecure: process.env.COOKIE_SECURE !== 'false',
  // Pide el PIN de la cuenta en las acciones destructivas del superadmin (ver
  // lib/adminPin.js). Apagado por defecto: se enciende cuando las apps ya lo
  // envían.
  adminPinEnforced: process.env.ADMIN_PIN_ENFORCED === 'true',
  // PIN obligatorio como último paso del login de los superadmin (después de la
  // contraseña y del segundo factor). Es un interruptor por cuenta en la
  // auth-api; con esto encendido, el backend lo activa en cada superadmin (al
  // loguear o al darle el rol) y lo apaga al quitárselo. Apagado por defecto:
  // enciéndelo cuando el frontend con la pantalla de PIN ya esté desplegado.
  adminLoginPinEnforced: process.env.ADMIN_LOGIN_PIN === 'true',
  appTimezone: timezone('APP_TIMEZONE', 'America/Santiago'),
  // Limpieza automática de registros antiguos (ver lib/retention.js).
  loginHistoryRetentionDays: retentionDays('LOGIN_HISTORY_RETENTION_DAYS', 365),
  auditLogRetentionDays: retentionDays('AUDIT_LOG_RETENTION_DAYS', 1095),
};

module.exports = config;
