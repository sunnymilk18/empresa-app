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
        <span>
          Inicios por día
          {daily.length > 0 && <strong className="daily-sum"> · {daily.reduce((t, d) => t + d.ok, 0)} en 7 días</strong>}
        </span>
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

// Datos del resumen del superadmin (GET /api/stats). Lo usan el resumen y la
// tarjeta "Requiere atención" del dashboard, así que se piden una sola vez.
export function useAdminStats(enabled) {
  const { accessToken } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    api
      .getStats(accessToken)
      .then(setStats)
      .catch((err) => setError(err.data?.error || err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { stats, error };
}

// Resumen del sistema para el superadmin: indicadores y accesos de los últimos
// 7 días. Mientras carga se dibuja el mismo esqueleto con "–", así el recuadro
// no cambia de forma cuando llegan los datos.
export function AdminSummary({ stats, error, intro = false }) {
  const animate = intro && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ready = useReadyAfter(animate ? INTRO_MS : 0);

  if (error) return <p className="error">No se pudo cargar el resumen: {error}</p>;

  const users = stats?.users;
  const logins = stats?.logins;
  const n = (v) => (v == null ? '–' : <CountUp value={v} animate={animate} ready={ready} />);

  return (
    <section className="summary">
      <div className="summary-head">
        <h2>Resumen</h2>
        <AttentionPill stats={stats} />
      </div>

      <div className="summary-grid">
        <div className="kpi-strip">
          <Kpi
            label="Usuarios"
            value={n(users?.total)}
            hint={users ? `${users.active_last_7d} entraron esta semana` : null}
            to="/usuarios"
          />
          <Kpi label="Nuevos" value={n(users?.new_last_7d)} hint="últimos 7 días" />
          <Kpi
            label="Cuentas bloqueadas"
            value={n(users?.blocked)}
            hint="en este momento"
            to="/usuarios?status=blocked"
            alert={users?.blocked > 0}
          />
          <Kpi
            label="Intentos rechazados"
            value={n(logins?.blocked_last_7d)}
            hint="últimos 7 días"
            alert={logins?.blocked_last_7d > 0}
          />
        </div>
        <DailyChart daily={stats?.daily || []} hidden={animate && !ready} />
      </div>
    </section>
  );
}

// Estado del sistema junto al título del resumen: "Todo en orden" en verde, o
// la cantidad de pendientes en rojo; al abrirla lista cada pendiente con su enlace.
export function AttentionPill({ stats }) {
  if (!stats) return <span className="skeleton-bar" style={{ width: 130, height: 26, borderRadius: 999 }} />;

  const { users, logins } = stats;
  const items = [];
  if (users.blocked > 0) {
    items.push({
      key: 'blocked',
      text: `${users.blocked} ${users.blocked === 1 ? 'cuenta bloqueada' : 'cuentas bloqueadas'}`,
      to: '/usuarios?status=blocked',
    });
  }
  if (users.pending_sync > 0) {
    items.push({
      key: 'pending',
      text: `${users.pending_sync} ${users.pending_sync === 1 ? 'bloqueo sin aplicar' : 'bloqueos sin aplicar'} en la auth-api`,
      to: '/usuarios?status=blocked',
    });
  }
  if (logins.blocked_last_7d > 0) {
    items.push({
      key: 'attempts',
      text: `${logins.blocked_last_7d} ${logins.blocked_last_7d === 1 ? 'intento rechazado' : 'intentos rechazados'} esta semana`,
      to: null,
    });
  }

  if (items.length === 0) {
    return (
      <span className="attention-pill attention-pill--ok">
        <span className="attention-dot attention-dot--ok" /> Todo en orden
      </span>
    );
  }
  return (
    <details className="attention-details">
      <summary className="attention-pill attention-pill--alert">
        <span className="attention-dot" /> {items.length} {items.length === 1 ? 'pendiente' : 'pendientes'}
      </summary>
      <ul className="attention-panel">
        {items.map((it) => (
          <li key={it.key}>
            {it.to ? <Link to={it.to}>{it.text} →</Link> : <span>{it.text}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
