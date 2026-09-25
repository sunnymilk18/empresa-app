import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

export function VerifyOtpPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { completeLogin } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  if (!state?.loginToken) return <Navigate to="/login" replace />;

  // Si la persona recién eligió correo, sabemos que el código va por correo.
  // En los demás logins la auth-api no avisa qué método usa la cuenta.
  const byEmail = state.method === 'email';

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const tokens = await api.verifyOtp({ login_token: state.loginToken, code });
      await completeLogin(tokens);
      navigate('/dashboard');
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
        {byEmail
          ? 'Ingresa el código de 6 dígitos que te llegó por correo.'
          : 'Ingresa el código de 6 dígitos de tu app autenticadora o el que te llegó por correo.'}
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
      <button type="button" className="link-button" style={{ marginTop: 14 }} onClick={resend} disabled={resending}>
        {resending ? 'Enviando...' : '¿No te llegó? Reenviar código por correo'}
      </button>
    </div>
  );
}
