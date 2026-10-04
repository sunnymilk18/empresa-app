import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { formatRut } from '../utils/rut';
import { describeUserAgent } from '../utils/userAgent';
import { formatIp } from '../utils/ip';
import { UserSecurityActions } from '../components/UserSecurityActions';

function formatDate(value) {
  return value ? new Date(value).toLocaleString('es-CL') : '—';
}

const METHOD_LABELS = { otp: 'Código por correo', totp: 'App autenticadora' };

// Resumen de los inicios de sesión ya cargados (la página trae de a tantos:
// si hay más, las cifras son de los más recientes — se avisa en el texto).
function summarizeLogins(logins) {
  const ok = logins.filter((l) => l.result === 'success');
  return {
    ok: ok.length,
    blocked: logins.length - ok.length,
    ips: new Set(logins.map((l) => l.ip).filter(Boolean)).size,
    devices: new Set(logins.map((l) => describeUserAgent(l.user_agent))).size,
  };
}

// Cifras de los inicios de sesión de la tabla, junto a su título. Si hay más
// páginas, son solo de los ya cargados y se avisa.
function LoginFigures({ logins, hasMore }) {
  const sum = summarizeLogins(logins);
  return (
    <p className="detail-figures">
      <span><strong>{sum.ok}</strong> exitosos</span>
      <span className={sum.blocked ? 'detail-figures--alert' : ''}><strong>{sum.blocked}</strong> intentos bloqueados</span>
      <span>desde <strong>{sum.ips}</strong> {sum.ips === 1 ? 'IP' : 'IPs'}</span>
      <span><strong>{sum.devices}</strong> {sum.devices === 1 ? 'dispositivo' : 'dispositivos'}</span>
      {hasMore && <span className="detail-figures-note">(últimos {logins.length})</span>}
    </p>
  );
}

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

  const lastMethod = logins.find((l) => l.result === 'success')?.method;

  return (
    <div className="page page--std page--scroll">
      <p style={{ margin: '0 0 14px' }}>
        <Link to="/usuarios" className="back-link">← Volver a usuarios</Link>
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
            {lastMethod && (
              <span className="badge badge-user">
                {lastMethod === 'totp' ? 'Usa app autenticadora' : 'Usa código por correo'}
              </span>
            )}
            {user.auth_api_pending_action && <span className="badge badge-blocked">Pendiente en la auth-api</span>}
          </div>

          <div className="detail-top">
          <div>
          <ul className="kv">
            <li><span>Usuario</span><span>{user.username || '—'}</span></li>
            <li><span>RUT</span><span>{user.rut ? formatRut(user.rut) : '—'}</span></li>
            <li><span>Primer ingreso</span><span>{formatDate(user.created_at)}</span></li>
            {user.blocked_at && (
              <li><span>Bloqueado desde</span><span>{formatDate(user.blocked_at)}</span></li>
            )}
          </ul>

          </div>

          <UserSecurityActions
            user={user}
            onUserChange={setUser}
          />
          </div>

          <h2 style={{ marginTop: 22, marginBottom: 0 }}>Inicios de sesión</h2>
          {logins.length > 0 && <LoginFigures logins={logins} hasMore={hasMore} />}
          {!loading && logins.length === 0 ? (
            <p className="muted">
              Sin inicios de sesión registrados. El historial guarda los del último año
              (plazo configurable); los más antiguos se eliminan automáticamente.
            </p>
          ) : (
            <div className="table-wrap detail-logins">
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
                      <td className="cell-dim nowrap">{formatDate(l.created_at)}</td>
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
