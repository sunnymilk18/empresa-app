import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useLeave } from '../utils/useLeave';
import { useAuth } from '../auth/AuthContext';
import { useDawn } from '../auth/DawnContext';
import { FallingText } from '../components/FallingText';
import logo from '../assets/logo-muni.png';

const ICON_PROPS = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export function LoginPage() {
  const navigate = useNavigate();
  const { leaving, linkProps } = useLeave();
  const { state } = useLocation();
  const { sessionNotice } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Al iniciar sesión bien, amanece (ver DawnBackdrop) antes de cambiar de pantalla,
  // y el día se queda de fondo en las pantallas del segundo factor.
  const { setDawn } = useDawn();
  useEffect(() => setDawn(false), [setDawn]); // volver a /login apaga el día

  async function onSubmit(e) {
    e.preventDefault();
    if (loading) return; // la espera del amanecer deja una ventana para un segundo Enter
    setError('');
    setLoading(true);
    try {
      const res = await api.login({ identifier, password });
      setDawn(true);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      // needs_2fa_setup: true solo pasa en el primer login de la cuenta (si
      // el servidor ofrece más de un método): la persona elige su segundo
      // factor antes de pedir un código.
      if (res.needs_2fa_setup) {
        navigate('/elegir-metodo', { state: { loginToken: res.login_token } });
      } else if (res.push_approval_offered) {
        // La cuenta ya tiene un celular emparejado con push activado: se
        // espera la aprobación en vez de pedir el código por correo.
        navigate('/aprobar-celular', { state: { loginToken: res.login_token } });
      } else {
        navigate('/verify-otp', { state: { loginToken: res.login_token } });
      }
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`auth-shell${leaving ? ' is-leaving' : ''}`}>
      <div className="auth-panel">
        <div className="auth-brand-panel">
          <img className="auth-logo" src={logo} alt="Municipalidad de Alto Hospicio" />
          <h1><FallingText text="Panel de Gestión Municipal" /></h1>
          <p className="auth-brand-kicker">Alto Hospicio · Multicultural</p>
        </div>

        <div className="auth-card auth-card--welcome">
          <h2>Inicia sesión</h2>
          <p className="auth-subtitle">Rellene los campos para iniciar sesión</p>

          {state?.justVerified && <p className="success">Correo confirmado, ya puedes iniciar sesión.</p>}
          {sessionNotice && <p className="error">{sessionNotice}</p>}

          <form onSubmit={onSubmit} className="form">
            <label>
              Email, usuario o RUT
              <span className="field-box">
                <svg {...ICON_PROPS}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
                <input
                  required
                  autoComplete="username"
                  placeholder="nombre@correo.cl o 12.345.678-9"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </span>
            </label>
            <label>
              Contraseña
              <span className="field-box">
                <svg {...ICON_PROPS}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="field-eye"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <svg {...ICON_PROPS}>
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                    {showPassword && <path d="M4 4l16 16" />}
                  </svg>
                </button>
              </span>
            </label>

            <Link {...linkProps('/forgot-password')} className="auth-forgot">¿Olvidaste tu contraseña?</Link>

            {error && <p className="error">{error}</p>}

            <button type="submit" disabled={loading}>
              {loading ? 'Entrando...' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="auth-or"><span>¿No tienes cuenta?</span></div>
          <Link {...linkProps('/register')} className="auth-secondary">Crear cuenta</Link>
        </div>
      </div>
    </div>
  );
}
