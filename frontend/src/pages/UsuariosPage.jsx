import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { formatRut } from '../utils/rut';

const ROLES = ['superadmin', 'admin', 'user'];

function formatDate(value) {
  return value ? new Date(value).toLocaleString('es-CL') : '—';
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

  // Aplica un cambio sobre un usuario y reemplaza su fila con la respuesta.
  async function updateUser(authUserId, action) {
    setError('');
    setSavingId(authUserId);
    try {
      const res = await action();
      setUsers((prev) => prev.map((u) => (u.auth_user_id === authUserId ? res.user : u)));
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setSavingId(null);
    }
  }

  function changeRole(authUserId, role) {
    updateUser(authUserId, () => api.setLocalUserRole(authUserId, role, accessToken));
  }

  function toggleBlocked(user) {
    const blocked = !user.blocked_at;
    if (blocked && !window.confirm(`¿Bloquear a ${user.email}? No podrá entrar al sistema hasta que lo desbloquees.`)) {
      return;
    }
    updateUser(user.auth_user_id, () =>
      api.setLocalUserBlocked(user.auth_user_id, blocked, accessToken)
    );
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
          placeholder="Buscar por email, usuario o RUT"
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
                <th>Primer ingreso</th>
                <th>Último ingreso</th>
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
                    <td>{u.rut ? formatRut(u.rut) : '—'}</td>
                    <td>
                      {isMe ? (
                        <span className={`badge badge-${u.role}`}>{u.role} (tú)</span>
                      ) : (
                        <select
                          value={u.role}
                          disabled={savingId === u.auth_user_id}
                          onChange={(e) => changeRole(u.auth_user_id, e.target.value)}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>{formatDate(u.created_at)}</td>
                    <td>{formatDate(u.last_login_at)}</td>
                    <td>
                      {u.blocked_at ? (
                        <span className="badge badge-blocked" title={`Desde ${formatDate(u.blocked_at)}`}>
                          Bloqueado
                        </span>
                      ) : (
                        <span className="badge badge-active">Activo</span>
                      )}
                    </td>
                    <td>
                      {!isMe && (
                        <button
                          className={`table-action ${u.blocked_at ? '' : 'table-action--danger'}`}
                          disabled={savingId === u.auth_user_id}
                          onClick={() => toggleBlocked(u)}
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
    </div>
  );
}
