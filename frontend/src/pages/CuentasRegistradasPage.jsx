import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { formatRut } from '../utils/rut';

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

// Todas las cuentas registradas en la auth-api para este sistema, incluidas
// las que nunca completaron su primer login (por eso no aparecen en
// Usuarios: esa lista es solo quienes ya usaron el panel alguna vez).
// Requiere AUTH_API_SYSTEM_ADMIN_TOKEN en el backend, igual que las acciones
// de seguridad del detalle de un usuario.
export function CuentasRegistradasPage() {
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(Number(searchParams.get('page')) || 1, 1);
  const q = searchParams.get('q') || '';

  const [search, setSearch] = useState(q);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    if (!('page' in changes)) next.delete('page');
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .listAuthUsers(accessToken, { page, q })
      .then((res) => {
        if (cancelled) return;
        setUsers(res.users);
        setTotal(res.total);
        setPageSize(res.page_size);
      })
      .catch((err) => !cancelled && setError(err.data?.error || err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q]);

  // Si la búsqueda cambia desde fuera (atrás/adelante del navegador), el
  // campo de texto la refleja.
  useEffect(() => {
    if (q !== search.trim()) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Búsqueda mientras se escribe: espera 300 ms sin teclear (busca en la
  // auth-api, no solo en lo ya cargado — funciona sin importar cuántas
  // páginas haya, ver GET /system-admin/users?q=).
  useEffect(() => {
    if (search.trim() === q) return undefined;
    const timer = setTimeout(() => updateParams({ q: search.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const firstShown = total ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, total);
  const lastPage = Math.max(Math.ceil(total / pageSize), 1);

  function goToPage(next) {
    updateParams({ page: next > 1 ? next : '' });
  }

  return (
    <div className="page">
      <h1>Cuentas registradas</h1>
      <p className="muted">
        Todas las cuentas registradas en el servicio de autenticación para este sistema, incluidas
        las que nunca completaron su primer login (esas no aparecen en Usuarios). Solo lectura: no
        se puede actuar sobre ellas desde aquí — para eso, primero deben completar su login.
      </p>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Buscar por email, usuario o RUT"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar cuentas registradas"
        />
      </div>

      {error && <p className="error">{error}</p>}

      {loading && users.length === 0 ? (
        <p>Cargando...</p>
      ) : users.length === 0 && !error ? (
        <p className="muted">
          {q ? 'Ninguna cuenta coincide con la búsqueda.' : 'Todavía no hay cuentas registradas.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Usuario</th>
                <th>RUT</th>
                <th>Correo verificado</th>
                <th>Segundo factor elegido</th>
                <th>Estado</th>
                <th>Registrada</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.is_active ? undefined : 'row-blocked'}>
                  <td>{u.email}</td>
                  <td>{u.username || '—'}</td>
                  <td className="nowrap">{u.rut ? formatRut(u.rut) : '—'}</td>
                  <td>
                    {u.email_verified ? (
                      <span className="badge badge-active">Sí</span>
                    ) : (
                      <span className="badge badge-blocked">No</span>
                    )}
                  </td>
                  <td>{u.two_factor_method_chosen ? 'Sí' : 'No'}</td>
                  <td>
                    {u.is_active ? (
                      <span className="badge badge-active">Activa</span>
                    ) : (
                      <span className="badge badge-blocked">Baneada</span>
                    )}
                  </td>
                  <td className="nowrap">{formatDate(u.created_at)}</td>
                </tr>
              ))}
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
              onClick={() => goToPage(page - 1)}
            >
              ← Anterior
            </button>
            <span className="muted">Página {page} de {lastPage}</span>
            <button
              className="table-action"
              disabled={page >= lastPage || loading}
              onClick={() => goToPage(page + 1)}
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
