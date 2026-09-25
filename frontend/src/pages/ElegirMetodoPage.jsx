import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';

// Primer login de la cuenta: la persona elige su segundo factor. La auth-api
// guarda la elección recién al pedir el código por correo o al confirmar la
// app; si abandona antes, en el próximo login vuelve a ver esta pantalla.
export function ElegirMetodoPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  if (!state?.loginToken) return <Navigate to="/login" replace />;

  async function chooseEmail() {
    setError('');
    setSending(true);
    try {
      await api.sendEmailCode({ login_token: state.loginToken });
      navigate('/verify-otp', { state: { loginToken: state.loginToken, method: 'email' } });
    } catch (err) {
      setError(err.data?.error || err.message);
      setSending(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>Protege tu cuenta</h1>
      <p className="muted">
        Elige cómo quieres confirmar que eres tú cada vez que inicies sesión. Tienes 5 minutos
        para completar este paso.
      </p>

      <div className="method-options">
        <button type="button" className="method-option" onClick={chooseEmail} disabled={sending}>
          <span className="method-option-title">📧 Código por correo</span>
          <span className="method-option-text">
            Te enviaremos un código a tu correo cada vez que inicies sesión.
          </span>
        </button>

        <button
          type="button"
          className="method-option"
          disabled={sending}
          onClick={() => navigate('/configurar-app', { state: { loginToken: state.loginToken } })}
        >
          <span className="method-option-title">📱 App autenticadora</span>
          <span className="method-option-text">
            Usa Google Authenticator, Microsoft Authenticator o similar. Es más segura, pero{' '}
            <strong>si pierdes el celular no podrás entrar</strong>.
          </span>
        </button>
      </div>

      {sending && <p className="muted">Enviando el código...</p>}
      {error && (
        <p className="error">
          {error} <Link to="/login">Volver a iniciar sesión</Link>
        </p>
      )}
      <p className="muted" style={{ marginTop: 16 }}>
        Podrás cambiar de método más adelante desde tu perfil.
      </p>
    </div>
  );
}
