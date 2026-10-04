import { useEffect, useState } from 'react';

// PIN de la cuenta (6 dígitos), ver README "PIN de la cuenta y acciones destructivas".
export const PIN_RE = /^\d{6}$/;

// Texto para un error al enviar el PIN. Decide por `code`, no por el texto.
export function pinErrorMessage(err) {
  const { code, attempts_left: left, retry_after_seconds: seconds } = err.data || {};
  switch (code) {
    case 'pin_invalid':
      return `PIN incorrecto. Te ${left === 1 ? 'queda 1 intento' : `quedan ${left} intentos`}.`;
    case 'pin_locked': {
      const minutes = Math.max(Math.ceil(seconds / 60), 1);
      return `PIN bloqueado. Intenta de nuevo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`;
    }
    case 'pin_invalid_format':
      return 'El PIN debe tener 6 dígitos.';
    case 'pin_required':
      return 'Ingresa tu PIN para confirmar la acción.';
    case 'pin_not_set':
      return 'Todavía no tienes un PIN. Créalo desde la tarjeta Seguridad del dashboard.';
    default:
      return err.data?.error || err.message;
  }
}

// Bloqueo temporal tras un pin_locked: [bloqueado, bloquear(segundos)].
export function usePinLock() {
  const [until, setUntil] = useState(0);
  const [, rerender] = useState(0);

  useEffect(() => {
    const ms = until - Date.now();
    if (ms <= 0) return undefined;
    const timer = setTimeout(() => rerender((n) => n + 1), ms);
    return () => clearTimeout(timer);
  }, [until]);

  return [until > Date.now(), (seconds) => setUntil(Date.now() + seconds * 1000)];
}
