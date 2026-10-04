import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AdminSummary } from '../components/AdminSummary';
import { FallingText } from '../components/FallingText';
import { SecurityCard } from '../components/SecurityCard';
import { greetingOf, useChileHour } from '../utils/dayPhase';
import { formatRut } from '../utils/rut';

export function DashboardPage() {
  const { profile } = useAuth();
  const hour = useChileHour();

  return (
    <div className="page page--std">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div>
          <p className="muted" style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Dashboard</p>
          <h1 style={{ margin: '8px 0 4px' }}>
            <FallingText text={`${greetingOf(hour)}, ${profile?.username || profile?.email || ''}`} />
          </h1>
        </div>
        <span className={`badge badge-${profile?.role}`}>{profile?.role}</span>
      </div>

      {profile?.role === 'superadmin' && <AdminSummary />}

      <div className="cards">
        <div className="card">
          <h2>Perfil del usuario</h2>
          <ul className="kv">
            <li><span>Email</span><span>{profile?.email}</span></li>
            <li><span>Usuario</span><span>{profile?.username}</span></li>
            <li><span>RUT</span><span>{formatRut(profile?.rut)}</span></li>
          </ul>
        </div>

        <SecurityCard />

        {profile?.role === 'superadmin' && (
          <div className="card">
            <h2>Usuarios</h2>
            <p className="muted">Revisa quién ha ingresado al sistema y administra sus roles.</p>
            <Link to="/usuarios" className="button-link">Ir a usuarios</Link>
          </div>
        )}
      </div>
    </div>
  );
}
