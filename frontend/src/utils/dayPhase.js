import { useEffect, useState } from 'react';

// Hora de Alto Hospicio (zona de Chile continental), con decimales: 14.5 = 14:30.
function chileHour() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const real = (get('hour') % 24) + get('minute') / 60;
  // Solo en desarrollo: ?hora=14 fija la hora para probar el saludo (?hora=auto la suelta).
  if (import.meta.env.DEV) {
    const param = new URLSearchParams(window.location.search).get('hora');
    if (param === 'auto') sessionStorage.removeItem('dev_hora');
    else if (param !== null) sessionStorage.setItem('dev_hora', param);
    const fixed = sessionStorage.getItem('dev_hora');
    if (fixed !== null && !Number.isNaN(Number(fixed))) return Number(fixed);
  }
  return real;
}

export const greetingOf = (hour) => (hour >= 6 && hour < 12 ? 'Buenos días' : hour >= 12 && hour < 20 ? 'Buenas tardes' : 'Buenas noches');

// La hora de Chile, actualizada cada minuto.
export function useChileHour() {
  const [hour, setHour] = useState(chileHour);
  useEffect(() => {
    const timer = setInterval(() => setHour(chileHour()), 60000);
    return () => clearInterval(timer);
  }, []);
  return hour;
}
