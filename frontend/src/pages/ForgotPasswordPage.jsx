import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useLeave } from '../utils/useLeave';

// Flujo de 2 pasos, igual al de la auth-api:
//   1. pedir el código (la respuesta es la misma exista o no la cuenta)
//   2. confirmar con el código + la nueva contraseña
export function ForgotPasswordPage() {
  const { leaving, leaveTo, linkProps } = useLeave();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function onRequest(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.requestPasswordReset({ email });
      setMessage(res.message || 'Si el correo está registrado, se envió un código.');
      setStep(2);
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onConfirm(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) return; // el aviso ya se muestra bajo el campo
    setLoading(true);
    try {
      await api.confirmPasswordReset({ email, code, new_password: newPassword });
      leaveTo('/login', { state: { passwordReset: true } });
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`auth-card${leaving ? ' is-leaving' : ''}`}>
      <h1>Recuperar contraseña</h1>

      {step === 1 && (
        <form onSubmit={onRequest} className="form">
          <p className="muted">Ingresa tu email y te mandamos un código para restablecerla.</p>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar código'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={onConfirm} className="form">
          {message && <p className="success">{message}</p>}
          <label>
            Código
            <input required value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label>
            Nueva contraseña
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <label>
            Confirmar nueva contraseña
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {confirm && newPassword !== confirm && <p className="error error--live">Las contraseñas no coinciden.</p>}
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </form>
      )}

      <p className="muted">
        <Link {...linkProps('/login')}>Volver a inicio de sesión</Link>
      </p>
    </div>
  );
}
