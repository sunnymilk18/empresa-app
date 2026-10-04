import { useEffect } from 'react';
import { useDawn } from '../auth/DawnContext';
import { CityScene } from './CityScene';
import { SkyOpening } from './SkyOpening';

const SUNSET_MS = 2700;

// Transición al cerrar sesión, hacia el login en reposo (sol en el valle, cielo
// de noche). Si la persona tenía el día elegido, el cielo del día se apaga y el
// sol baja tras los cerros. Si tenía la noche, la noche se mantiene y el sol
// sube desde atrás de los cerros hasta el valle. En los dos casos el sol termina
// donde está el del login, así que al desvanecerse esta capa no hay saltos.
// Reutiliza el cielo y el paisaje del amanecer; los tiempos están en .sunset-overlay (CSS).
export function SunsetOverlay() {
  const { sunset, setSunset, skyMode } = useDawn();

  useEffect(() => {
    if (!sunset) return undefined;
    const timer = setTimeout(() => setSunset(false), SUNSET_MS);
    return () => clearTimeout(timer);
  }, [sunset, setSunset]);

  if (!sunset) return null;
  return (
    <div className={`sunset-overlay${skyMode === 'night' ? ' is-night' : ''}`} aria-hidden="true">
      {skyMode === 'night' ? (
        <>
          {/* La luna también va en la capa (misma esquina que la del panel y la del login): si no, la tapa y reaparece al final. */}
          <div className="sky-orb sky-orb--moon" />
          <div className="sky-sun" />
        </>
      ) : (
        <SkyOpening />
      )}
      <CityScene rising />
    </div>
  );
}
