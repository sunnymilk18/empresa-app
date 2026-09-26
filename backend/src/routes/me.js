const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const config = require('../config');
const {
  ROLES,
  getLocalUser,
  listLocalUsers,
  setRole,
  setBlocked,
  runIdentityAction,
} = require('../lib/localUsers');
const { listAuditLog } = require('../lib/audit');
const { listLoginHistory } = require('../lib/loginHistory');
const { getDashboardStats } = require('../lib/stats');
const { authApiFetch, SYSTEM_ADMIN_MESSAGES } = require('../lib/authApi');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

// Paginación por id: ?before=<id>&limit=<n> (1 a 200, 50 por defecto).
// `before` fuera del rango de un INTEGER de Postgres se ignora.
const MAX_INT = 2147483647;
function pageParams(req) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const raw = /^\d+$/.test(req.query.before || '') ? Number(req.query.before) : null;
  const before = raw !== null && raw <= MAX_INT ? raw : null;
  return { before, limit };
}

// Quién está haciendo la acción, para el registro de auditoría.
function actorOf(req) {
  return { id: req.authUser.id, email: req.authUser.email, ip: req.ip };
}

// GET /api/me  (protegido)
// Ejemplo de "ruta protegida" real: exige el access_token emitido por la
// auth-api. Enriquecemos el perfil llamando a GET /me de la auth-api con
// ese mismo token (para traer username/rut, que no viajan en el JWT) y lo
// combinamos con el rol de negocio que vive en NUESTRA base local.
// Si la auth-api no responde, usamos el username/rut guardados en el último
// login, para que una caída suya no deje a nadie sin perfil.
router.get('/me', requireAuth, async (req, res) => {
  let authProfile = null;
  try {
    const upstream = await authApiFetch('/me', {
      headers: { Authorization: `Bearer ${req.accessToken}` },
    });
    if (upstream.ok) authProfile = await upstream.json();
  } catch {
    // auth-api caída o respuesta inválida: seguimos con los datos locales
  }

  res.json({
    username: req.localUser.username,
    rut: req.localUser.rut,
    ...authProfile,
    id: req.authUser.id,
    email: req.authUser.email,
    role: req.localUser.role,
    // Qué funciones opcionales tiene este backend, para que el panel muestre
    // u oculte los botones que dependen de ellas.
    features: { authApiModeration: Boolean(config.authApiSystemAdminToken) },
  });
});

// GET /api/stats  (solo superadmin) - resumen para el dashboard
router.get('/stats', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  res.json(await getDashboardStats());
}));

// GET /api/local-users?q=&role=&status=&page=&pageSize=  (solo superadmin)
// Personas que completaron el login, con búsqueda, filtros y paginación.
router.get('/local-users', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const role = ROLES.includes(req.query.role) ? req.query.role : null;
  const status = ['active', 'blocked'].includes(req.query.status) ? req.query.status : null;
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const { users, total } = await listLocalUsers({
    q,
    role,
    status,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  res.json({ users, total, page, pageSize });
}));

// PUT /api/local-users/:authUserId/role  (solo superadmin) - cambiar rol
router.put('/local-users/:authUserId/role', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: `role debe ser uno de: ${ROLES.join(', ')}` });
  }
  // Evita que el sistema quede sin superadmin por un error propio.
  if (req.params.authUserId === req.authUser.id) {
    return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
  }
  const updated = await setRole(req.params.authUserId, role, actorOf(req));
  if (!updated) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ user: updated });
}));

// PUT /api/local-users/:authUserId/blocked  (solo superadmin) - bloquear/desbloquear
router.put('/local-users/:authUserId/blocked', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const { blocked } = req.body;
  if (typeof blocked !== 'boolean') {
    return res.status(400).json({ error: 'blocked debe ser true o false' });
  }
  if (req.params.authUserId === req.authUser.id) {
    return res.status(400).json({ error: 'No puedes bloquearte a ti mismo' });
  }
  const result = await setBlocked(req.params.authUserId, blocked, actorOf(req));
  if (!result) return res.status(404).json({ error: 'Usuario no encontrado' });
  // authApi: cómo terminó en la auth-api ('ok', 'not_found', 'unavailable',
  // 'unauthorized', 'disabled' o null si no hubo nada que hacer). El cambio
  // local ya quedó aplicado en cualquier caso; `warning` explica si falta algo.
  res.json({
    user: result.user,
    authApi: result.authApi,
    warning: result.authApi && result.authApi !== 'ok' && result.authApi !== 'disabled'
      ? SYSTEM_ADMIN_MESSAGES[result.authApi]
      : undefined,
  });
}));

// Códigos HTTP para una acción de la auth-api que no se pudo aplicar.
const IDENTITY_ACTION_STATUS = { not_found: 404, unauthorized: 502, unavailable: 503, disabled: 503 };

// POST /api/local-users/:authUserId/revoke-sessions  (solo superadmin)
// POST /api/local-users/:authUserId/disable-totp     (solo superadmin)
// Cierran todas las sesiones de la persona, o le desactivan la app
// autenticadora (p. ej. perdió el celular), en la auth-api. No se permiten
// sobre la propia cuenta: para eso están "Salir" y la tarjeta Seguridad.
for (const action of ['revoke-sessions', 'disable-totp']) {
  router.post(`/local-users/:authUserId/${action}`, requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
    if (req.params.authUserId === req.authUser.id) {
      return res.status(400).json({ error: 'Esta acción no se puede usar sobre tu propia cuenta' });
    }
    const result = await runIdentityAction(req.params.authUserId, action, actorOf(req));
    if (!result) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (result.authApi !== 'ok') {
      return res
        .status(IDENTITY_ACTION_STATUS[result.authApi])
        .json({ error: SYSTEM_ADMIN_MESSAGES[result.authApi], code: `auth_api_${result.authApi}` });
    }
    res.json({ user: result.user });
  }));
}

// GET /api/local-users/:authUserId/logins?before=<id>&limit=<n>  (solo superadmin)
// Datos de la persona + su historial de inicios de sesión.
router.get('/local-users/:authUserId/logins', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const user = await getLocalUser(req.params.authUserId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const { before, limit } = pageParams(req);
  const logins = await listLoginHistory(user.auth_user_id, { before, limit });
  res.json({ user, logins, hasMore: logins.length === limit });
}));

// GET /api/audit-log?before=<id>&limit=<n>  (solo superadmin)
router.get('/audit-log', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const { before, limit } = pageParams(req);
  const entries = await listAuditLog({ before, limit });
  res.json({ entries, hasMore: entries.length === limit });
}));

module.exports = router;
