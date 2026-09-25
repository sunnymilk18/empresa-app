const jwt = require('jsonwebtoken');
const { createPublicKey } = require('crypto');
const { getOrCreateLocalUser } = require('../lib/localUsers');
const { BLOCKED_RESPONSE } = require('../lib/blocked');
const { AuthApiUnavailableError, authApiFetch } = require('../lib/authApi');

// --- Verificación local del access token (RS256) ---------------------------
// auth-2fa-api-go publica su clave pública en /.well-known/jwks.json para
// que cualquier sistema consumidor verifique tokens SIN llamar de vuelta a
// la API en cada request. Acá hacemos exactamente eso: no reimplementamos
// login ni OTP, solo verificamos la firma del token que la auth-api ya
// emitió. El cache evita pedir el JWKS en cada petición: se refresca cada
// 10 minutos, o antes si aparece un "kid" que no conocemos (p. ej. tras una
// rotación de clave), pero como máximo una vez cada 30 s por esa vía, para
// que tokens falsos con kids inventados no disparen una descarga por request.
let jwksCache = { keys: {}, fetchedAt: 0 };
const JWKS_TTL_MS = 10 * 60 * 1000; // 10 minutos
const JWKS_MIN_REFETCH_MS = 30 * 1000; // 30 segundos

async function fetchJWKS() {
  const res = await authApiFetch('/.well-known/jwks.json');
  if (!res.ok) throw new AuthApiUnavailableError(new Error(`JWKS respondió ${res.status}`));
  const body = await res.json().catch((err) => {
    throw new AuthApiUnavailableError(err);
  });
  const keys = {};
  for (const jwk of body.keys || []) {
    keys[jwk.kid] = createPublicKey({ key: jwk, format: 'jwk' }).export({
      type: 'spki',
      format: 'pem',
    });
  }
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

async function getPublicKeyForKid(kid) {
  const age = Date.now() - jwksCache.fetchedAt;
  const isStale = age > JWKS_TTL_MS;
  const unknownKid = !jwksCache.keys[kid];
  if (isStale || (unknownKid && age > JWKS_MIN_REFETCH_MS)) {
    try {
      await fetchJWKS();
    } catch (err) {
      // Si la auth-api está caída pero ya conocemos esa clave, la seguimos
      // usando: así las sesiones abiertas no se cortan por una caída breve.
      if (!jwksCache.keys[kid]) throw err;
    }
  }
  return jwksCache.keys[kid];
}

// Middleware: exige "Authorization: Bearer <access_token>" válido, emitido
// por auth-2fa-api-go. Además resuelve/crea el usuario local (con su rol
// superadmin/admin/user) y lo deja en req.localUser; si está bloqueado,
// responde 403 aunque el token sea válido.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  // code 'invalid_token': el frontend lo usa para saber que debe renovar la
  // sesión (otros 401, como "código inválido" de la auth-api, no lo llevan).
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Falta el header Authorization Bearer', code: 'invalid_token' });
  }

  try {
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader) throw new Error('token malformado');

    const publicKeyPem = await getPublicKeyForKid(decodedHeader.header.kid);
    if (!publicKeyPem) throw new Error('kid desconocido');

    const claims = jwt.verify(token, publicKeyPem, { algorithms: ['RS256'] });
    if (claims.type !== 'access') throw new Error('el token no es un access token');

    req.authUser = { id: claims.sub, email: claims.email, clientId: claims.client_id };
    req.accessToken = token;
  } catch (err) {
    // Que la auth-api no responda no significa que el token sea inválido:
    // responder 401 haría que el frontend cierre la sesión.
    if (err instanceof AuthApiUnavailableError) return next(err);
    return res.status(401).json({ error: 'Token inválido o expirado', code: 'invalid_token', detail: err.message });
  }

  // Un fallo de la base no es un problema del token: va al handler de errores (500).
  try {
    req.localUser = await getOrCreateLocalUser(req.authUser.id, req.authUser.email);
  } catch (err) {
    return next(err);
  }
  // Bloqueado: aunque el token de la auth-api sea válido, no entra.
  if (req.localUser.blocked_at) return res.status(403).json(BLOCKED_RESPONSE);
  return next();
}

// Middleware: exige que req.localUser.role esté en la lista de roles dados.
// Se usa DESPUÉS de requireAuth.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.localUser || !roles.includes(req.localUser.role)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
