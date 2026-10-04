import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useLeave } from '../utils/useLeave';

// Pública. Para quien se equivocó al escribir su correo al registrarse y un
// administrador se lo corrigió: la auth-api le mandó un código al correo NUEVO
// y aquí lo confirma ella misma (el administrador nunca lo ve). Al terminar, la
// cuenta queda con el correo nuevo, verificado, y sus sesiones se cierran.
export function ConfirmarCorreoPage() {
  const { leaving, leaveTo, linkProps } = useLeave();
  // El correo que le llega puede traer un enlace con ?email=<correo nuevo> para dejarlo escrito.
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.confirmEmailChange({ email: email.trim(), code: code.trim() });
      leaveTo('/login', { state: { emailChanged: true } });
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`auth-card auth-card--tall${leaving ? ' is-leaving' : ''}`}>
      <Link {...linkProps('/login')} className="back-link">← Volver al inicio de sesión</Link>
      <h1>Confirmar correo nuevo</h1>
      <p className="muted">
        Un administrador corrigió el correo de tu cuenta. Escribe el correo nuevo y el código de 6
        dígitos que te enviamos ahí.
      </p>
      <form onSubmit={onSubmit} className="form">
        <label>
          Correo nuevo
          <input type="email" required autoFocus={!email} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Código
          <input required inputMode="numeric" autoFocus={Boolean(email)} value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Confirmando...' : 'Confirmar correo'}
        </button>
      </form>
    </div>
  );
}
