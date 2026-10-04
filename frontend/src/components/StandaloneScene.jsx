import { useLocation } from 'react-router-dom';
import { CityScene } from './CityScene';

// Paisaje y luna de las pantallas de antes del login: el login, el registro,
// confirmar correo y recuperar contraseña. Vive fuera de las rutas, así que al
// pasar de una a otra queda quieto y solo cambia la tarjeta (no se corta de golpe).
// También está bajo las del segundo factor: normalmente las tapa el cielo del
// amanecer (DawnBackdrop), pero si se llega sin él (p. ej. con "adelante" del
// navegador tras volver al login) son estas las que dan el fondo.
const PATHS = [
  '/login', '/register', '/verify-email', '/forgot-password', '/confirmar-correo',
  '/verify-otp', '/aprobar-celular', '/elegir-metodo', '/configurar-app', '/pin-login',
];

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
