import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

// Un indicador de la franja. Con `to`, es un enlace (p. ej. a Usuarios filtrado).
// `alert` lo pinta de rojo (solo cuando el número es motivo de atención).
function Kpi({ label, value, hint, to, alert = false }) {
  const className = `kpi${alert ? ' kpi--alert' : ''}`;
  const content = (
    <>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-hint">{hint || ' '}</span>
    </>
  );
  return to ? <Link to={to} className={`${className} kpi--link`}>{content}</Link> : <div className={className}>{content}</div>;
}

// Barras de los inicios de sesión de los últimos 7 días: exitosos y, apilados
// encima, los bloqueados.
function DailyChart({ daily }) {
  const max = Math.max(1, ...daily.map((d) => d.ok + d.blocked));
  return (
    <div className="daily">
      <div className="daily-head">
        <span>Inicios de sesión por día</span>
        <span className="daily-legend">
          <i className="dot dot--ok" /> Exitosos <i className="dot dot--blocked" /> Bloqueados
        </span>
      </div>
      <div className="daily-bars">
        {daily.map((d) => {
          const date = new Date(`${d.day}T12:00:00`);
          const label = `${date.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')} ${date.getDate()}`;
          return (
            <div key={d.day} className="daily-col" title={`${label}: ${d.ok} exitosos, ${d.blocked} bloqueados`}>
              <span className="daily-total">{d.ok + d.blocked || ''}</span>
              <div className="daily-stack" style={{ height: `${((d.ok + d.blocked) / max) * 100}%` }}>
                {d.blocked > 0 && <span className="daily-seg daily-seg--blocked" style={{ flex: d.blocked }} />}
                {d.ok > 0 && <span className="daily-seg daily-seg--ok" style={{ flex: d.ok }} />}
              </div>
              <span className="daily-label">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Resumen del sistema para el superadmin: usuarios y accesos de los últimos
// 7 días.
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

  const { users, logins, daily } = stats;

  return (
    <section className="summary">
      <h2>Resumen</h2>

      <div className="summary-grid">
        <div className="kpi-strip">
          <Kpi label="Usuarios" value={users.total} to="/usuarios" />
          <Kpi label="Entraron" value={users.active_last_7d} hint="últimos 7 días" />
          <Kpi label="Nuevos" value={users.new_last_7d} hint="últimos 7 días" />
          <Kpi label="Bloqueados" value={users.blocked} to="/usuarios?status=blocked" alert={users.blocked > 0} />
          <Kpi label="Inicios de sesión" value={logins.success_last_7d} hint="últimos 7 días" />
          <Kpi label="Intentos bloqueados" value={logins.blocked_last_7d} hint="últimos 7 días" alert={logins.blocked_last_7d > 0} />
        </div>
        <DailyChart daily={daily} />
      </div>
    </section>
  );
}
