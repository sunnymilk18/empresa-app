const API_URL = import.meta.env.VITE_API_URL;

// --- Renovación automática de la sesión ------------------------------------
// El access_token dura poco (15 min en la auth-api). Cuando el backend
// responde 401, pedimos un par nuevo con el refresh_token y repetimos la
// petición. AuthContext registra cómo leer/guardar la sesión.
let authHooks = null;
export function configureAuth(hooks) {
  authHooks = hooks;
}

// El refresh_token se invalida al usarlo (la auth-api lo rota), así que dos
// renovaciones simultáneas harían fallar a la segunda. Por eso todas las
// peticiones que fallen a la vez esperan esta misma promesa.
let refreshing = null;
function refreshAccessToken() {
  if (!refreshing) {
    refreshing = (async () => {
      const current = authHooks.getSession();
      if (!current?.refresh_token) return null;
      try {
        const tokens = await request('/api/auth/refresh', {
          method: 'POST',
          body: { refresh_token: current.refresh_token },
        });
        authHooks.onRefreshed(tokens);
        return tokens.access_token;
      } catch (err) {
        // Servicio caído (no es que la sesión sea inválida): no la cerramos,
        // propagamos el error para que se muestre.
        if (isUnavailable(err)) throw err;
        // Otra pestaña pudo haber renovado justo antes con el mismo token:
        // si dejó uno nuevo guardado, usamos ese en vez de cerrar la sesión.
        const latest = authHooks.getSession();
        if (latest?.refresh_token && latest.refresh_token !== current.refresh_token) {
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
  refresh: (payload) => request('/api/auth/refresh', { method: 'POST', body: payload }),
  logout: (payload) => request('/api/auth/logout', { method: 'POST', body: payload }),

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
  setLocalUserRole: (authUserId, role, token) =>
    request(`/api/local-users/${encodeURIComponent(authUserId)}/role`, {
      method: 'PUT',
      body: { role },
      token,
    }),
  getUserLogins: (authUserId, token, before) =>
    request(
      `/api/local-users/${encodeURIComponent(authUserId)}/logins${before ? `?before=${before}` : ''}`,
      { token }
    ),
  listAuditLog: (token, before) =>
    request(`/api/audit-log${before ? `?before=${before}` : ''}`, { token }),
  setLocalUserBlocked: (authUserId, blocked, token) =>
    request(`/api/local-users/${encodeURIComponent(authUserId)}/blocked`, {
      method: 'PUT',
      body: { blocked },
      token,
    }),
};
