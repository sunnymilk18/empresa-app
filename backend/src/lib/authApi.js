const net = require('net');
const { AsyncLocalStorage } = require('async_hooks');
const config = require('../config');

// IP real de quien hizo la petición que se está atendiendo (server.js la guarda
// al entrar). Así authApiFetch la manda en X-Forwarded-For sin tener que pasarla
// por cada llamada: sin esto, la auth-api vería siempre la IP de este backend y
// sus límites por IP y su lista negra tratarían a todos como una sola persona.
// La auth-api solo confía en ese header si la conexión viene de su red interna
// (TRUSTED_PROXY_CIDRS), ver AUTH_API_URL en .env.example.
const clientIpStore = new AsyncLocalStorage();

// Middleware: guarda req.ip durante el resto de la petición (async incluido).
function rememberClientIp(req, res, next) {
  clientIpStore.run(req.ip, next);
}

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
  const ip = clientIpStore.getStore();
  try {
    return await fetch(`${config.authApiUrl}${path}`, {
      ...options,
      headers: {
        ...(net.isIP(ip) ? { 'X-Forwarded-For': ip } : {}),
        ...options.headers,
      },
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

// Inicia la corrección del correo de una cuenta (POST /system-admin/users/{id}/change-email):
// no cambia nada todavía, la auth-api le manda un código al correo NUEVO y la propia
// persona lo confirma con la ruta pública /auth/change-email/confirm. Nunca lanza;
// devuelve lo mismo que systemAdminAction más:
//   'invalid_email'  el correo nuevo no tiene un formato válido (400)
//   'email_in_use'   ya lo usa otra cuenta de este sistema (409)
async function systemAdminChangeEmail(authUserId, newEmail) {
  if (!config.authApiSystemAdminToken) return 'disabled';
  let res;
  try {
    res = await authApiFetch(`/system-admin/users/${encodeURIComponent(authUserId)}/change-email`, {
      method: 'POST',
      headers: {
        'X-System-Admin-Token': config.authApiSystemAdminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ new_email: newEmail }),
    });
  } catch {
    return 'unavailable';
  }
  await res.text().catch(() => {}); // libera la conexión; el cuerpo no se usa
  if (res.status === 204 || res.ok) return 'ok';
  if (res.status === 400) return 'invalid_email';
  if (res.status === 404) return 'not_found';
  if (res.status === 401) return 'unauthorized';
  if (res.status === 409) return 'email_in_use';
  return 'unavailable';
}

// Enciende o apaga en la auth-api el PIN obligatorio al final del login de una
// cuenta (PUT /system-admin/users/{id}/login-pin-required). No revoca sesiones:
// solo afecta los logins siguientes. Nunca lanza; devuelve lo mismo que
// systemAdminAction.
async function systemAdminSetLoginPin(authUserId, required) {
  if (!config.authApiSystemAdminToken) return 'disabled';
  let res;
  try {
    res = await authApiFetch(`/system-admin/users/${encodeURIComponent(authUserId)}/login-pin-required`, {
      method: 'PUT',
      headers: {
        'X-System-Admin-Token': config.authApiSystemAdminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ required }),
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

// Llamada a una ruta /system-admin/* con la credencial de este sistema, para las
// que devuelven un cuerpo o aceptan uno (baneos por IP y bloqueos por intentos).
// Nunca lanza: { ok: true, status, data } o { ok: false, reason } con
// 'disabled' | 'unavailable' | 'unauthorized' | 'not_found' | 'bad_request'
// (400: lo que se mandó no es válido, p. ej. una IP mal escrita).
async function systemAdminCall(path, { method = 'GET', body } = {}) {
  if (!config.authApiSystemAdminToken) return { ok: false, reason: 'disabled' };
  let res;
  try {
    res = await authApiFetch(path, {
      method,
      headers: {
        'X-System-Admin-Token': config.authApiSystemAdminToken,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  const text = await res.text().catch(() => '');
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (res.status === 401) return { ok: false, reason: 'unauthorized' };
  if (res.status === 404) return { ok: false, reason: 'not_found' };
  if (res.status === 400) return { ok: false, reason: 'bad_request' };
  if (!res.ok) return { ok: false, reason: 'unavailable' };
  return { ok: true, status: res.status, data };
}

// IPs baneadas por la auth-api que este sistema generó ({ bans: [...] }).
const systemAdminListBans = () => systemAdminCall('/system-admin/blacklist');

// Levanta el baneo de una IP (solo si este sistema es su dueño; si no, not_found).
const systemAdminLiftBan = (ip, reason) =>
  systemAdminCall(`/system-admin/blacklist/${encodeURIComponent(ip)}`, { method: 'DELETE', body: { reason } });

// Bloqueos por intentos fallidos de una cuenta: { login: {...}, pin: {...} }.
const systemAdminGetLockouts = (authUserId) =>
  systemAdminCall(`/system-admin/users/${encodeURIComponent(authUserId)}/lockouts`);

// Pone en cero esos contadores ('login' | 'pin' | 'all'); no toca sesiones ni el PIN.
const systemAdminClearLockouts = (authUserId, which) =>
  systemAdminCall(`/system-admin/users/${encodeURIComponent(authUserId)}/clear-lockouts`, {
    method: 'POST',
    body: { which },
  });

// Texto para mostrar cuando una acción de moderación no se pudo aplicar.
const SYSTEM_ADMIN_MESSAGES = {
  not_found: 'La cuenta ya no existe en el servicio de autenticación.',
  unauthorized:
    'La credencial de administración del servicio de autenticación es inválida o fue revocada (revisa AUTH_API_SYSTEM_ADMIN_TOKEN en el .env del backend).',
  unavailable: 'El servicio de autenticación no respondió. Intenta de nuevo en unos minutos.',
  invalid_email: 'El correo nuevo no tiene un formato válido.',
  email_in_use: 'Ese correo ya está en uso por otra cuenta de este sistema.',
  bad_request: 'La auth-api rechazó los datos enviados.',
  disabled:
    'Esta acción requiere la credencial de administración del servicio de autenticación (AUTH_API_SYSTEM_ADMIN_TOKEN), que no está configurada.',
};

module.exports = {
  AuthApiUnavailableError,
  authApiFetch,
  rememberClientIp,
  callAuthApi,
  systemAdminAction,
  systemAdminChangeEmail,
  systemAdminSetLoginPin,
  systemAdminListUsers,
  systemAdminListBans,
  systemAdminLiftBan,
  systemAdminGetLockouts,
  systemAdminClearLockouts,
  SYSTEM_ADMIN_MESSAGES,
};
