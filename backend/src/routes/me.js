const express = require('express');
const config = require('../config');
const { requireAuth, requireRole } = require('../middleware/auth');
const { listLocalUsers, setRole } = require('../lib/localUsers');

const router = express.Router();

// GET /api/me  (protegido)
// Ejemplo de "ruta protegida" real: exige el access_token emitido por la
// auth-api. Enriquecemos el perfil llamando a GET /me de la auth-api con
// ese mismo token (para traer username/rut, que no viajan en el JWT) y lo
// combinamos con el rol de negocio que vive en NUESTRA base local.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const upstream = await fetch(`${config.authApiUrl}/me`, {
      headers: { Authorization: `Bearer ${req.accessToken}` },
    });
    const authProfile = upstream.ok ? await upstream.json() : null;

    res.json({
      ...authProfile,
      id: req.authUser.id,
      email: req.authUser.email,
      role: req.localUser.role,
    });
  } catch (err) {
    res.status(502).json({ error: 'No se pudo consultar el perfil en la auth-api' });
  }
});

// GET /api/local-users  (solo admin) - lista quién tiene qué rol localmente
router.get('/local-users', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ users: listLocalUsers() });
});

// PUT /api/local-users/:authUserId/role  (solo admin) - promover/degradar
router.put('/local-users/:authUserId/role', requireAuth, requireRole('admin'), (req, res) => {
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'role debe ser "admin" o "user"' });
  }
  const updated = setRole(req.params.authUserId, role);
  res.json({ user: updated });
});

module.exports = router;
