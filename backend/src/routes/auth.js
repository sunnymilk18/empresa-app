const express = require('express');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// --- Cliente HTTP hacia auth-2fa-api-go -------------------------------------
// Este archivo NO reimplementa autenticación: solo reenvía cada llamada a la
// auth-api externa, agregando el header X-API-Key del lado del servidor.
// Así la API key real nunca llega al navegador (ver README, "Seguridad").
async function callAuthApi(path, { method = 'POST', body, headers = {} } = {}) {
  const res = await fetch(`${config.authApiUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.authApiKey,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

function forward(res, upstream) {
  return res.status(upstream.status).json(upstream.data ?? {});
}

// POST /api/auth/register  ->  POST /auth/register (auth-api)
router.post('/register', async (req, res) => {
  const { email, password, username, rut } = req.body;
  const upstream = await callAuthApi('/auth/register', {
    body: { email, password, username, rut },
  });
  forward(res, upstream);
});

// POST /api/auth/verify-email  ->  POST /auth/verify-email/confirm
router.post('/verify-email', async (req, res) => {
  const { email, code } = req.body;
  const upstream = await callAuthApi('/auth/verify-email/confirm', {
    body: { email, code },
  });
  forward(res, upstream);
});

// POST /api/auth/resend-verification  ->  POST /auth/verify-email/resend
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  const upstream = await callAuthApi('/auth/verify-email/resend', { body: { email } });
  forward(res, upstream);
});

// POST /api/auth/login  ->  POST /auth/login
// Devuelve login_token + needs_2fa_setup, tal cual la auth-api.
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  const upstream = await callAuthApi('/auth/login', { body: { identifier, password } });
  forward(res, upstream);
});

// POST /api/auth/send-email-code  ->  POST /auth/login/send-email-code
// Solo aplica si el login anterior devolvió needs_2fa_setup=true (primera
// vez que esa cuenta loguea Y el servidor tiene TOTP configurado como
// alternativa). Si el servidor no tiene esa función habilitada, la auth-api
// responde 404 y lo mostramos tal cual.
router.post('/send-email-code', async (req, res) => {
  const { login_token } = req.body;
  const upstream = await callAuthApi('/auth/login/send-email-code', {
    body: { login_token },
  });
  forward(res, upstream);
});

// POST /api/auth/verify-otp  ->  POST /auth/verify-otp
// Devuelve access_token + refresh_token.
router.post('/verify-otp', async (req, res) => {
  const { login_token, code } = req.body;
  const upstream = await callAuthApi('/auth/verify-otp', { body: { login_token, code } });
  forward(res, upstream);
});

// POST /api/auth/refresh  ->  POST /auth/refresh
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  const upstream = await callAuthApi('/auth/refresh', { body: { refresh_token } });
  forward(res, upstream);
});

// POST /api/auth/logout  ->  POST /auth/logout
router.post('/logout', async (req, res) => {
  const { refresh_token } = req.body;
  const upstream = await callAuthApi('/auth/logout', { body: { refresh_token } });
  forward(res, upstream);
});

// --- Recuperación de contraseña ---------------------------------------------

// POST /api/auth/password-reset/request  ->  POST /auth/password-reset/request
// La respuesta es idéntica exista o no la cuenta (así lo hace la auth-api),
// así que este endpoint nunca revela si un email está registrado.
router.post('/password-reset/request', async (req, res) => {
  const { email } = req.body;
  const upstream = await callAuthApi('/auth/password-reset/request', { body: { email } });
  forward(res, upstream);
});

// POST /api/auth/password-reset/confirm  ->  POST /auth/password-reset/confirm
router.post('/password-reset/confirm', async (req, res) => {
  const { email, code, new_password } = req.body;
  const upstream = await callAuthApi('/auth/password-reset/confirm', {
    body: { email, code, new_password },
  });
  forward(res, upstream);
});

// --- TOTP (app autenticadora) -----------------------------------------------
// Solo funciona si la auth-api tiene TOTP_ENCRYPTION_KEY configurada; si no,
// la auth-api responde 404 y lo mostramos tal cual (no hay UI para esto en
// el frontend de esta demo, pero el backend ya sabe proxyar las llamadas).

// POST /api/auth/totp/enroll  ->  POST /auth/totp/enroll
// Acepta login_token (primer login, cuenta sin sesión todavía) O el
// access_token del usuario ya logueado (cambiar de método más adelante).
router.post('/totp/enroll', async (req, res) => {
  const { login_token } = req.body;
  const header = req.headers.authorization;
  const upstream = await callAuthApi('/auth/totp/enroll', {
    body: login_token ? { login_token } : undefined,
    headers: header ? { Authorization: header } : {},
  });
  forward(res, upstream);
});

// POST /api/auth/totp/confirm  ->  POST /auth/totp/confirm
router.post('/totp/confirm', async (req, res) => {
  const { login_token, code } = req.body;
  const header = req.headers.authorization;
  const upstream = await callAuthApi('/auth/totp/confirm', {
    body: login_token ? { login_token, code } : { code },
    headers: header ? { Authorization: header } : {},
  });
  forward(res, upstream);
});

// POST /api/auth/totp/disable  ->  POST /auth/totp/disable (protegido)
router.post('/totp/disable', requireAuth, async (req, res) => {
  const upstream = await callAuthApi('/auth/totp/disable', {
    body: {},
    headers: { Authorization: `Bearer ${req.accessToken}` },
  });
  forward(res, upstream);
});

module.exports = router;
