import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { sessionNotice } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login({ identifier, password });
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
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-brand-panel">
          <div className="auth-brand-mark">E</div>
          <p className="auth-brand-kicker">Plataforma empresarial</p>
          <h1>Bienvenido a la Empresa</h1>
          <p className="auth-brand-copy">
            Gestiona usuarios, permisos y operaciones con una experiencia segura y moderna.
          </p>
          <ul className="auth-points">
            <li>Acceso seguro</li>
            <li>Gestión centralizada</li>
            <li>Operación ágil</li>
          </ul>
        </div>

        <div className="auth-card auth-card--welcome">
          <div className="auth-badge">Acceso</div>
          <h2>Inicia sesión</h2>
          <p className="auth-subtitle">Rellene los campos para iniciar sesión</p>

          {state?.justVerified && <p className="success">Correo confirmado, ya puedes iniciar sesión.</p>}
          {sessionNotice && <p className="error">{sessionNotice}</p>}

          <form onSubmit={onSubmit} className="form">
            <label>
              Email, usuario o RUT
              <input required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {error && <p className="error">{error}</p>}

            <button type="submit" disabled={loading}>
              {loading ? 'Entrando...' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="auth-links">
            <p className="muted">
              ¿No tienes cuenta? <Link to="/register">Regístrate</Link>
            </p>
            <p className="muted">
              <Link to="/forgot-password">¿Olvidaste tu contraseña?</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
