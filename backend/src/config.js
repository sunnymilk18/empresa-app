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
  // Limpieza automática de registros antiguos (ver lib/retention.js).
  loginHistoryRetentionDays: retentionDays('LOGIN_HISTORY_RETENTION_DAYS', 365),
  auditLogRetentionDays: retentionDays('AUDIT_LOG_RETENTION_DAYS', 1095),
};

module.exports = config;
