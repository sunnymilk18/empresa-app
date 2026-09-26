import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { formatRut } from '../utils/rut';
import { describeUserAgent } from '../utils/userAgent';
import { formatIp } from '../utils/ip';

function formatDate(value) {
  return value ? new Date(value).toLocaleString('es-CL') : '—';
}

const METHOD_LABELS = { otp: 'Código por correo', totp: 'App autenticadora' };

// Detalle de un usuario para el superadmin: sus datos y su historial de
// inicios de sesión (incluye intentos de cuentas bloqueadas).
export function UsuarioDetallePage() {
  const { authUserId } = useParams();
  const { accessToken } = useAuth();

  const [user, setUser] = useState(null);
  const [logins, setLogins] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(before) {
    setLoading(true);
    setError('');
    try {
      const res = await api.getUserLogins(authUserId, accessToken, before);
      setUser(res.user);
      setLogins((prev) => (before ? [...prev, ...res.logins] : res.logins));
      setHasMore(res.hasMore);
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId]);

  return (
    <div className="page">
      <p style={{ margin: '0 0 12px' }}>
        <Link to="/usuarios">← Volver a usuarios</Link>
      </p>
      {error && <p className="error">{error}</p>}

      {user && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>{user.email}</h1>
            <span className={`badge badge-${user.role}`}>{user.role}</span>
            {user.blocked_at ? (
              <span className="badge badge-blocked">Bloqueado</span>
            ) : (
              <span className="badge badge-active">Activo</span>
            )}
          </div>

          <ul className="kv" style={{ maxWidth: 480, marginTop: 20 }}>
            <li><span>Usuario</span><span>{user.username || '—'}</span></li>
            <li><span>RUT</span><span>{user.rut ? formatRut(user.rut) : '—'}</span></li>
            <li><span>Primer ingreso</span><span>{formatDate(user.created_at)}</span></li>
            <li><span>Último ingreso</span><span>{formatDate(user.last_login_at)}</span></li>
            <li><span>Última IP</span><span>{formatIp(user.last_login_ip)}</span></li>
            {user.blocked_at && (
              <li><span>Bloqueado desde</span><span>{formatDate(user.blocked_at)}</span></li>
            )}
          </ul>

          <h2 style={{ marginTop: 32 }}>Inicios de sesión</h2>
          {!loading && logins.length === 0 ? (
            <p className="muted">
              Sin inicios de sesión registrados. El historial guarda los del último año
              (plazo configurable); los más antiguos se eliminan automáticamente.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Resultado</th>
                    <th>Método</th>
                    <th>IP</th>
                    <th>Dispositivo</th>
                  </tr>
                </thead>
                <tbody>
                  {logins.map((l) => (
                    <tr key={l.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(l.created_at)}</td>
                      <td>
                        {l.result === 'success' ? (
                          <span className="badge badge-active">Exitoso</span>
                        ) : (
                          <span className="badge badge-blocked">Bloqueado</span>
                        )}
                      </td>
                      <td>{METHOD_LABELS[l.method] || l.method}</td>
                      <td className="muted nowrap">{formatIp(l.ip)}</td>
                      <td title={l.user_agent || ''}>{describeUserAgent(l.user_agent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {loading && <p>Cargando...</p>}
      {hasMore && !loading && (
        <button
          className="table-action"
          style={{ marginTop: 16 }}
          onClick={() => load(logins[logins.length - 1].id)}
        >
          Cargar más
        </button>
      )}
    </div>
  );
}
