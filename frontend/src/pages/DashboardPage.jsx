import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useDawn } from '../auth/DawnContext';
import { AdminSummary, useAdminStats } from '../components/AdminSummary';
import { FallingText } from '../components/FallingText';
import { SecurityCard } from '../components/SecurityCard';
import { greetingOf, useChileHour } from '../utils/dayPhase';
import { formatRut } from '../utils/rut';

function DashboardClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const date = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);

  return (
    <div className="dashboard-clock" aria-label="Hora de Chile">
      <time className="dashboard-clock__time" dateTime={now.toISOString()}>{time}</time>
      <span className="dashboard-clock__date">{date}</span>
    </div>
  );
}

export function DashboardPage() {
  const { profile } = useAuth();
  const hour = useChileHour();
  const isSuperadmin = profile?.role === 'superadmin';
  const { stats, error: statsError } = useAdminStats(isSuperadmin);
  // Llega de las pantallas del login (el amanecer sigue de fondo, recién se
  // está apagando): el recuadro hace su entrada. Al volver desde otra pestaña, no.
  const { dawn } = useDawn();
  const [intro] = useState(dawn);
  const [introDone, setIntroDone] = useState(!intro);
  useEffect(() => {
    if (introDone) return undefined;
    const timer = setTimeout(() => setIntroDone(true), 3200); // lo que dura la entrada (ver .page--intro)
    return () => clearTimeout(timer);
  }, [introDone]);

  return (
    <div className={`page page--std page--fit${intro ? ' page--intro' : ''}${intro && introDone ? ' intro-done' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div>
          <p className="muted" style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Dashboard</p>
          <h1 style={{ margin: '8px 0 4px' }}>
            <FallingText text={`${greetingOf(hour)}, ${profile?.username || profile?.email || ''}`} delay={intro ? 900 : 0} />
          </h1>
        </div>
        <div className="dashboard-meta">
          <DashboardClock />
          <span className={`badge badge-${profile?.role}`}>{profile?.role}</span>
        </div>
      </div>

      {isSuperadmin && <AdminSummary stats={stats} error={statsError} intro={intro} />}

      <div className="cards">
        <div className="card account">
          <div>
            <h2>Mi cuenta</h2>
            <ul className="kv">
              <li><span>Email</span><span>{profile?.email}</span></li>
              <li><span>Usuario</span><span>{profile?.username}</span></li>
              <li><span>RUT</span><span>{formatRut(profile?.rut)}</span></li>
            </ul>
          </div>
          <SecurityCard embedded />
        </div>
      </div>
    </div>
  );
}
