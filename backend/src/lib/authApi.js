const config = require('../config');

// Error para cuando la auth-api no responde, tarda demasiado o devuelve algo
// que no es JSON (p. ej. una página "502 Bad Gateway" de un proxy). El handler
// de errores de server.js lo convierte en un 503 con un mensaje claro, en vez
// de que el backend se caiga.
class AuthApiUnavailableError extends Error {
  constructor(cause) {
    super('El servicio de autenticación no está disponible. Intenta de nuevo en unos minutos.');
    this.name = 'AuthApiUnavailableError';
    this.cause = cause;
  }
}

// fetch hacia la auth-api con tiempo máximo de espera.
async function authApiFetch(path, options = {}) {
  try {
    return await fetch(`${config.authApiUrl}${path}`, {
      ...options,
      signal: AbortSignal.timeout(config.authApiTimeoutMs),
    });
  } catch (err) {
    throw new AuthApiUnavailableError(err);
  }
}

// Llamada a /auth/* con la API key. Devuelve { status, data } tal cual la
// auth-api, o lanza AuthApiUnavailableError si no hubo una respuesta JSON.
async function callAuthApi(path, { method = 'POST', body, headers = {} } = {}) {
  const res = await authApiFetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.authApiKey,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  try {
    return { status: res.status, data: text ? JSON.parse(text) : null };
  } catch (err) {
    throw new AuthApiUnavailableError(err);
  }
}

// Acción de moderación sobre una cuenta en la auth-api, con la credencial
// acotada a este sistema: 'ban' | 'unban' | 'disable-totp' | 'revoke-sessions'.
// Nunca lanza: devuelve cómo terminó, para que quien llama decida qué hacer.
//   'ok'           la auth-api la aplicó (204)
//   'not_found'    la cuenta no existe en la auth-api (o es de otro sistema)
//   'unauthorized' la credencial es inválida o fue revocada
//   'unavailable'  la auth-api no respondió, tardó demasiado o falló
//   'disabled'     no hay credencial configurada (AUTH_API_SYSTEM_ADMIN_TOKEN)
async function systemAdminAction(authUserId, action) {
  if (!config.authApiSystemAdminToken) return 'disabled';
  let res;
  try {
    res = await authApiFetch(`/system-admin/users/${encodeURIComponent(authUserId)}/${action}`, {
      method: 'POST',
      headers: { 'X-System-Admin-Token': config.authApiSystemAdminToken },
    });
  } catch {
    return 'unavailable';
  }
  await res.text().catch(() => {}); // libera la conexión; el cuerpo no se usa
  if (res.status === 204 || res.ok) return 'ok';
  if (res.status === 404) return 'not_found';
  if (res.status === 401) return 'unauthorized';
  return 'unavailable';
}

// Texto para mostrar cuando una acción de moderación no se pudo aplicar.
const SYSTEM_ADMIN_MESSAGES = {
  not_found: 'La cuenta ya no existe en el servicio de autenticación.',
  unauthorized:
    'La credencial de administración del servicio de autenticación es inválida o fue revocada (revisa AUTH_API_SYSTEM_ADMIN_TOKEN en el .env del backend).',
  unavailable: 'El servicio de autenticación no respondió. Intenta de nuevo en unos minutos.',
  disabled:
    'Esta acción requiere la credencial de administración del servicio de autenticación (AUTH_API_SYSTEM_ADMIN_TOKEN), que no está configurada.',
};

module.exports = {
  AuthApiUnavailableError,
  authApiFetch,
  callAuthApi,
  systemAdminAction,
  SYSTEM_ADMIN_MESSAGES,
};
