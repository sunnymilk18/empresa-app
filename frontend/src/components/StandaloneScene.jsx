import { useLocation } from 'react-router-dom';
import { CityScene } from './CityScene';

// Paisaje y luna de las pantallas de antes del login: el login, el registro,
// confirmar correo y recuperar contraseña. Vive fuera de las rutas, así que al
// pasar de una a otra queda quieto y solo cambia la tarjeta (no se corta de golpe).
const PATHS = ['/login', '/register', '/verify-email', '/forgot-password'];

export function StandaloneScene() {
  const { pathname } = useLocation();
  if (!PATHS.includes(pathname)) return null;
  return (
    <>
      <div className="sky-orb sky-orb--moon standalone-moon" aria-hidden="true" />
      <div className="standalone-scene" aria-hidden="true">
        <CityScene />
      </div>
    </>
  );
}
