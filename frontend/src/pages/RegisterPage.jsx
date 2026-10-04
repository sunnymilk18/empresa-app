import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useLeave } from '../utils/useLeave';

export function RegisterPage() {
  const { leaving, leaveTo, linkProps } = useLeave();
  const [form, setForm] = useState({ email: '', username: '', rut: '', password: '' });
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
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
        <label>
          Email
          <input type="email" required value={form.email} onChange={update('email')} />
        </label>
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
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={update('password')}
            />
          </label>
          <label>
            Confirmar contraseña
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        </div>
        {confirm && form.password !== confirm && <p className="error">Las contraseñas no coinciden.</p>}
        {error && error !== 'Las contraseñas no coinciden.' && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Creando...' : 'Registrarme'}
        </button>
      </form>
      <p className="muted">
        ¿Ya tienes cuenta? <Link {...linkProps('/login')}>Inicia sesión</Link>
      </p>
    </div>
  );
}
