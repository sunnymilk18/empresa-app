const API_URL = import.meta.env.VITE_API_URL;

// --- Renovación automática de la sesión ------------------------------------
// El access_token dura poco (15 min en la auth-api). Cuando el backend
// responde 401, pedimos uno nuevo y repetimos la petición. El refresh_token
// vive en una cookie httpOnly que pone empresa-backend (ver README,
// "Seguridad"): este archivo nunca lo ve ni lo manda a mano, el navegador la
// adjunta solo. AuthContext registra cómo leer/guardar el access_token.
let authHooks = null;
export function configureAuth(hooks) {
  authHooks = hooks;
}

// La auth-api rota el refresh_token en cada renovación (el anterior deja de
// servir), así que dos renovaciones simultáneas en esta misma pestaña harían
// fallar a la segunda. Por eso todas las peticiones que fallen a la vez
// esperan esta misma promesa.
let refreshing = null;
function refreshAccessToken() {
  if (!refreshing) {
    refreshing = (async () => {
      const current = authHooks.getSession();
      if (!current?.access_token) return null; // no hay sesión que renovar
      try {
        const tokens = await request('/api/auth/refresh', { method: 'POST' });
        authHooks.onRefreshed(tokens);
        return tokens.access_token;
      } catch (err) {
        // Servicio caído (no es que la sesión sea inválida): no la cerramos,
        // propagamos el error para que se muestre.
        if (isUnavailable(err)) throw err;
        // Otra pestaña pudo haber renovado justo antes (comparten la misma
        // cookie del navegador): si ya dejó un access_token nuevo guardado,
        // lo usamos en vez de cerrar la sesión.
        const latest = authHooks.getSession();
        if (latest?.access_token && latest.access_token !== current.access_token) {
          return latest.access_token;
        }
        authHooks.onExpired();
        return null;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

// true si el error es porque el backend o la auth-api no están disponibles
// (sin respuesta, o un 5xx), y no porque la sesión o los datos sean inválidos.
export function isUnavailable(err) {
  return !err.status || err.status >= 500;
}

// Lee el cuerpo de una copia de la respuesta, para no consumir la original.
async function isTokenProblem(res) {
  const data = await res.clone().json().catch(() => null);
  return data?.code === 'invalid_token';
}

async function send(path, { method, body, token }) {
  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      // Necesario para que el navegador mande (y guarde) la cookie httpOnly
      // del refresh_token, que vive en empresa-backend, no en este origen
      // cuando el frontend corre en otro puerto (p. ej. Vite en :5173).
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Backend apagado o sin red.
    throw new Error('No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
  }
}

// Wrapper simple sobre fetch. Todo pasa por empresa-backend: el frontend
// nunca llama directo a la auth-api ni conoce su API key.
async function request(path, { method = 'GET', body, token } = {}) {
  let res = await send(path, { method, body, token });

  // Token vencido: renovamos una vez y reintentamos con el nuevo. Solo si el
  // backend dice que el problema es el token (code 'invalid_token'); otros
  // 401 (p. ej. "código inválido" al activar la app) no se reintentan.
  if (res.status === 401 && token && authHooks && (await isTokenProblem(res))) {
    const newToken = await refreshAccessToken();
    if (newToken) res = await send(path, { method, body, token: newToken });
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Respuesta que no es JSON (p. ej. una página de error de un proxy).
  }

  if (!res.ok) {
    const error = new Error(data?.error || `Error ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
  verifyEmail: (payload) => request('/api/auth/verify-email', { method: 'POST', body: payload }),
  resendVerification: (payload) =>
    request('/api/auth/resend-verification', { method: 'POST', body: payload }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  sendEmailCode: (payload) =>
    request('/api/auth/send-email-code', { method: 'POST', body: payload }),
  verifyOtp: (payload) => request('/api/auth/verify-otp', { method: 'POST', body: payload }),
  resendCode: (payload) => request('/api/auth/resend-code', { method: 'POST', body: payload }),

  // Aprobación de login por notificación push (celular ya emparejado).
  pollPushLogin: (loginToken) =>
    request(`/api/auth/login/push-status?login_token=${encodeURIComponent(loginToken)}`),
  requestLoginEmailCode: (payload) =>
    request('/api/auth/login/request-email-code', { method: 'POST', body: payload }),
  // El refresh_token viaja en la cookie httpOnly, no en el cuerpo: no se
  // pasa nada aquí (ver refreshAccessToken más arriba).
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  // App autenticadora (TOTP). Con { login_token } en el primer login; con
  // `token` (sesión iniciada) desde el perfil.
  totpEnroll: (payload, token) =>
    request('/api/auth/totp/enroll', { method: 'POST', body: payload, token }),
  totpConfirm: (payload, token) =>
    request('/api/auth/totp/confirm', { method: 'POST', body: payload, token }),
  totpDisable: (token) => request('/api/auth/totp/disable', { method: 'POST', token }),

  requestPasswordReset: (payload) =>
    request('/api/auth/password-reset/request', { method: 'POST', body: payload }),
  confirmPasswordReset: (payload) =>
    request('/api/auth/password-reset/confirm', { method: 'POST', body: payload }),

  me: (token) => request('/api/me', { token }),

  // Panel del superadmin
  getStats: (token) => request('/api/stats', { token }),

  // filters: { q, role, status, page } — se omiten los vacíos.
  listLocalUsers: (token, filters = {}) => {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value !== '' && value != null)
    );
    const query = params.toString();
    return request(`/api/local-users${query ? `?${query}` : ''}`, { token });
  },
  // reason: obligatorio, queda en Actividad (ver ReasonModal).
  setLocalUserRole: (authUserId, role, reason, token) =>
    request(`/api/local-users/${encodeURIComponent(authUserId)}/role`, {
      method: 'PUT',
      body: { role, reason },
      token,
    }),
  getUserLogins: (authUserId, token, before) =>
    request(
      `/api/local-users/${encodeURIComponent(authUserId)}/logins${before ? `?before=${before}` : ''}`,
      { token }
    ),
  // filters: { before, actor, target, action, from, to } — se omiten los vacíos.
  // Todas las cuentas registradas (incluidas las que nunca completaron su
  // primer login). Requiere AUTH_API_SYSTEM_ADMIN_TOKEN en el backend.
  // q busca por email, usuario o RUT, del lado de la auth-api (no filtra
  // solo lo ya cargado en el navegador).
  listAuthUsers: (token, { page, pageSize, q } = {}) => {
    const params = new URLSearchParams();
    if (page) params.set('page', page);
    if (pageSize) params.set('page_size', pageSize);
    if (q) params.set('q', q);
    const query = params.toString();
    return request(`/api/auth-users${query ? `?${query}` : ''}`, { token });
  },
  listAuditLog: (token, filters = {}) => {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value !== '' && value != null)
    );
    const query = params.toString();
    return request(`/api/audit-log${query ? `?${query}` : ''}`, { token });
  },
  // Moderación en la auth-api (requiere AUTH_API_SYSTEM_ADMIN_TOKEN en el backend)
  revokeUserSessions: (authUserId, token) =>
    request(`/api/local-users/${encodeURIComponent(authUserId)}/revoke-sessions`, { method: 'POST', token }),
  disableUserTotp: (authUserId, token) =>
    request(`/api/local-users/${encodeURIComponent(authUserId)}/disable-totp`, { method: 'POST', token }),
  // reason: obligatorio, queda en Actividad (ver ReasonModal). Devuelve
  // { user, authApi, warning? }: `warning` si no se pudo aplicar en la auth-api.
  setLocalUserBlocked: (authUserId, blocked, reason, token) =>
    request(`/api/local-users/${encodeURIComponent(authUserId)}/blocked`, {
      method: 'PUT',
      body: { blocked, reason },
      token,
    }),
};
