const config = require('../config');
const { callAuthApi } = require('./authApi');

// Confirmación con el PIN de la cuenta para las acciones destructivas del
// superadmin (cambiar rol, bloquear/desbloquear, cerrar sesiones, desactivar
// la app autenticadora de otra persona, resetear su PIN).
//
// El PIN es de la cuenta y vive en la auth-api, que lo verifica y lleva el
// bloqueo por intentos (POST /auth/pin/verify): aquí solo se lo preguntamos
// con la sesión de quien actúa. Va en el servidor y no en la pantalla porque
// un token robado podría llamar a la API directo y saltarse un control que
// solo viviera en el frontend.
//
// Con ADMIN_PIN_ENFORCED apagado (por defecto) no pide nada: permite
// desplegar el backend antes que las apps y encenderlo cuando ya lo envíen.
//
// El cliente manda el PIN en el cuerpo, campo `pin`. Errores (todos con
// `code`, para que las apps decidan sin leer el texto):
//   400 pin_invalid_format  - no son 6 dígitos (no gasta un intento)
//   403 pin_required        - no mandó el PIN
//   403 pin_invalid         - incorrecto; trae attempts_left
//   423 pin_locked          - bloqueado; trae retry_after_seconds
//   409 pin_not_set         - la cuenta aún no tiene PIN: debe crearlo primero
function createRequireAdminPin({ call, isEnforced }) {
  return async function requireAdminPin(req, res, next) {
    if (!isEnforced()) return next();

    const pin = req.body?.pin;
    if (pin === undefined || pin === null || pin === '') {
      return res.status(403).json({ error: 'Ingresa tu PIN para confirmar la acción', code: 'pin_required' });
    }
    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: 'El PIN debe tener exactamente 6 dígitos', code: 'pin_invalid_format' });
    }

    try {
      const upstream = await call('/auth/pin/verify', {
        body: { pin },
        headers: { Authorization: `Bearer ${req.accessToken}` },
      });
      if (upstream.status === 204 || upstream.status === 200) return next();
      // La sesión que verificó este backend ya no vale para la auth-api
      // (p. ej. revocada): mismo code que usan las apps para renovarla.
      if (upstream.status === 401) {
        return res.status(401).json({ error: 'Token inválido o expirado', code: 'invalid_token' });
      }
      return res.status(upstream.status).json(upstream.data ?? {});
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  createRequireAdminPin,
  requireAdminPin: createRequireAdminPin({
    call: callAuthApi,
    isEnforced: () => config.adminPinEnforced,
  }),
};
