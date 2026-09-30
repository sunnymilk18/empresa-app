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

// Lista las cuentas registradas en la auth-api para este sistema (todas,
// incluidas las que nunca completaron su primer login y por eso no aparecen
// en /api/local-users) — requiere la misma credencial de administración por
// sistema. q busca por email, usuario o rut, del lado de la auth-api (no del
// navegador), así que funciona sin importar cuántas páginas haya. Nunca
// lanza: devuelve { ok: true, data } con la respuesta tal cual la auth-api
// ({ users, page, page_size, total }), o { ok: false, reason } con el mismo
// significado que systemAdminAction ('unauthorized' | 'unavailable' | 'disabled').
async function systemAdminListUsers({ page, pageSize, q } = {}) {
  if (!config.authApiSystemAdminToken) return { ok: false, reason: 'disabled' };
  const params = new URLSearchParams();
  if (page) params.set('page', page);
  if (pageSize) params.set('page_size', pageSize);
  if (q) params.set('q', q);
  const query = params.toString();

  let res;
  try {
    res = await authApiFetch(`/system-admin/users${query ? `?${query}` : ''}`, {
      headers: { 'X-System-Admin-Token': config.authApiSystemAdminToken },
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (res.status === 401) return { ok: false, reason: 'unauthorized' };
  if (!res.ok) return { ok: false, reason: 'unavailable' };
  const data = await res.json().catch(() => null);
  if (!data) return { ok: false, reason: 'unavailable' };
  return { ok: true, data };
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
  systemAdminListUsers,
  SYSTEM_ADMIN_MESSAGES,
};
