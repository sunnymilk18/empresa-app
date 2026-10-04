import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { formatRut } from '../utils/rut';
import { formatIp } from '../utils/ip';
import { blockConfirmText, pendingText } from '../utils/moderation';
import { pinErrorMessage } from '../utils/pin';
import { ActionModal } from '../components/ActionModal';

const ROLES = ['superadmin', 'admin', 'user'];

// Ver UserSecurityActions.jsx: reintentar lo pendiente no es una decisión
// nueva, así que no se le vuelve a pedir motivo a la persona.
const RETRY_REASON = 'Reintento de sincronización con el servicio de autenticación.';

// Sin segundos: en esta tabla no aportan y le quitan espacio a las columnas.
function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}

// Panel del superadmin: personas que completaron el login (correo verificado
// + segundo factor) al menos una vez en empresa-app, con su rol local.
// Búsqueda, filtros y página viven en la URL (?q=&role=&status=&page=), así
// se conservan al volver desde el detalle de un usuario o al recargar.
export function UsuariosPage() {
  const { accessToken, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const role = searchParams.get('role') || '';
  const status = searchParams.get('status') || '';
  const page = Math.max(Number(searchParams.get('page')) || 1, 1);

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState(q);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);
  // Aviso cuando un bloqueo se aplicó aquí pero no en la auth-api.
  const [warning, setWarning] = useState('');
  // Usuario/rol pendiente de confirmar con motivo y/o PIN (ver ActionModal).
  const [blockModalUser, setBlockModalUser] = useState(null);
  const [retryModalUser, setRetryModalUser] = useState(null);
  const [roleModal, setRoleModal] = useState(null); // { user, role }
  const moderationEnabled = Boolean(profile?.features?.authApiModeration);
  const pinEnforced = Boolean(profile?.features?.adminPin);

  // Siempre la URL más reciente. La búsqueda se aplica con retraso desde un
  // timer creado en un render anterior; si partiera de los parámetros de ese
  // render, pisaría un filtro elegido mientras tanto. (En React Router 6 la
  // forma función de setSearchParams tampoco sirve: recibe los de ese render.)
  const latestParams = useRef(searchParams);
  latestParams.current = searchParams;

  // Cambia filtros en la URL; cualquier filtro nuevo vuelve a la página 1.
  function updateParams(changes) {
    const next = new URLSearchParams(latestParams.current);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value == null) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in changes)) next.delete('page');
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .listLocalUsers(accessToken, { q, role, status, page })
      .then((res) => {
        if (cancelled) return;
        // Página fuera de rango (p. ej. tras bloquear o filtrar): ir a la última.
        const lastPage = Math.max(Math.ceil(res.total / res.pageSize), 1);
        if (!res.users.length && page > lastPage) {
          updateParams({ page: lastPage > 1 ? lastPage : '' });
          return;
        }
        setUsers(res.users);
        setTotal(res.total);
        setPageSize(res.pageSize);
      })
      .catch((err) => !cancelled && setError(err.data?.error || err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, role, status, page]);

  // Si la búsqueda cambia desde fuera (atrás/adelante del navegador), el
  // campo de texto la refleja.
  useEffect(() => {
    if (q !== search.trim()) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Búsqueda mientras se escribe: espera 300 ms sin teclear antes de consultar.
  useEffect(() => {
    if (search.trim() === q) return undefined;
    const timer = setTimeout(() => updateParams({ q: search.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = Boolean(q || role || status);
  const firstShown = total ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, total);
  const lastPage = Math.max(Math.ceil(total / pageSize), 1);

  // Aplica un cambio sobre un usuario y reemplaza su fila con la respuesta. Si
  // falla, lanza el error: los diálogos lo muestran y se quedan abiertos.
  async function updateUser(authUserId, action) {
    setError('');
    setWarning('');
    setSavingId(authUserId);
    try {
      const res = await action();
      setUsers((prev) => prev.map((u) => (u.auth_user_id === authUserId ? res.user : u)));
      if (res.warning) setWarning(`${res.user.email}: ${res.warning}`);
    } finally {
      setSavingId(null);
    }
  }

  // El motivo (y el PIN) los pide el diálogo, no se aplica al elegir la opción
  // (ver render del <select> más abajo).
  function requestRoleChange(user, role) {
    if (role === user.role) return;
    setRoleModal({ user, role });
  }

  async function confirmRoleChange({ reason, pin }) {
    const { user, role } = roleModal;
    await updateUser(user.auth_user_id, () =>
      api.setLocalUserRole(user.auth_user_id, role, reason, pin, accessToken)
    );
    setRoleModal(null);
  }

  async function confirmBlockToggle({ reason, pin }) {
    const user = blockModalUser;
    await updateUser(user.auth_user_id, () =>
      api.setLocalUserBlocked(user.auth_user_id, !user.blocked_at, reason, pin, accessToken)
    );
    setBlockModalUser(null);
  }

  // Reintenta en la auth-api el ban/unban que quedó pendiente (repite la
  // misma acción: el backend solo rehace la parte que faltaba). No es una
  // decisión nueva, así que no pide motivo (ver RETRY_REASON); pide el PIN
  // solo si el servidor lo exige, y si no, sale directo.
  const retryCall = (user, pin) => () =>
    api.setLocalUserBlocked(user.auth_user_id, user.auth_api_pending_action === 'ban', RETRY_REASON, pin, accessToken);

  function retryPending(user) {
    if (pinEnforced) {
      setRetryModalUser(user);
      return;
    }
    updateUser(user.auth_user_id, retryCall(user)).catch((err) => setError(pinErrorMessage(err)));
  }

  async function confirmRetry({ pin }) {
    await updateUser(retryModalUser.auth_user_id, retryCall(retryModalUser, pin));
    setRetryModalUser(null);
  }

  return (
    <div className="page">
      <h1>Usuarios</h1>
      <p className="muted">
        Personas que completaron el login (correo verificado + segundo factor) al menos una vez.
      </p>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Buscar por email, usuario, RUT o IP"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar usuarios"
        />
        <select value={role} onChange={(e) => updateParams({ role: e.target.value })} aria-label="Filtrar por rol">
          <option value="">Todos los roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => updateParams({ status: e.target.value })} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="blocked">Bloqueados</option>
        </select>
        {hasFilters && (
          <button
            className="table-action"
            onClick={() => {
              setSearch('');
              setSearchParams({}, { replace: true });
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {warning && <p className="warning">⚠ {warning}</p>}

      {loading && users.length === 0 ? (
        <p>Cargando...</p>
      ) : users.length === 0 ? (
        <p className="muted">
          {hasFilters ? 'Ningún usuario coincide con la búsqueda.' : 'Todavía no hay usuarios.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Usuario</th>
                <th>RUT</th>
                <th>Rol</th>
                <th>Último ingreso</th>
                <th>Última IP</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.auth_user_id === profile?.id;
                return (
                  <tr key={u.auth_user_id} className={u.blocked_at ? 'row-blocked' : undefined}>
                    <td>
                      <Link to={`/usuarios/${encodeURIComponent(u.auth_user_id)}`}>{u.email}</Link>
                    </td>
                    <td>{u.username || '—'}</td>
                    <td className="nowrap">{u.rut ? formatRut(u.rut) : '—'}</td>
                    <td>
                      {isMe ? (
                        <span className={`badge badge-${u.role}`}>{u.role} (tú)</span>
                      ) : (
                        <select
                          value={u.role}
                          disabled={savingId === u.auth_user_id}
                          onChange={(e) => requestRoleChange(u, e.target.value)}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="nowrap">{formatDate(u.last_login_at)}</td>
                    <td className="nowrap muted">{formatIp(u.last_login_ip)}</td>
                    <td>
                      {u.blocked_at ? (
                        <span className="badge badge-blocked" title={`Desde ${formatDate(u.blocked_at)}`}>
                          Bloqueado
                        </span>
                      ) : (
                        <span className="badge badge-active">Activo</span>
                      )}
                      {u.auth_api_pending_action && (
                        <button
                          type="button"
                          className="pending-retry"
                          title={pendingText(u.auth_api_pending_action)}
                          disabled={savingId === u.auth_user_id}
                          onClick={() => retryPending(u)}
                        >
                          ⚠ Reintentar
                        </button>
                      )}
                    </td>
                    <td>
                      {!isMe && (
                        <button
                          className={`table-action ${u.blocked_at ? '' : 'table-action--danger'}`}
                          disabled={savingId === u.auth_user_id}
                          onClick={() => setBlockModalUser(u)}
                        >
                          {u.blocked_at ? 'Desbloquear' : 'Bloquear'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="pagination">
          <span className="muted">
            Mostrando {firstShown}–{lastShown} de {total}
          </span>
          <div className="pagination-buttons">
            <button
              className="table-action"
              disabled={page <= 1 || loading}
              onClick={() => updateParams({ page: page - 1 > 1 ? page - 1 : '' })}
            >
              ← Anterior
            </button>
            <span className="muted">Página {page} de {lastPage}</span>
            <button
              className="table-action"
              disabled={page >= lastPage || loading}
              onClick={() => updateParams({ page: page + 1 })}
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {blockModalUser && (
        <ActionModal
          title={blockModalUser.blocked_at ? 'Desbloquear cuenta' : 'Bloquear cuenta'}
          description={
            blockModalUser.blocked_at
              ? `¿Desbloquear a ${blockModalUser.email}? Podrá volver a entrar al sistema.`
              : blockConfirmText(blockModalUser.email, moderationEnabled)
          }
          confirmLabel={blockModalUser.blocked_at ? 'Desbloquear' : 'Bloquear'}
          danger={!blockModalUser.blocked_at}
          askPin={pinEnforced}
          onConfirm={confirmBlockToggle}
          onCancel={() => setBlockModalUser(null)}
        />
      )}

      {roleModal && (
        <ActionModal
          title="Cambiar rol"
          description={`¿Cambiar el rol de ${roleModal.user.email} de "${roleModal.user.role}" a "${roleModal.role}"?`}
          confirmLabel="Cambiar rol"
          askPin={pinEnforced}
          onConfirm={confirmRoleChange}
          onCancel={() => setRoleModal(null)}
        />
      )}

      {retryModalUser && (
        <ActionModal
          title="Reintentar en el servicio de autenticación"
          description={pendingText(retryModalUser.auth_api_pending_action)}
          confirmLabel="Reintentar"
          askReason={false}
          askPin
          onConfirm={confirmRetry}
          onCancel={() => setRetryModalUser(null)}
        />
      )}
    </div>
  );
}
