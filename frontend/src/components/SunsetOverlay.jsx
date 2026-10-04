import { useEffect } from 'react';
import { useDawn } from '../auth/DawnContext';
import { CityScene } from './CityScene';
import { SkyOpening } from './SkyOpening';

const SUNSET_MS = 2700;

// Atardecer al cerrar sesión: el cielo del día se apaga y el sol baja tras los
// cerros hasta quedar en el valle, justo como se ve el login en reposo, así que
// al desvanecerse esta capa el login ya está debajo, sin saltos. Reutiliza el
// cielo y el paisaje del amanecer; los tiempos están en .sunset-overlay (CSS).
export function SunsetOverlay() {
  const { sunset, setSunset } = useDawn();

  useEffect(() => {
    if (!sunset) return undefined;
    const timer = setTimeout(() => setSunset(false), SUNSET_MS);
    return () => clearTimeout(timer);
  }, [sunset, setSunset]);

  if (!sunset) return null;
  return (
    <div className="sunset-overlay" aria-hidden="true">
      <SkyOpening />
      <CityScene rising />
    </div>
  );
}
