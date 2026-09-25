import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { describeUserAgent } from '../utils/userAgent';

// Tarjeta de un número. Con `to`, es un enlace (p. ej. a Usuarios filtrado).
function Stat({ label, value, hint, to, alert = false }) {
  const className = `stat${alert ? ' stat--alert' : ''}`;
  const content = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );
  return to ? (
    <Link to={to} className={`${className} stat--link`}>{content}</Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

// Resumen del sistema para el superadmin: usuarios, accesos de los últimos
// 7 días y los inicios de sesión más recientes.
export function AdminSummary() {
  const { accessToken } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getStats(accessToken)
      .then(setStats)
      .catch((err) => setError(err.data?.error || err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="error">No se pudo cargar el resumen: {error}</p>;
  if (!stats) return <p className="muted">Cargando resumen...</p>;

  const { users, logins, recentLogins } = stats;

  return (
    <section className="summary">
      <h2>Resumen</h2>

      <div className="stat-grid">
        <Stat label="Usuarios" value={users.total} to="/usuarios" />
        <Stat label="Entraron" value={users.active_last_7d} hint="últimos 7 días" />
        <Stat label="Nuevos" value={users.new_last_7d} hint="últimos 7 días" />
        <Stat
          label="Bloqueados"
          value={users.blocked}
          to="/usuarios?status=blocked"
          alert={users.blocked > 0}
        />
        <Stat label="Inicios de sesión" value={logins.success_last_7d} hint="últimos 7 días" />
        <Stat
          label="Intentos bloqueados"
          value={logins.blocked_last_7d}
          hint="últimos 7 días"
          alert={logins.blocked_last_7d > 0}
        />
      </div>

      <h3 className="summary-subtitle">Por rol</h3>
      <div className="stat-grid">
        {['superadmin', 'admin', 'user'].map((role) => (
          <Stat key={role} label={role} value={users.byRole[role]} to={`/usuarios?role=${role}`} />
        ))}
      </div>

      <h3 className="summary-subtitle">Últimos inicios de sesión</h3>
      {recentLogins.length === 0 ? (
        <p className="muted">Todavía no hay inicios de sesión registrados.</p>
      ) : (
        <ul className="recent-list">
          {recentLogins.map((l) => (
            <li key={l.id}>
              <Link to={`/usuarios/${encodeURIComponent(l.auth_user_id)}`}>{l.email}</Link>
              {l.result === 'success' ? (
                <span className="badge badge-active">Exitoso</span>
              ) : (
                <span className="badge badge-blocked">Bloqueado</span>
              )}
              <span className="muted">{describeUserAgent(l.user_agent)}</span>
              <span className="muted recent-date">{new Date(l.created_at).toLocaleString('es-CL')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
