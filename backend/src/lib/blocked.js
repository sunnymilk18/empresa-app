// Respuesta única para cuentas bloqueadas; el frontend reconoce el `code`
// para cerrar la sesión y mostrar el aviso en /login.
const BLOCKED_RESPONSE = {
  error: 'Tu cuenta está bloqueada. Contacta al administrador.',
  code: 'account_blocked',
};

module.exports = { BLOCKED_RESPONSE };
