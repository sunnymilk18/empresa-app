import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

const emptyForm = { nombre: '', email: '', telefono: '', empresa: '', notas: '' };

export function ClientesPage() {
  const { accessToken, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.listClientes(accessToken);
      setClientes(res.clientes);
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

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function startEdit(cliente) {
    setEditingId(cliente.id);
    setForm({
      nombre: cliente.nombre,
      email: cliente.email || '',
      telefono: cliente.telefono || '',
      empresa: cliente.empresa || '',
      notas: cliente.notas || '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.updateCliente(editingId, form, accessToken);
      } else {
        await api.createCliente(form, accessToken);
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.data?.error || err.message);
    }
  }

  async function onDelete(id) {
    if (!confirm('¿Eliminar este cliente?')) return;
    try {
      await api.deleteCliente(id, accessToken);
      await load();
    } catch (err) {
      setError(err.data?.error || err.message);
    }
  }

  return (
    <div className="page">
      <h1>Clientes</h1>
      {!isAdmin && (
        <p className="muted">
          Tu rol es <strong>user</strong>: puedes ver la lista, pero solo un <strong>admin</strong>{' '}
          puede crear, editar o eliminar clientes.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      {isAdmin && (
        <form onSubmit={onSubmit} className="form form-inline">
          <input placeholder="Nombre *" required value={form.nombre} onChange={update('nombre')} />
          <input placeholder="Email" value={form.email} onChange={update('email')} />
          <input placeholder="Teléfono" value={form.telefono} onChange={update('telefono')} />
          <input placeholder="Empresa" value={form.empresa} onChange={update('empresa')} />
          <input placeholder="Notas" value={form.notas} onChange={update('notas')} />
          <button type="submit">{editingId ? 'Guardar cambios' : 'Agregar cliente'}</button>
          {editingId && (
            <button type="button" className="secondary" onClick={cancelEdit}>
              Cancelar
            </button>
          )}
        </form>
      )}

      {loading ? (
        <p className="centered">Cargando...</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th>Empresa</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td>{c.email}</td>
                <td>{c.telefono}</td>
                <td>{c.empresa}</td>
                {isAdmin && (
                  <td className="actions">
                    <button className="link-button" onClick={() => startEdit(c)}>Editar</button>
                    <button className="link-button danger" onClick={() => onDelete(c.id)}>Eliminar</button>
                  </td>
                )}
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="muted centered">
                  Sin clientes todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
