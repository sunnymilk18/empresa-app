const express = require('express');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/auth');
const { recordLogin } = require('../lib/localUsers');
const { BLOCKED_RESPONSE } = require('../lib/blocked');
const { recordLoginEvent } = require('../lib/loginHistory');
const { authApiFetch, callAuthApi } = require('../lib/authApi');
const { logAction } = require('../lib/audit');
const asyncHandler = require('../lib/asyncHandler');
const db = require('../db');

const router = express.Router();

// --- Cliente HTTP hacia auth-2fa-api-go -------------------------------------
// Este archivo NO reimplementa autenticación: solo reenvía cada llamada a la
// auth-api externa (vía lib/authApi, que agrega el header X-API-Key del lado
// del servidor). Así la API key real nunca llega al navegador (ver README,
// "Seguridad").

function forward(res, upstream) {
  return res.status(upstream.status).json(upstream.data ?? {});
}

// Cuando un login termina (OTP o TOTP) registramos a la persona en
// local_users con su perfil de la auth-api (username/rut) y la hora del
// login. El token viene directo de la auth-api por HTTPS, así que basta con
// decodificarlo. Si algo falla no bloqueamos el login: solo se registra.
// Devuelve { localUser, method } (o null si no hubo login o falló el registro).
async function syncLocalUser(req, upstream) {
  const accessToken = upstream.status === 200 && upstream.data?.access_token;
  if (!accessToken) return null;
  try {
    const claims = jwt.decode(accessToken);
    // El perfil (username/rut/método) es un extra: si /me falla, el login se
    // registra igual y se conservan los datos que ya teníamos guardados.
    let profile = {};
    try {
      const meRes = await authApiFetch('/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (meRes.ok) profile = await meRes.json();
    } catch {
      // auth-api sin responder a /me: seguimos sin perfil
    }
    const localUser = await recordLogin(claims.sub, {
      email: claims.email,
      username: profile.username,
      rut: profile.rut,
      ip: req.ip,
    });
    return { localUser, method: profile.totp_enabled ? 'totp' : 'otp' };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('No se pudo registrar el login en local_users:', err.message);
    return null;
  }
}

// Guarda el intento en el historial de inicios de sesión. Si falla, no
// interrumpe el login: solo se anota el error.
async function logLoginEvent(req, localUser, method, result) {
  try {
    await recordLoginEvent({
      authUserId: localUser.auth_user_id,
      email: localUser.email,
      result,
      method,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('No se pudo guardar el historial de inicio de sesión:', err.message);
  }
}

// Termina un login (OTP o TOTP): lo registra en el historial y, si la cuenta
// está bloqueada en empresa-app, revoca en la auth-api la sesión recién
// creada y no entrega los tokens. Devuelve el usuario local (o undefined si
// el login no se completó).
async function finishLogin(req, res, upstream) {
  const synced = await syncLocalUser(req, upstream);
  const localUser = synced?.localUser;
  if (localUser) {
    await logLoginEvent(req, localUser, synced.method, localUser.blocked_at ? 'blocked' : 'success');
  }
  if (localUser?.blocked_at) {
    await callAuthApi('/auth/logout', {
      body: { refresh_token: upstream.data.refresh_token },
    }).catch(() => {});
    res.status(403).json(BLOCKED_RESPONSE);
  } else {
    forward(res, upstream);
  }
  return localUser;
}

// POST /api/auth/register  ->  POST /auth/register (auth-api)
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, username, rut } = req.body;
  const upstream = await callAuthApi('/auth/register', {
    body: { email, password, username, rut },
  });
  forward(res, upstream);
}));

// POST /api/auth/verify-email  ->  POST /auth/verify-email/confirm
router.post('/verify-email', asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  const upstream = await callAuthApi('/auth/verify-email/confirm', {
    body: { email, code },
  });
  forward(res, upstream);
}));

// POST /api/auth/resend-verification  ->  POST /auth/verify-email/resend
router.post('/resend-verification', asyncHandler(async (req, res) => {
  const { email } = req.body;
  const upstream = await callAuthApi('/auth/verify-email/resend', { body: { email } });
  forward(res, upstream);
}));

// POST /api/auth/login  ->  POST /auth/login
// Devuelve login_token + needs_2fa_setup, tal cual la auth-api.
router.post('/login', asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  const upstream = await callAuthApi('/auth/login', { body: { identifier, password } });
  forward(res, upstream);
}));

// POST /api/auth/send-email-code  ->  POST /auth/login/send-email-code
// Solo aplica si el login anterior devolvió needs_2fa_setup=true (primera
// vez que esa cuenta loguea Y el servidor tiene TOTP configurado como
// alternativa). Si el servidor no tiene esa función habilitada, la auth-api
// responde 404 y lo mostramos tal cual.
router.post('/send-email-code', asyncHandler(async (req, res) => {
  const { login_token } = req.body;
  const upstream = await callAuthApi('/auth/login/send-email-code', {
    body: { login_token },
  });
  forward(res, upstream);
}));

