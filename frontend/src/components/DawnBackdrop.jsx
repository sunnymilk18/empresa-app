import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useDawn } from '../auth/DawnContext';
import { CityScene } from './CityScene';
import { SkyOpening } from './SkyOpening';

// Pantallas por las que pasa quien acaba de iniciar sesión (código, push,
// elegir método, configurar app). En cualquier otra, el día se apaga.
const AUTH_FLOW = ['/login', '/verify-otp', '/aprobar-celular', '/elegir-metodo', '/configurar-app'];
const FADE_OUT_MS = 800;

// Fondo global del "amanecer" (cielo, nubes, aves, sol y paisaje). Vive fuera de
// las rutas para sobrevivir al cambio de pantalla: en /login queda sobre el
// formulario (CSS: body:has(.auth-shell)) y en las demás, detrás de su contenido.
export function DawnBackdrop() {
  const { dawn, setDawn } = useDawn();
  const { pathname } = useLocation();
  const [mounted, setMounted] = useState(dawn);

  useEffect(() => {
    if (dawn && !AUTH_FLOW.includes(pathname)) setDawn(false);
  }, [dawn, pathname, setDawn]);

  useEffect(() => {
    if (dawn) {
      setMounted(true);
      return undefined;
    }
    const timer = setTimeout(() => setMounted(false), FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [dawn]);

  if (!mounted) return null;
  return (
    <div className={`dawn-backdrop${dawn ? '' : ' is-leaving'}`} aria-hidden="true">
      <SkyOpening />
      <CityScene rising />
      <div className="auth-dawn" />
    </div>
  );
}
