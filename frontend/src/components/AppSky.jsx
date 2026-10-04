import { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useDawn } from '../auth/DawnContext';
import { CityScene } from './CityScene';
import { SkyLife } from './SkyLife';

const FADE_MS = 900;

// Fondo de las pantallas con sesión: noche (fondo oscuro con estrellas y luna) o
// día (cielo azul con sol, nubes, cóndores y un avión), según lo que la persona
// eligió con el botón sol/luna de la barra. Al pie lleva una franja quieta con la
// ciudad y los cerros. En CSS, body[data-phase] decide qué se ve y hace el cruce
// suave entre los dos. No se muestra en /login, que tiene su propia escena.
export function AppSky() {
  const { accessToken } = useAuth();
  const { skyMode } = useDawn();
  const { pathname } = useLocation();
  // Basta el token guardado (no hace falta esperar al perfil): así el cielo elegido
  // aparece desde el primer instante al recargar, también durante el "Cargando...".
  const visible = Boolean(accessToken) && pathname !== '/login';
  const day = skyMode === 'day';

  // La vida del cielo (animada) solo existe de día; al irse, queda lo justo para
  // que se desvanezca junto con el cielo.
  const [lifeMounted, setLifeMounted] = useState(day);
  useEffect(() => {
    if (day) {
      setLifeMounted(true);
      return undefined;
    }
    const timer = setTimeout(() => setLifeMounted(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [day]);

  // useLayoutEffect: la marca se pone antes del primer dibujo, así al recargar el día
  // ya está en el primer cuadro y las transiciones del CSS solo ocurren al pulsar el botón.
  useLayoutEffect(() => {
    if (!visible) return undefined;
    document.body.dataset.phase = skyMode;
    return () => { delete document.body.dataset.phase; };
  }, [visible, skyMode]);

  if (!visible) return null;
  return (
    <div className="app-sky" aria-hidden="true">
      <div className="sky-day" />
      <div className="sky-night-glow" />
      <div className="sky-orb sky-orb--sun" />
      <div className="sky-orb sky-orb--moon" />
      {lifeMounted && (
        <div className={`sky-life${day ? '' : ' is-leaving'}`}>
          <SkyLife />
        </div>
      )}
      <CityScene rising still />
    </div>
  );
}
