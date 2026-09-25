const jwt = require('jsonwebtoken');
const { createPublicKey } = require('crypto');
const config = require('../config');
const { getOrCreateLocalUser } = require('../lib/localUsers');

// --- Verificación local del access token (RS256) ---------------------------
// auth-2fa-api-go publica su clave pública en /.well-known/jwks.json para
// que cualquier sistema consumidor verifique tokens SIN llamar de vuelta a
// la API en cada request. Acá hacemos exactamente eso: no reimplementamos
// login ni OTP, solo verificamos la firma del token que la auth-api ya
// emitió. El cache evita pedir el JWKS en cada petición; se refresca solo
// si aparece un "kid" que no conocemos (p. ej. tras una rotación de clave).
let jwksCache = { keys: {}, fetchedAt: 0 };
const JWKS_TTL_MS = 10 * 60 * 1000; // 10 minutos

async function fetchJWKS() {
  const res = await fetch(`${config.authApiUrl}/.well-known/jwks.json`);
  if (!res.ok) throw new Error('No se pudo obtener el JWKS de la auth-api');
  const body = await res.json();
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
  const isStale = Date.now() - jwksCache.fetchedAt > JWKS_TTL_MS;
  if (!jwksCache.keys[kid] || isStale) {
    await fetchJWKS();
  }
  return jwksCache.keys[kid];
}

// Middleware: exige "Authorization: Bearer <access_token>" válido, emitido
// por auth-2fa-api-go. Además resuelve/crea el rol local (admin/user) del
// usuario y lo deja en req.localUser.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Falta el header Authorization Bearer' });
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
    req.localUser = await getOrCreateLocalUser(claims.sub, claims.email);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado', detail: err.message });
  }
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
