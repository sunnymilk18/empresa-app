import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Navbar() {
  const { isAuthenticated, profile, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login');
  }

  if (!isAuthenticated) return null;

  return (
    <nav className="navbar">
      <div className="navbar-brand">Empresa Demo</div>
      <div className="navbar-links">
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/clientes">Clientes</Link>
      </div>
      <div className="navbar-user">
        <span className={`badge badge-${profile?.role}`}>{profile?.role}</span>
        <span>{profile?.username || profile?.email}</span>
        <button className="link-button" onClick={onLogout}>Salir</button>
      </div>
    </nav>
  );
}
