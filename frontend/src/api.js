const API_URL = import.meta.env.VITE_API_URL;

// Wrapper simple sobre fetch. Todo pasa por empresa-backend: el frontend
// nunca llama directo a la auth-api ni conoce su API key.
async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

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
  refresh: (payload) => request('/api/auth/refresh', { method: 'POST', body: payload }),
  logout: (payload) => request('/api/auth/logout', { method: 'POST', body: payload }),

  requestPasswordReset: (payload) =>
    request('/api/auth/password-reset/request', { method: 'POST', body: payload }),
  confirmPasswordReset: (payload) =>
    request('/api/auth/password-reset/confirm', { method: 'POST', body: payload }),

  me: (token) => request('/api/me', { token }),

  listClientes: (token) => request('/api/clientes', { token }),
  createCliente: (payload, token) =>
    request('/api/clientes', { method: 'POST', body: payload, token }),
  updateCliente: (id, payload, token) =>
    request(`/api/clientes/${id}`, { method: 'PUT', body: payload, token }),
  deleteCliente: (id, token) =>
    request(`/api/clientes/${id}`, { method: 'DELETE', token }),
};
