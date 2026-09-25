import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', rut: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.register(form);
      // El registro no deja la cuenta lista al toque: hay que confirmar el
      // correo con el código que la auth-api acaba de enviar.
      navigate('/verify-email', { state: { email: form.email } });
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>Crear cuenta</h1>
      <p className="muted">Se registra contra la auth-api externa.</p>
      <form onSubmit={onSubmit} className="form">
        <label>
          Email
          <input type="email" required value={form.email} onChange={update('email')} />
        </label>
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
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Creando...' : 'Registrarme'}
        </button>
      </form>
      <p className="muted">
        ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
      </p>
    </div>
  );
}
