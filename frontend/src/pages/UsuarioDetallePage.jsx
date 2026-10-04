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
  const methods = {};
  for (const l of ok) methods[l.method] = (methods[l.method] || 0) + 1;
  const topMethod = Object.entries(methods).sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    ok: ok.length,
    blocked: logins.length - ok.length,
    ips: new Set(logins.map((l) => l.ip).filter(Boolean)).size,
    devices: new Set(logins.map((l) => describeUserAgent(l.user_agent))).size,
    topMethod,
  };
}

// Tarjetas de resumen + estado de la cuenta. El segundo factor se deduce del
// método del último inicio exitoso: el servicio de autenticación no lo expone
// por usuario a este backend.
function UserOverview({ user, logins, hasMore }) {
  const sum = summarizeLogins(logins);
  const lastMethod = logins.find((l) => l.result === 'success')?.method;
  const pending = user.auth_api_pending_action;
  return (
    <>
      <div className="stat-grid detail-stats">
        <div className="stat"><span className="stat-label">Exitosos</span><span className="stat-value">{sum.ok}</span></div>
        <div className={`stat${sum.blocked ? ' stat--alert' : ''}`}>
          <span className="stat-label">Bloqueados</span><span className="stat-value">{sum.blocked}</span>
        </div>
        <div className="stat"><span className="stat-label">IPs distintas</span><span className="stat-value">{sum.ips}</span></div>
        <div className="stat"><span className="stat-label">Dispositivos</span><span className="stat-value">{sum.devices}</span></div>
      </div>
      <p className="muted detail-note">
        {hasMore ? `Según sus ${logins.length} inicios más recientes.` : `Según sus ${logins.length} inicios registrados.`}
        {sum.topMethod && <> Entra sobre todo con {METHOD_LABELS[sum.topMethod].toLowerCase()}.</>}
      </p>
      <div className="detail-badges">
        {user.blocked_at ? <span className="badge badge-blocked">Cuenta bloqueada</span> : <span className="badge badge-active">Cuenta activa</span>}
        {lastMethod && (
          <span className="badge badge-user">
            {lastMethod === 'totp' ? 'Usa app autenticadora' : 'Usa código por correo'}
          </span>
        )}
        {pending && <span className="badge badge-blocked">Pendiente en la auth-api</span>}
      </div>
    </>
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
          </div>

          <div className="detail-top">
          <div>
          <ul className="kv">
            <li><span>Usuario</span><span>{user.username || '—'}</span></li>
            <li><span>RUT</span><span>{user.rut ? formatRut(user.rut) : '—'}</span></li>
            <li><span>Primer ingreso</span><span>{formatDate(user.created_at)}</span></li>
            <li><span>Último ingreso</span><span>{formatDate(user.last_login_at)}</span></li>
            <li><span>Última IP</span><span>{formatIp(user.last_login_ip)}</span></li>
            {user.blocked_at && (
              <li><span>Bloqueado desde</span><span>{formatDate(user.blocked_at)}</span></li>
            )}
          </ul>

          <UserOverview user={user} logins={logins} hasMore={hasMore} />
          </div>

          <UserSecurityActions
            user={user}
            onUserChange={setUser}
            lastMethod={logins.find((l) => l.result === 'success')?.method}
          />
          </div>

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
