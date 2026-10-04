import { createContext, useContext, useState } from 'react';

// dawn: el día (cielo azul, sol, paisaje) está activo de fondo; se enciende al
// iniciar sesión bien y se queda mientras la persona pasa por las pantallas del
// segundo factor (ver DawnBackdrop).
// sunset: el sol se está poniendo porque la persona cerró sesión (ver SunsetOverlay).
// skyMode: el cielo que eligió ('night' | 'day') con el botón sol/luna; se recuerda
// en este navegador (ver AppSky).
const DawnContext = createContext(null);

const SKY_KEY = 'empresa_app_sky';

export function DawnProvider({ children }) {
  const [dawn, setDawn] = useState(false);
  const [sunset, setSunset] = useState(false);
  const [skyMode, setSkyModeState] = useState(() => {
    try {
      return localStorage.getItem(SKY_KEY) === 'day' ? 'day' : 'night';
    } catch {
      return 'night';
    }
  });

  function setSkyMode(mode) {
    setSkyModeState(mode);
    try {
      localStorage.setItem(SKY_KEY, mode);
    } catch {
      // sin almacenamiento (modo privado): la elección dura solo esta visita
    }
  }

  return <DawnContext.Provider value={{ dawn, setDawn, sunset, setSunset, skyMode, setSkyMode }}>{children}</DawnContext.Provider>;
}

export const useDawn = () => useContext(DawnContext);
