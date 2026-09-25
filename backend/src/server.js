const express = require('express');
const cors = require('cors');
const config = require('./config');
const db = require('./db');
const { AuthApiUnavailableError } = require('./lib/authApi');
const { AdminChangeError } = require('./lib/localUsers');

const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Cliente de la auth-api externa (register/login/verify-otp/refresh/...)
app.use('/api/auth', authRoutes);

// Perfil propio + panel del superadmin (usuarios, roles, bloqueos,
// historial de inicios de sesión, actividad y resumen)
app.use('/api', meRoutes);

app.use((err, req, res, next) => {
  if (err instanceof AuthApiUnavailableError) {
    // eslint-disable-next-line no-console
    console.error(`auth-api no disponible (${req.method} ${req.path}):`, err.cause?.message || err.cause);
    return res.status(503).json({ error: err.message, code: 'auth_api_unavailable' });
  }
  // Acción de administración rechazada por una regla (no es un fallo interno).
  if (err instanceof AdminChangeError) {
    return res.status(err.status).json({ error: err.message });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Red de seguridad: una promesa rechazada que se escape de algún handler no
// debe tumbar todo el backend (Node termina el proceso por defecto).
process.on('unhandledRejection', (err) => {
  // eslint-disable-next-line no-console
  console.error('Promesa rechazada sin manejar:', err);
});

// Crea las tablas si no existen antes de aceptar peticiones.
db.init()
  .then(() => {
    app.listen(config.port, () => {
      // eslint-disable-next-line no-console
      console.log(`empresa-backend escuchando en http://localhost:${config.port}`);
      // eslint-disable-next-line no-console
      console.log(`Consumiendo auth-api en ${config.authApiUrl}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('No se pudo inicializar la base de datos Postgres:', err.message);
    process.exit(1);
  });
