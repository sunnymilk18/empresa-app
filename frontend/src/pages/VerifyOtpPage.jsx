import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAfterLogin } from '../auth/useAfterLogin';

export function VerifyOtpPage() {
  const { state } = useLocation();
  const afterLogin = useAfterLogin();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  if (!state?.loginToken) return <Navigate to="/login" replace />;

  // method viene de la auth-api ('totp' o 'email'); si no llega, el texto queda
  // genérico (sirve para ambos).
  const byEmail = state.method === 'email';
  const byApp = state.method === 'totp';

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const tokens = await api.verifyOtp({ login_token: state.loginToken, code });
      await afterLogin(tokens);
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError('');
    setNotice('');
    setResending(true);
    try {
      await api.resendCode({ login_token: state.loginToken });
      setNotice('Te enviamos un código nuevo por correo. El anterior ya no sirve.');
    } catch (err) {
      // 409: la cuenta usa app autenticadora, no hay código que reenviar.
      setError(err.data?.error || err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>Código de verificación</h1>
      <p className="muted">
        {byEmail && 'Te enviamos un código de 6 dígitos a tu correo. Ingrésalo para continuar.'}
        {byApp && 'Abre tu app autenticadora e ingresa el código de 6 dígitos.'}
        {!byEmail && !byApp && 'Ingresa el código de 6 dígitos de tu app autenticadora o el que te llegó por correo.'}
      </p>
      <form onSubmit={onSubmit} className="form">
        <label>
          Código
          <input
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        {notice && <p className="success">{notice}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Verificando...' : 'Verificar e ingresar'}
        </button>
      </form>
      {!byApp && (
        <button type="button" className="link-button" style={{ marginTop: 14 }} onClick={resend} disabled={resending}>
          {resending ? 'Enviando...' : '¿No te llegó? Reenviar código por correo'}
        </button>
      )}
    </div>
  );
}
