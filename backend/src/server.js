const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config');
const db = require('./db');
const { AuthApiUnavailableError, rememberClientIp } = require('./lib/authApi');
const { AdminChangeError } = require('./lib/localUsers');
const { scheduleRetention } = require('./lib/retention');

const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');

const app = express();

// Detrás de un proxy (Traefik en Dokploy) la IP real del cliente viene en
// X-Forwarded-For; sin esto req.ip sería siempre la del proxy y el historial
// de inicios de sesión guardaría esa. Un solo salto de confianza.
app.set('trust proxy', 1);
app.use(rememberClientIp);

// credentials: true porque el refresh_token viaja en una cookie httpOnly
// (ver routes/auth.js) — el navegador solo la manda entre orígenes si el
// backend responde con Access-Control-Allow-Credentials, y solo hacia un
// origin explícito, nunca "*".
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

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
      const plazo = (days) => (days ? `${days} días` : 'sin límite');
      // eslint-disable-next-line no-console
      console.log(
        `Retención: historial ${plazo(config.loginHistoryRetentionDays)}, ` +
          `actividad ${plazo(config.auditLogRetentionDays)}`
      );
      scheduleRetention();
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('No se pudo inicializar la base de datos Postgres:', err.message);
    process.exit(1);
  });
