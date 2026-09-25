import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function DashboardPage() {
  const { profile } = useAuth();

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div>
          <p className="muted" style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Dashboard</p>
          <h1 style={{ margin: '8px 0 4px' }}>Bienvenido, {profile?.username || profile?.email}</h1>
        </div>
        <span className={`badge badge-${profile?.role}`}>{profile?.role}</span>
      </div>

      <div className="cards">
        <div className="card">
          <h2>Perfil del usuario</h2>
          <ul className="kv">
            <li><span>Email</span><span>{profile?.email}</span></li>
            <li><span>Usuario</span><span>{profile?.username}</span></li>
            <li><span>RUT</span><span>{profile?.rut}</span></li>
            <li><span>Acceso</span><span>{profile?.totp_enabled ? 'App autenticadora' : 'Correo (OTP)'}</span></li>
          </ul>
        </div>

        <div className="card">
          <h2>Clientes</h2>
          <p className="muted">Gestiona el recurso de negocio de esta empresa.</p>
          <Link to="/clientes" className="button-link">Ir a clientes</Link>
        </div>
      </div>
    </div>
  );
}