// POST /api/auth/verify-otp  ->  POST /auth/verify-otp
// Devuelve access_token + refresh_token.
router.post('/verify-otp', asyncHandler(async (req, res) => {
  const { login_token, code } = req.body;
  const upstream = await callAuthApi('/auth/verify-otp', { body: { login_token, code } });
  await finishLogin(req, res, upstream);
}));

// POST /api/auth/refresh  ->  POST /auth/refresh
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refresh_token } = req.body;
  const upstream = await callAuthApi('/auth/refresh', { body: { refresh_token } });
  forward(res, upstream);
}));

// POST /api/auth/logout  ->  POST /auth/logout
router.post('/logout', asyncHandler(async (req, res) => {
  const { refresh_token } = req.body;
  const upstream = await callAuthApi('/auth/logout', { body: { refresh_token } });
  forward(res, upstream);
}));

// --- Recuperación de contraseña ---------------------------------------------

// POST /api/auth/password-reset/request  ->  POST /auth/password-reset/request
// La respuesta es idéntica exista o no la cuenta (así lo hace la auth-api),
// así que este endpoint nunca revela si un email está registrado.
router.post('/password-reset/request', asyncHandler(async (req, res) => {
  const { email } = req.body;
  const upstream = await callAuthApi('/auth/password-reset/request', { body: { email } });
  forward(res, upstream);
}));

// POST /api/auth/password-reset/confirm  ->  POST /auth/password-reset/confirm
router.post('/password-reset/confirm', asyncHandler(async (req, res) => {
  const { email, code, new_password } = req.body;
  const upstream = await callAuthApi('/auth/password-reset/confirm', {
    body: { email, code, new_password },
  });
  forward(res, upstream);
}));

// POST /api/auth/resend-code  ->  POST /auth/login/resend-code
// "No me llegó el código": reenvía uno nuevo por correo. Para una cuenta con
// app autenticadora la auth-api responde 409 (no hay nada que reenviar).
router.post('/resend-code', asyncHandler(async (req, res) => {
  const { login_token } = req.body;
  const upstream = await callAuthApi('/auth/login/resend-code', { body: { login_token } });
  forward(res, upstream);
}));

// --- TOTP (app autenticadora) -----------------------------------------------
// Dos casos por ruta:
//  - con login_token: primer login de la cuenta, eligiendo la app como
//    segundo factor (todavía no hay sesión);
//  - sin login_token: la persona ya tiene sesión y activa/desactiva la app
//    desde su perfil (pasa por requireAuth, que también frena a bloqueados).
// Activar y desactivar quedan en el registro de actividad.

// Registra en audit_log una acción de la persona sobre su propia cuenta.
async function logOwnSecurityAction(req, localUser, action) {
  try {
    const actor = { id: localUser.auth_user_id, email: localUser.email, ip: req.ip };
    await db.transaction((query) => logAction(query, actor, action, localUser));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`No se pudo registrar ${action} en la actividad:`, err.message);
  }
}

// Sigue a la siguiente función de la ruta solo si NO viene login_token.
function withLoginToken(handler) {
  return asyncHandler(async (req, res, next) => {
    if (!req.body?.login_token) return next();
    return handler(req, res);
  });
}

// POST /api/auth/totp/enroll  ->  POST /auth/totp/enroll
// Devuelve { otpauth_url } para mostrar como QR. No activa nada todavía.
router.post(
  '/totp/enroll',
  withLoginToken(async (req, res) => {
    const upstream = await callAuthApi('/auth/totp/enroll', {
      body: { login_token: req.body.login_token },
    });
    forward(res, upstream);
  }),
  requireAuth,
  asyncHandler(async (req, res) => {
    const upstream = await callAuthApi('/auth/totp/enroll', {
      headers: { Authorization: `Bearer ${req.accessToken}` },
    });
    forward(res, upstream);
  })
);

// POST /api/auth/totp/confirm  ->  POST /auth/totp/confirm
// Con login_token: activa la app y completa el login (entrega tokens).
// Con sesión: activa la app y responde 204.
router.post(
  '/totp/confirm',
  withLoginToken(async (req, res) => {
    const { login_token, code } = req.body;
    const upstream = await callAuthApi('/auth/totp/confirm', { body: { login_token, code } });
    const localUser = await finishLogin(req, res, upstream);
    if (localUser && !localUser.blocked_at) await logOwnSecurityAction(req, localUser, 'totp_enabled');
  }),
  requireAuth,
  asyncHandler(async (req, res) => {
    const upstream = await callAuthApi('/auth/totp/confirm', {
      body: { code: req.body.code },
      headers: { Authorization: `Bearer ${req.accessToken}` },
    });
    if (upstream.status === 204) await logOwnSecurityAction(req, req.localUser, 'totp_enabled');
    forward(res, upstream);
  })
);

// POST /api/auth/totp/disable  ->  POST /auth/totp/disable (protegido)
// La cuenta vuelve a usar el código por correo.
router.post('/totp/disable', requireAuth, asyncHandler(async (req, res) => {
  const upstream = await callAuthApi('/auth/totp/disable', {
    body: {},
    headers: { Authorization: `Bearer ${req.accessToken}` },
  });
  if (upstream.status === 204) await logOwnSecurityAction(req, req.localUser, 'totp_disabled');
  forward(res, upstream);
}));

module.exports = router;
