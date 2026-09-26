// Textos compartidos de bloqueo/moderación (tabla de Usuarios y detalle).

// Confirmación antes de bloquear. Con la moderación en la auth-api activa,
// bloquear también cierra todas las sesiones de la persona.
export function blockConfirmText(email, moderationEnabled) {
  return moderationEnabled
    ? `¿Bloquear a ${email}? No podrá entrar al sistema hasta que lo desbloquees, y se cerrarán todas sus sesiones.`
    : `¿Bloquear a ${email}? No podrá entrar al sistema hasta que lo desbloquees.`;
}

// Explicación de un ban/unban que quedó pendiente en la auth-api.
export function pendingText(action) {
  return action === 'ban'
    ? 'Bloqueado aquí, pero falta aplicarlo en el servicio de autenticación.'
    : 'Desbloqueado aquí, pero falta aplicarlo en el servicio de autenticación.';
}
