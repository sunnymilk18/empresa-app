import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { PasswordInput } from '../components/PasswordInput';
import { useLeave } from '../utils/useLeave';

export function RegisterPage() {
  const { leaving, leaveTo, linkProps } = useLeave();
  const [form, setForm] = useState({ email: '', username: '', rut: '', password: '' });
  const [confirm, setConfirm] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const emailsDiffer = (a, b) => a.trim().toLowerCase() !== b.trim().toLowerCase();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (emailsDiffer(form.email, confirmEmail)) {
      setError('Los correos no coinciden.');
      return;
    }
    if (form.password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await api.register(form);
      // El registro no deja la cuenta lista al toque: hay que confirmar el
      // correo con el código que la auth-api acaba de enviar.
      leaveTo('/verify-email', { state: { email: form.email } });
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`auth-card auth-card--wide${leaving ? ' is-leaving' : ''}`}>
      <h1>Crear cuenta</h1>
      <form onSubmit={onSubmit} className="form">
        <div className="form-row">
          <label>
            Email
            <input type="email" required value={form.email} onChange={update('email')} />
          </label>
          <label>
            Confirmar email
            <input
              type="email"
              required
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              onPaste={(e) => e.preventDefault()}
            />
          </label>
        </div>
        {confirmEmail && emailsDiffer(form.email, confirmEmail) && <p className="error error--live">Los correos no coinciden.</p>}
        <div className="form-row">
          <label>
            Usuario
            <input
              required
              minLength={8}
              maxLength={32}
              value={form.username}
              onChange={update('username')}
            />
          </label>
          <label>
            RUT
            <input required placeholder="12345678-5" value={form.rut} onChange={update('rut')} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Contraseña
            <PasswordInput
              required
              minLength={8}
              value={form.password}
              onChange={update('password')}
            />
          </label>
          <label>
            Confirmar contraseña
            <PasswordInput
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        </div>
        {confirm && form.password !== confirm && <p className="error error--live">Las contraseñas no coinciden.</p>}
        {error && error !== 'Las contraseñas no coinciden.' && error !== 'Los correos no coinciden.' && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Creando...' : 'Registrarme'}
        </button>
      </form>
      <div className="auth-or"><span>¿Ya tienes cuenta?</span></div>
      <Link {...linkProps('/login')} className="auth-secondary">Iniciar sesión</Link>
    </div>
  );
}
