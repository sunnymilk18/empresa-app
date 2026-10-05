import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useDawn } from '../auth/DawnContext';
import logo from '../assets/logo-muni.png';

export function Navbar() {
  const { isAuthenticated, profile, logout, loadingProfile, accessToken } = useAuth();
  const navigate = useNavigate();
  const { setSunset, skyMode, setSkyMode } = useDawn();

  // Al salir, el sol se pone (SunsetOverlay) mientras se cierra la sesión por debajo.
  async function onLogout() {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSunset(true);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    await logout();
    navigate('/login');
  }

  if (!isAuthenticated) {
    // Recargando con sesión guardada: la barra con solo el logo, del mismo alto
    // que la real, para que no empuje el contenido cuando llegue el perfil.
    if (loadingProfile && accessToken) {
      return (
        <nav className="navbar" aria-hidden="true">
          <div className="navbar-brand">
            <img className="navbar-logo" src={logo} alt="" />
          </div>
          <div className="navbar-user" style={{ visibility: 'hidden' }}>
            <button type="button" className="sky-toggle" tabIndex={-1} />
          </div>
        </nav>
      );
    }
    return null;
  }

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <img className="navbar-logo" src={logo} alt="Municipalidad de Alto Hospicio" />
      </div>
      <div className="navbar-links">
        <Link to="/dashboard">Dashboard</Link>
        {profile?.role === 'superadmin' && (
          <>
            <Link to="/usuarios">Usuarios</Link>
            <Link to="/actividad">Actividad</Link>
            {profile?.features?.authApiModeration && (
              <Link to="/cuentas-registradas">Cuentas registradas</Link>
            )}
            {profile?.features?.authApiModeration && <Link to="/bloqueos">Bloqueos</Link>}
          </>
        )}
      </div>
      <div className="navbar-user">
        <button
          type="button"
          className="sky-toggle"
          onClick={() => setSkyMode(skyMode === 'night' ? 'day' : 'night')}
          aria-label={skyMode === 'night' ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
          title={skyMode === 'night' ? 'Modo día' : 'Modo noche'}
        >
          <svg key={skyMode} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {skyMode === 'night' ? (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </>
            ) : (
              <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
            )}
          </svg>
        </button>
        <span className={`badge badge-${profile?.role}`}>{profile?.role}</span>
        <span>{profile?.username || profile?.email}</span>
        <button className="link-button" onClick={onLogout}>Salir</button>
      </div>
    </nav>
  );
}
