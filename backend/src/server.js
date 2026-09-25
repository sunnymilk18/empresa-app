const express = require('express');
const cors = require('cors');
const config = require('./config');
require('./db'); // crea el archivo SQLite y las tablas si no existen

const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');
const clientesRoutes = require('./routes/clientes');

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Cliente de la auth-api externa (register/login/verify-otp/refresh/...)
app.use('/api/auth', authRoutes);

// Perfil propio + administración de roles locales
app.use('/api', meRoutes);

// CRUD de negocio (protegido con el JWT emitido por la auth-api)
app.use('/api/clientes', clientesRoutes);

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`empresa-backend escuchando en http://localhost:${config.port}`);
  // eslint-disable-next-line no-console
  console.log(`Consumiendo auth-api en ${config.authApiUrl}`);
});
