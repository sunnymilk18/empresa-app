import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { formatIp } from '../utils/ip';

// Mismas acciones que backend/src/lib/audit.js (AUDIT_ACTIONS) — se
// duplican acá solo para armar el desplegable de filtro, con su texto legible.
const ACTION_LABELS = {
  role_changed: 'Cambio de rol',
  user_blocked: 'Bloqueo',
  user_unblocked: 'Desbloqueo',
  auth_api_synced: 'Sincronización con la auth-api',
  sessions_revoked: 'Cierre de sesiones',
  totp_disabled_by_admin: 'App autenticadora desactivada (por un admin)',
  totp_enabled: 'App autenticadora activada',
  totp_disabled: 'App autenticadora desactivada (por la propia cuenta)',
};

function formatDate(value) {
  return new Date(value).toLocaleString('es-CL');
}

// Debounce de un campo de texto hacia un parámetro de la URL: lo actualiza
// 300ms después de que la persona deja de escribir (mismo patrón que la
// búsqueda de Usuarios). `updateParams` viene del componente.
function useDebouncedFilter(paramValue, updateParams, key) {
  const [input, setInput] = useState(paramValue);

  useEffect(() => {
    if (paramValue !== input.trim()) setInput(paramValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramValue]);

  useEffect(() => {
    if (input.trim() === paramValue) return undefined;
    const timer = setTimeout(() => updateParams({ [key]: input.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  return [input, setInput];
}

// Cómo terminó un bloqueo/desbloqueo en el servicio de autenticación.
// Los registros anteriores a esta función no traen el dato: no se agrega nada.
function authApiNote(result) {
  switch (result) {
    case 'ok':
      return ' (también en el servicio de autenticación)';
    case 'unavailable':
    case 'unauthorized':
      return ' (pendiente en el servicio de autenticación)';
    case 'not_found':
      return ' (la cuenta ya no existe en el servicio de autenticación)';
    default:
      return '';
  }
}

// El motivo que se le pide a quien bloquea o cambia un rol (ver ReasonModal).
// Los registros de antes de esta función no lo traen: no se agrega nada. Uno
// largo se corta en la tabla, con un enlace para verlo completo en un modal
// (onShowReason) — así no rompe el ancho de la fila.
const REASON_PREVIEW_LENGTH = 70;
function reasonNote(reason, onShowReason) {
  if (!reason) return null;
  const isLong = reason.length > REASON_PREVIEW_LENGTH;
  const preview = isLong ? `${reason.slice(0, REASON_PREVIEW_LENGTH).trimEnd()}…` : reason;
  return (
    <>
      {' — '}
      <em>"{preview}"</em>
      {isLong && (
        <>
          {' '}
          <button type="button" className="link-button" onClick={() => onShowReason(reason)}>
            ver completo
          </button>
        </>
      )}
    </>
  );
}

// Traduce cada acción registrada en el backend a una frase legible.
function describe(entry, onShowReason) {
  const target = entry.target_email || 'un usuario';
  switch (entry.action) {
    case 'role_changed':
      return (
        <>
          cambió el rol de <strong>{target}</strong>:{' '}
          <span className={`badge badge-${entry.details.from}`}>{entry.details.from}</span> →{' '}
          <span className={`badge badge-${entry.details.to}`}>{entry.details.to}</span>
          {reasonNote(entry.details.reason, onShowReason)}
        </>
      );
    case 'user_blocked':
      return (
        <>
          bloqueó a <strong>{target}</strong>{authApiNote(entry.details.auth_api)}
          {reasonNote(entry.details.reason, onShowReason)}
        </>
      );
    case 'user_unblocked':
      return (
        <>
          desbloqueó a <strong>{target}</strong>{authApiNote(entry.details.auth_api)}
          {reasonNote(entry.details.reason, onShowReason)}
        </>
      );
    case 'auth_api_synced':
      return (
        <>
          aplicó en el servicio de autenticación el {entry.details.action === 'ban' ? 'bloqueo' : 'desbloqueo'}{' '}
          pendiente de <strong>{target}</strong>
        </>
      );
    case 'sessions_revoked':
      return <>cerró todas las sesiones de <strong>{target}</strong></>;
    case 'totp_disabled_by_admin':
      return <>desactivó la app autenticadora de <strong>{target}</strong></>;
    // Acciones de la persona sobre su propia cuenta.
    case 'totp_enabled':
      return <>activó la app autenticadora en su cuenta</>;
    case 'totp_disabled':
      return <>desactivó la app autenticadora (vuelve al código por correo)</>;
    default:
      return <>{entry.action} ({target})</>;
  }
}

// Registro de auditoría: qué hizo cada superadmin, a quién y cuándo. Filtros
// por quién, a quién, tipo de acción y rango de fechas viven en la URL
// (?actor=&target=&action=&from=&to=), así se conservan al recargar.
export function ActividadPage() {
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const actor = searchParams.get('actor') || '';
  const target = searchParams.get('target') || '';
  const action = searchParams.get('action') || '';
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';

  const [entries, setEntries] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Motivo largo que se está mostrando completo (ver reasonNote).
  const [fullReason, setFullReason] = useState(null);

  // Siempre la URL más reciente (ver UsuariosPage.jsx: por qué no basta con
  // los parámetros del render donde se creó el timer del debounce).
  const latestParams = useRef(searchParams);
  latestParams.current = searchParams;

  function updateParams(changes) {
    const next = new URLSearchParams(latestParams.current);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value == null) next.delete(key);
      else next.set(key, String(value));
    }
    setSearchParams(next, { replace: true });
  }

  const [actorInput, setActorInput] = useDebouncedFilter(actor, updateParams, 'actor');
  const [targetInput, setTargetInput] = useDebouncedFilter(target, updateParams, 'target');
  const hasFilters = Boolean(actor || target || action || from || to);

  async function load(before) {
    setLoading(true);
    setError('');
    try {
      const res = await api.listAuditLog(accessToken, { before, actor, target, action, from, to });
      setEntries((prev) => (before ? [...prev, ...res.entries] : res.entries));
      setHasMore(res.hasMore);
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  // Cualquier cambio de filtro vuelve a cargar desde el principio.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, target, action, from, to]);

  return (
    <div className="page">
      <h1>Actividad</h1>
      <p className="muted">
        Historial de acciones de administración y cambios de seguridad de cada cuenta. No se
        puede editar ni borrar; los registros más antiguos que el plazo configurado (3 años
        por defecto) se eliminan automáticamente.
      </p>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Quién hizo la acción (correo o IP)"
          value={actorInput}
          onChange={(e) => setActorInput(e.target.value)}
          aria-label="Buscar por quién hizo la acción, correo o IP"
        />
        <input
          type="search"
          placeholder="A quién le pasó"
          value={targetInput}
          onChange={(e) => setTargetInput(e.target.value)}
          aria-label="Buscar por quién recibió la acción"
        />
        <select
          value={action}
          onChange={(e) => updateParams({ action: e.target.value })}
          aria-label="Filtrar por tipo de acción"
        >
          <option value="">Todas las acciones</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <label className="toolbar-date">
          Desde
          <input
            type="date"
            value={from}
            onChange={(e) => updateParams({ from: e.target.value })}
            aria-label="Desde"
          />
        </label>
        <label className="toolbar-date">
          Hasta
          <input
            type="date"
            value={to}
            onChange={(e) => updateParams({ to: e.target.value })}
            aria-label="Hasta"
          />
        </label>
        {hasFilters && (
          <button
            className="table-action"
            onClick={() => {
              setActorInput('');
              setTargetInput('');
              setSearchParams({}, { replace: true });
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {!loading && entries.length === 0 && !error ? (
        <p className="muted">
          {hasFilters ? 'Ningún registro coincide con los filtros.' : 'Todavía no hay actividad registrada.'}
        </p>
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
                  <td>{describe(e, setFullReason)}</td>
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

      {fullReason && (
        <div className="modal-overlay" onClick={() => setFullReason(null)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Motivo</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{fullReason}</p>
            <div className="modal-actions">
              <button type="button" className="table-action" onClick={() => setFullReason(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
