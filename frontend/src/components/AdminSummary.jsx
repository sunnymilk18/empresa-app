import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

// Entrada tras el login: los números cuentan desde 0 y las barras crecen cuando
// el recuadro ya apareció (INTRO_MS después de montarse, ver .page--intro).
const INTRO_MS = 1100;
const COUNT_MS = 800;

function useReadyAfter(delay) {
  const [ready, setReady] = useState(delay <= 0);
  useEffect(() => {
    if (delay <= 0) return undefined;
    const timer = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  return ready;
}

// Un número que sube de 0 a `value` (con `animate`); antes de `ready` muestra 0.
function CountUp({ value, animate, ready }) {
  const [shown, setShown] = useState(animate ? 0 : value);
  useEffect(() => {
    if (!animate) {
      setShown(value);
      return undefined;
    }
    if (!ready) {
      setShown(0);
      return undefined;
    }
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const t = Math.min((now - start) / COUNT_MS, 1);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, animate, ready]);
  return shown;
}

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
function DailyChart({ daily, hidden }) {
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
            <div key={d.day} className="daily-col" style={{ '--i': daily.indexOf(d) }} title={`${label}: ${d.ok} exitosos, ${d.blocked} bloqueados`}>
              <span className="daily-total">{d.ok + d.blocked || ''}</span>
              <div className={`daily-stack${hidden ? ' daily-stack--pre' : ''}`} style={{ height: `${((d.ok + d.blocked) / max) * 100}%` }}>
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
export function AdminSummary({ intro = false }) {
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

  // Mientras carga se dibuja el mismo esqueleto con "–": así el recuadro no
  // cambia de forma cuando llegan los datos.
  const users = stats?.users;
  const logins = stats?.logins;
  const dash = '–';
  const animate = intro && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ready = useReadyAfter(animate ? INTRO_MS : 0);
  const n = (v) => (v == null ? dash : <CountUp value={v} animate={animate} ready={ready} />);

  return (
    <section className="summary">
      <h2>Resumen</h2>

      <div className="summary-grid">
        <div className="kpi-strip">
          <Kpi label="Usuarios" value={n(users?.total)} to="/usuarios" />
          <Kpi label="Entraron" value={n(users?.active_last_7d)} hint="últimos 7 días" />
          <Kpi label="Nuevos" value={n(users?.new_last_7d)} hint="últimos 7 días" />
          <Kpi label="Bloqueados" value={n(users?.blocked)} to="/usuarios?status=blocked" alert={users?.blocked > 0} />
          <Kpi label="Inicios de sesión" value={n(logins?.success_last_7d)} hint="últimos 7 días" />
          <Kpi label="Intentos bloqueados" value={n(logins?.blocked_last_7d)} hint="últimos 7 días" alert={logins?.blocked_last_7d > 0} />
        </div>
        <DailyChart daily={stats?.daily || []} hidden={animate && !ready} />
      </div>
    </section>
  );
}
