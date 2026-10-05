import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { ActionModal } from '../components/ActionModal';
import { TableSkeleton } from '../components/TableSkeleton';

const COLUMNS = ['IP', 'Referencia', 'Baneada', 'Vence', 'Nivel', ''];

// La auth-api manda las fechas en segundos Unix.
function formatUnix(seconds) {
  return new Date(seconds * 1000).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Cuánto falta, en la unidad que se entiende de un vistazo.
function remaining(seconds) {
  const left = seconds * 1000 - Date.now();
  if (left <= 0) return 'por vencer';
  const minutes = Math.ceil(left / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.ceil(hours / 24)} días`;
}

// IPs que la auth-api baneó sola por demasiados intentos (3 veces en 24 h: 24 h, luego
// 72 h y luego 7 días) y que este sistema generó. Una IP puede ser de una oficina o una
// biblioteca donde varias personas comparten conexión, así que un superadmin puede
// levantar el baneo (con motivo y PIN, queda en Actividad). El baneo vale para esa IP en
// todos los sistemas que usan la API; aquí solo se ven y se levantan los de este.
export function BloqueosPage() {
  const { accessToken, profile } = useAuth();
  const [bans, setBans] = useState(null); // null = cargando
  const [error, setError] = useState('');
  const [ban, setBan] = useState(null); // el baneo que se va a levantar
  const [message, setMessage] = useState('');
  const pinEnforced = Boolean(profile?.features?.adminPin);

  function load() {
    return api
      .listBans(accessToken)
      .then((res) => {
        setBans(res.bans);
        setError('');
      })
      .catch((err) => {
        setBans((current) => current ?? []);
        setError(err.data?.error || err.message);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si falla, lanza el error: el ActionModal lo muestra y se queda abierto.
  async function lift({ reason, pin }) {
    try {
      await api.liftBan(ban.ip, reason, pin, accessToken);
    } catch (err) {
      // Ya no existe (venció o lo levantó el operador): se refresca la lista y se explica.
      if (err.data?.code === 'ban_not_found') load();
      throw err;
    }
    setMessage(`Baneo de ${ban.ip} levantado. Ya puede volver a intentar.`);
    setBan(null);
    load();
  }

  return (
    <div className="page page--scroll">
      <h1>Bloqueos</h1>
      <p className="muted">
        Conexiones (IP) que el servicio de autenticación bloqueó solas por demasiados intentos
        fallidos. Si quien quedó bloqueado comparte la conexión con otras personas, puedes levantar
        el baneo. El código de referencia es el que ve la persona en pantalla al ser bloqueada.
      </p>

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      {bans === null ? (
        <TableSkeleton headers={COLUMNS} />
      ) : bans.length === 0 ? (
        !error && <p className="muted">No hay conexiones bloqueadas en este momento.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c || 'acciones'}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bans.map((b) => (
                <tr key={b.ip}>
                  <td className="nowrap">{b.ip}</td>
                  <td>{b.reference ? <span className="badge badge-active" style={{ textTransform: 'none' }}>{b.reference}</span> : '—'}</td>
                  <td className="nowrap cell-dim">{formatUnix(b.banned_at)}</td>
                  <td className="nowrap cell-dim cell-stack">
                    <span>{formatUnix(b.banned_until)}</span>
                    <span>faltan {remaining(b.banned_until)}</span>
                  </td>
                  <td>
                    <span className="badge badge-blocked">Nivel {b.level}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="table-action"
                      onClick={() => {
                        setMessage('');
                        setBan(b);
                      }}
                    >
                      Levantar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ban && (
        <ActionModal
          title="Levantar baneo"
          description={`¿Levantar el baneo de la conexión ${ban.ip}? Podrá volver a intentar de inmediato. Si repite el abuso, se bloqueará de nuevo.`}
          confirmLabel="Levantar baneo"
          askReason
          askPin={pinEnforced}
          onConfirm={lift}
          onCancel={() => setBan(null)}
        />
      )}
    </div>
  );
}
