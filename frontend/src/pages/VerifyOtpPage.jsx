import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

export function VerifyOtpPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { completeLogin } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!state?.loginToken) {
    navigate('/login', { replace: true });
    return null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
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

  return (
    <div className="auth-card">
      <h1>Código de verificación</h1>
      <p className="muted">Ingresa el código OTP de 6 dígitos que te llegó por correo.</p>
      <form onSubmit={onSubmit} className="form">
        <label>
          Código
          <input required autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Verificando...' : 'Verificar e ingresar'}
        </button>
      </form>
    </div>
  );
}
