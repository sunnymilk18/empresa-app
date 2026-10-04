import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAfterLogin } from '../auth/useAfterLogin';
import { TotpSetup } from '../components/TotpSetup';

// Primer login eligiendo la app autenticadora: QR + primer código. Al
// confirmarlo, la auth-api activa la app y entrega la sesión directamente.
export function ConfigurarAppPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const afterLogin = useAfterLogin();
  const [error, setError] = useState('');
  const [switching, setSwitching] = useState(false);

  if (!state?.loginToken) return <Navigate to="/login" replace />;

  async function onConfirmed(tokens) {
    await afterLogin(tokens);
  }

  // Arrepentirse: el mismo login_token sirve para elegir correo, mientras no
  // se haya confirmado la app.
  async function useEmailInstead() {
    setError('');
    setSwitching(true);
    try {
      await api.sendEmailCode({ login_token: state.loginToken });
      navigate('/verify-otp', { state: { loginToken: state.loginToken, method: 'email' } });
    } catch (err) {
      setError(err.data?.error || err.message);
      setSwitching(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>Configura tu app autenticadora</h1>
      <TotpSetup loginToken={state.loginToken} onConfirmed={onConfirmed}>
        <div className="totp-alt">
          <button type="button" className="table-action" onClick={useEmailInstead} disabled={switching}>
            {switching ? 'Enviando código...' : 'Prefiero usar código por correo'}
          </button>
          {error && (
            <p className="error">
              {error} <Link to="/login">Volver a iniciar sesión</Link>
            </p>
          )}
        </div>
      </TotpSetup>
    </div>
  );
}
