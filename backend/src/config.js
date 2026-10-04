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

// Roles cuyo login exige el PIN como último paso (LOGIN_PIN_ROLES, lista separada
// por comas). Sin definir devuelve null (el backend no toca ese interruptor en la
// auth-api); definida pero vacía, [] (nadie lo exige y se apaga donde estaba
// puesto). Un rol desconocido detiene el arranque: un error de tipeo no debe
// dejar a un rol sin la protección que se quería.
function loginPinRoles(name) {
  const raw = process.env[name];
  if (raw === undefined) return null;
  const roles = raw.split(',').map((r) => r.trim()).filter(Boolean);
  const bad = roles.find((r) => !['superadmin', 'admin', 'user'].includes(r));
  if (bad) {
    // eslint-disable-next-line no-console
    console.error(`${name}: rol desconocido "${bad}". Usa superadmin, admin y/o user separados por comas.`);
    process.exit(1);
  }
  return roles;
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
  // Roles que deben ingresar el PIN como último paso del login (tras la contraseña
  // y el segundo factor). Es un interruptor por cuenta en la auth-api; el backend
  // lo activa o apaga según el rol de cada cuenta (al loguear y al cambiarle el
  // rol). null = sin definir: no se toca. Ver README, "PIN obligatorio al iniciar sesión".
  loginPinRoles: loginPinRoles('LOGIN_PIN_ROLES'),
  appTimezone: timezone('APP_TIMEZONE', 'America/Santiago'),
  // Limpieza automática de registros antiguos (ver lib/retention.js).
  loginHistoryRetentionDays: retentionDays('LOGIN_HISTORY_RETENTION_DAYS', 365),
  auditLogRetentionDays: retentionDays('AUDIT_LOG_RETENTION_DAYS', 1095),
};

module.exports = config;
