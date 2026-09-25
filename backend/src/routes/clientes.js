const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// CRUD de "clientes" - el recurso de negocio de ejemplo. Vive en la base
// SQLite propia de la empresa, totalmente separada de la base de la
// auth-api. Regla de permisos de la demo:
//   - admin y user: pueden LISTAR y VER
//   - solo admin: puede CREAR, EDITAR y ELIMINAR
router.use(requireAuth);

const listStmt = db.prepare('SELECT * FROM clientes ORDER BY created_at DESC');
const getStmt = db.prepare('SELECT * FROM clientes WHERE id = $1');
const insertStmt = db.prepare(`
  INSERT INTO clientes (nombre, email, telefono, empresa, notas, created_by)
  VALUES ($1, $2, $3, $4, $5, $6)
`);
const updateStmt = db.prepare(`
  UPDATE clientes
  SET nombre = $1, email = $2, telefono = $3,
      empresa = $4, notas = $5, updated_at = NOW()
  WHERE id = $6
`);
const deleteStmt = db.prepare('DELETE FROM clientes WHERE id = $1');

// GET /api/clientes
router.get('/', async (req, res) => {
  const clientes = await listStmt.all();
  res.json({ clientes });
});

// GET /api/clientes/:id
router.get('/:id', async (req, res) => {
  const cliente = await getStmt.get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json({ cliente });
});

// POST /api/clientes  (solo admin)
router.post('/', requireRole('admin'), async (req, res) => {
  const { nombre, email, telefono, empresa, notas } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es obligatorio' });

  const info = await insertStmt.run(
    nombre,
    email || null,
    telefono || null,
    empresa || null,
    notas || null,
    req.authUser.id
  );
  const cliente = await getStmt.get(info.lastInsertRowid);
  res.status(201).json({ cliente });
});

// PUT /api/clientes/:id  (solo admin)
router.put('/:id', requireRole('admin'), async (req, res) => {
  const existing = await getStmt.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });

  const { nombre, email, telefono, empresa, notas } = req.body;
  await updateStmt.run(
    nombre ?? existing.nombre,
    email ?? existing.email,
    telefono ?? existing.telefono,
    empresa ?? existing.empresa,
    notas ?? existing.notas,
    req.params.id
  );
  const cliente = await getStmt.get(req.params.id);
  res.json({ cliente });
});

// DELETE /api/clientes/:id  (solo admin)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const existing = await getStmt.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });
  await deleteStmt.run(req.params.id);
  res.status(204).send();
});

module.exports = router;
