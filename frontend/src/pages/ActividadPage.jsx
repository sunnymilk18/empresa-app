import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { formatIp } from '../utils/ip';

function formatDate(value) {
  return new Date(value).toLocaleString('es-CL');
}

// Traduce cada acción registrada en el backend a una frase legible.
function describe(entry) {
  const target = entry.target_email || 'un usuario';
  switch (entry.action) {
    case 'role_changed':
      return (
        <>
          cambió el rol de <strong>{target}</strong>:{' '}
          <span className={`badge badge-${entry.details.from}`}>{entry.details.from}</span> →{' '}
          <span className={`badge badge-${entry.details.to}`}>{entry.details.to}</span>
        </>
      );
    case 'user_blocked':
      return <>bloqueó a <strong>{target}</strong></>;
    case 'user_unblocked':
      return <>desbloqueó a <strong>{target}</strong></>;
    // Acciones de la persona sobre su propia cuenta.
    case 'totp_enabled':
      return <>activó la app autenticadora en su cuenta</>;
    case 'totp_disabled':
      return <>desactivó la app autenticadora (vuelve al código por correo)</>;
    default:
      return <>{entry.action} ({target})</>;
  }
}

// Registro de auditoría: qué hizo cada superadmin, a quién y cuándo.
export function ActividadPage() {
  const { accessToken } = useAuth();

  const [entries, setEntries] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(before) {
    setLoading(true);
    setError('');
    try {
      const res = await api.listAuditLog(accessToken, before);
      setEntries((prev) => (before ? [...prev, ...res.entries] : res.entries));
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
  }, []);

  return (
    <div className="page">
      <h1>Actividad</h1>
      <p className="muted">
        Historial de acciones de administración y cambios de seguridad de cada cuenta. No se
        puede editar ni borrar.
      </p>
      {error && <p className="error">{error}</p>}

      {!loading && entries.length === 0 && !error ? (
        <p className="muted">Todavía no hay actividad registrada.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Quién</th>
                <th>Acción</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(e.created_at)}</td>
                  <td>{e.actor_email}</td>
                  <td>{describe(e)}</td>
                  <td className="muted nowrap">{formatIp(e.ip)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && <p>Cargando...</p>}
      {hasMore && !loading && (
        <button className="table-action" style={{ marginTop: 16 }} onClick={() => load(entries[entries.length - 1].id)}>
          Cargar más
        </button>
      )}
    </div>
  );
}
