import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { PinField } from '../components/PinField';

// Último paso del login de las cuentas con PIN obligatorio (superadmin): ya
// pasaron la contraseña y el segundo factor, pero no hay sesión hasta ingresar
// el PIN. Si la cuenta todavía no tiene uno (pinSet false), se crea aquí mismo.
export function PinLoginPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { completeLogin } = useAuth();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!state?.pinToken) return <Navigate to="/login" replace />;
  const creating = state.pinSet === false;

  function describe(err) {
    if (err.status === 401) return 'La sesión de ingreso expiró. Vuelve a iniciar sesión.';
    const d = err.data || {};
    if (d.code === 'pin_invalid') {
      const n = d.attempts_left;
      return n === undefined ? 'PIN incorrecto.' : `PIN incorrecto. Te ${n === 1 ? 'queda 1 intento' : `quedan ${n} intentos`}.`;
    }
    if (d.code === 'pin_locked') {
      const min = Math.max(1, Math.ceil((d.retry_after_seconds || 0) / 60));
      return `PIN bloqueado por demasiados intentos. Intenta de nuevo en ${min} min.`;
    }
    return d.error || err.message;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (pin.length !== 6) {
      setError('El PIN tiene 6 dígitos.');
      return;
    }
    if (creating && pin !== confirm) {
      setError('Los PIN no coinciden.');
      return;
    }
    setLoading(true);
    try {
      const tokens = await api.loginPin({ pin_token: state.pinToken, pin, create: creating });
      await completeLogin(tokens);
      navigate('/dashboard');
    } catch (err) {
      setPin('');
      setConfirm('');
      setExpired(err.status === 401);
      setError(describe(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card auth-card--tall">
      <h1>{creating ? 'Crea tu PIN' : 'Ingresa tu PIN'}</h1>
      <p className="muted">
        {creating
          ? 'Tu cuenta exige un PIN de 6 dígitos para entrar. Elígelo ahora: lo pedirá en cada inicio de sesión y para confirmar acciones importantes.'
          : 'Último paso: escribe el PIN de 6 dígitos de tu cuenta.'}
      </p>
      <form onSubmit={onSubmit} className="form">
        <PinField label={creating ? 'Nuevo PIN' : 'PIN'} value={pin} onChange={setPin} disabled={loading || expired} autoFocus />
        {creating && <PinField label="Confirmar PIN" value={confirm} onChange={setConfirm} disabled={loading || expired} />}
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading || expired}>
          {loading ? 'Verificando...' : creating ? 'Crear PIN y entrar' : 'Entrar'}
        </button>
      </form>
      {expired && <Link to="/login" className="auth-secondary" style={{ marginTop: 14 }}>Volver al inicio de sesión</Link>}
    </div>
  );
}
