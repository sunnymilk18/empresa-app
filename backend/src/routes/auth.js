const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
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

// --- refresh_token en cookie httpOnly ---------------------------------------
// El refresh_token nunca llega al navegador como JSON legible por JavaScript:
// vive en una cookie httpOnly que solo viaja entre el navegador y este
// backend (ver README, "Seguridad"). path la limita a las rutas de auth, para
// que no se mande de vuelta en cada llamada a /api/me, /api/local-users, etc.
const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'lax',
  path: '/api/auth',
};

function setRefreshCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...REFRESH_COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días, igual que REFRESH_TOKEN_TTL en la auth-api
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
}

// Como forward(), pero para respuestas que pueden traer un refresh_token: lo
// saca del cuerpo y lo deja en la cookie httpOnly en vez de mandarlo al
// navegador como JSON.
// Excepción: el cliente móvil (header X-Client-Platform: mobile) no tiene
// cookies; recibe el refresh_token en el JSON y lo guarda en su almacenamiento
// seguro.
function isMobile(req) {
  return req.get('x-client-platform') === 'mobile';
}

function forwardSession(req, res, upstream) {
  const data = { ...(upstream.data ?? {}) };
  if (!isMobile(req) && data.refresh_token) {
    setRefreshCookie(res, data.refresh_token);
    delete data.refresh_token;
  }
  return res.status(upstream.status).json(data);
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
// `blockedExtra` se suma a la respuesta 403 de una cuenta bloqueada: el login
// con PIN rota el device_token en la auth-api, y si el celular no recibe el
// nuevo, tras desbloquear la cuenta su PIN dejaría de funcionar.
async function finishLogin(req, res, upstream, blockedExtra = {}) {
  const synced = await syncLocalUser(req, upstream);
  const localUser = synced?.localUser;
  if (localUser) {
    await logLoginEvent(req, localUser, synced.method, localUser.blocked_at ? 'blocked' : 'success');
  }
  if (localUser?.blocked_at) {
    await callAuthApi('/auth/logout', {
      body: { refresh_token: upstream.data.refresh_token },
    }).catch(() => {});
    clearRefreshCookie(res);
    res.status(403).json({ ...BLOCKED_RESPONSE, ...blockedExtra });
  } else {
    forwardSession(req, res, upstream);
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

// --- Aprobación de login por notificación push (celular) --------------------
// Solo aplica si el login anterior devolvió push_approval_offered=true: la
// cuenta ya tiene un celular emparejado con push activado (app auth-2fa-app).

// GET /api/auth/login/push-status  ->  GET /auth/login/push-status
// El front hace polling (~2s) mientras espera que el celular apruebe.
// status: 'pending' | 'approved' | 'rejected'. En 'approved' también trae los
// tokens, y se completa el login igual que verify-otp (historial, bloqueo).
router.get('/login/push-status', asyncHandler(async (req, res) => {
  const { login_token } = req.query;
  const upstream = await callAuthApi(
    `/auth/login/push-status?login_token=${encodeURIComponent(login_token || '')}`,
    { method: 'GET' }
  );
  await finishLogin(req, res, upstream);
}));

// POST /api/auth/login/request-email-code  ->  POST /auth/login/request-email-code
// "No puedo aprobar desde el celular": pide el código por correo como
// respaldo para un login que solo ofreció push. El login_token sigue
// sirviendo después para /verify-otp, igual que un login por correo normal.
router.post('/login/request-email-code', asyncHandler(async (req, res) => {
  const { login_token } = req.body;
  const upstream = await callAuthApi('/auth/login/request-email-code', { body: { login_token } });
  forward(res, upstream);
}));

// POST /api/auth/refresh  ->  POST /auth/refresh
// El refresh_token viene de la cookie httpOnly, nunca del cuerpo: el
// navegador no tiene forma de leerlo ni de mandarlo a mano (ver README,
// "Seguridad"). La auth-api rota el token en cada renovación; el nuevo
// también se guarda en la cookie, nunca en la respuesta JSON.
router.post('/refresh', asyncHandler(async (req, res) => {
  const refreshToken = isMobile(req) ? req.body?.refresh_token : req.cookies?.[REFRESH_COOKIE];
  if (!refreshToken) {
    // Sin cookie no hay nada que renovar: mismo code que usa el frontend
    // para decidir si vale la pena reintentar.
    return res.status(401).json({ error: 'no hay sesión que renovar', code: 'invalid_token' });
  }
  const upstream = await callAuthApi('/auth/refresh', { body: { refresh_token: refreshToken } });
  if (upstream.status !== 200) clearRefreshCookie(res);
  forwardSession(req, res, upstream);
}));

// POST /api/auth/logout  ->  POST /auth/logout
// Idem: el refresh_token a revocar sale de la cookie, no del cuerpo. Sin
// cookie no hay nada que revocar en la auth-api, pero igual se limpia la
// cookie del navegador (por si quedó una vencida o inválida).
router.post('/logout', asyncHandler(async (req, res) => {
  const refreshToken = isMobile(req) ? req.body?.refresh_token : req.cookies?.[REFRESH_COOKIE];
  if (refreshToken) {
    await callAuthApi('/auth/logout', { body: { refresh_token: refreshToken } }).catch(() => {});
  }
  clearRefreshCookie(res);
  res.status(204).end();
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

// POST /api/auth/change-email/confirm  ->  POST /auth/change-email/confirm
// Pública (como la recuperación de contraseña): la usa la propia persona, que
// puede estar sin poder entrar a la cuenta, con el código que le llegó al
// correo NUEVO tras la corrección iniciada por un superadmin. 204 si se aplicó.
router.post('/change-email/confirm', asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  const upstream = await callAuthApi('/auth/change-email/confirm', { body: { email, code } });
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

// --- PIN de la cuenta ---------------------------------------------------------
// Un solo PIN de 6 dígitos por cuenta, guardado en la auth-api: desbloquea los
// dispositivos de confianza de la app móvil y confirma las acciones
// destructivas del superadmin (ver lib/adminPin.js). Aquí solo se crea o
// cambia; el bloqueo por intentos lo lleva la auth-api.

// PUT /api/auth/pin  ->  PUT /auth/pin   (con sesión)
// Crea el PIN (solo `pin`) o lo cambia (`pin` + `current_pin`).
router.put('/pin', requireAuth, asyncHandler(async (req, res) => {
  const { pin, current_pin: currentPin } = req.body;
  const upstream = await callAuthApi('/auth/pin', {
    method: 'PUT',
    body: { pin, current_pin: currentPin },
    headers: { Authorization: `Bearer ${req.accessToken}` },
  });
  if (upstream.status === 204) {
    await logOwnSecurityAction(req, req.localUser, currentPin ? 'pin_changed' : 'pin_set');
  }
  forward(res, upstream);
}));

// --- Dispositivos de confianza, PIN y push (app móvil) -----------------------
// Solo los usa la app móvil; la web no tiene estas pantallas. Todas, salvo el
// login con PIN, exigen sesión (requireAuth, que también frena a bloqueados).

// Reenvía a la auth-api una llamada autenticada con el access token de la sesión.
function proxyWithSession(method, path, upstreamPath) {
  router[method](path, requireAuth, asyncHandler(async (req, res) => {
    const upstream = await callAuthApi(upstreamPath(req), {
      method: method.toUpperCase(),
      body: ['post', 'put'].includes(method) ? req.body : undefined,
      headers: { Authorization: `Bearer ${req.accessToken}` },
    });
    forward(res, upstream);
  }));
}

// POST /api/auth/devices/login  ->  POST /auth/devices/login
// Entra con PIN, sin contraseña ni código. Es un login más: pasa por
// finishLogin para frenar cuentas bloqueadas y quedar en el historial. El
// device_token rotado viaja en el JSON junto a los tokens.
router.post('/devices/login', asyncHandler(async (req, res) => {
  const { device_id, device_token, pin } = req.body;
  const upstream = await callAuthApi('/auth/devices/login', {
    body: { device_id, device_token, pin },
  });
  const rotated = isMobile(req) ? { device_token: upstream.data?.device_token } : {};
  await finishLogin(req, res, upstream, rotated);
}));

proxyWithSession('post', '/devices/register', () => '/auth/devices/register');
proxyWithSession('get', '/devices', () => '/auth/devices');
proxyWithSession('delete', '/devices/:id', (req) => `/auth/devices/${encodeURIComponent(req.params.id)}`);
proxyWithSession('post', '/devices/:id/push', (req) => `/auth/devices/${encodeURIComponent(req.params.id)}/push`);
proxyWithSession('delete', '/devices/:id/push', (req) => `/auth/devices/${encodeURIComponent(req.params.id)}/push`);
proxyWithSession('post', '/login/push-answer', () => '/auth/login/push-answer');

module.exports = router;
