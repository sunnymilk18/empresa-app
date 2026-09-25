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

module.exports = { AuthApiUnavailableError, authApiFetch, callAuthApi };
