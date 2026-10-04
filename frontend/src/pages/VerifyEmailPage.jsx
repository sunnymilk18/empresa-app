import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { useLeave } from '../utils/useLeave';

export function VerifyEmailPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { leaving, linkProps } = useLeave();
  const [email, setEmail] = useState(state?.email || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.verifyEmail({ email, code });
      navigate('/login', { state: { justVerified: true } });
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    setError('');
    setMessage('');
    try {
      await api.resendVerification({ email });
      setMessage('Código reenviado. Revisa tu correo.');
    } catch (err) {
      setError(err.data?.error || err.message);
    }
  }

  return (
    <div className={`auth-card${leaving ? ' is-leaving' : ''}`}>
      <Link {...linkProps('/login')} className="back-link">← Volver al inicio de sesión</Link>
      <h1>Confirma tu correo</h1>
      <p className="muted">
        Te enviamos un código de 6 dígitos por email. Ingrésalo para poder iniciar sesión.
      </p>
      <form onSubmit={onSubmit} className="form">
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Código
          <input required value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Confirmando...' : 'Confirmar correo'}
        </button>
      </form>
      <button type="button" className="link-button" onClick={onResend}>
        Reenviar código
      </button>
    </div>
  );
}
