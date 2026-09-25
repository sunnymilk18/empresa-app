import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { TotpSetup } from './TotpSetup';

// Segundo factor de la propia cuenta: activar o desactivar la app
// autenticadora. Sirve para cualquier rol y para cuentas que ya pasaron su
// primer login (donde se elige el método).
export function SecurityCard() {
  const { accessToken, profile, reloadProfile } = useAuth();
  const [settingUp, setSettingUp] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const usesApp = Boolean(profile?.totp_enabled);

  async function onEnabled() {
    await reloadProfile();
    setSettingUp(false);
    setNotice('App autenticadora activada. Desde ahora te pediremos su código al iniciar sesión.');
  }

  async function disable() {
    if (!window.confirm('¿Desactivar la app autenticadora? Volverás a recibir el código por correo.')) return;
    setError('');
    setNotice('');
    setDisabling(true);
    try {
      await api.totpDisable(accessToken);
      await reloadProfile();
      setNotice('App autenticadora desactivada. Desde ahora recibirás el código por correo.');
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setDisabling(false);
    }
  }

  return (
    <div className="card">
      <h2>Seguridad</h2>
      <ul className="kv">
        <li>
          <span>Segundo factor</span>
          <span>{usesApp ? '📱 App autenticadora' : '📧 Código por correo'}</span>
        </li>
      </ul>

      {notice && <p className="success" style={{ marginTop: 12 }}>{notice}</p>}
      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

      {settingUp ? (
        <div style={{ marginTop: 16 }}>
          <TotpSetup accessToken={accessToken} onConfirmed={onEnabled}>
            <button type="button" className="table-action" style={{ marginTop: 12 }} onClick={() => setSettingUp(false)}>
              Cancelar
            </button>
          </TotpSetup>
        </div>
      ) : usesApp ? (
        <button
          type="button"
          className="table-action table-action--danger"
          style={{ marginTop: 16 }}
          onClick={disable}
          disabled={disabling}
        >
          {disabling ? 'Desactivando...' : 'Desactivar app autenticadora'}
        </button>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 12 }}>
            La app autenticadora es más segura que el correo, pero si pierdes el celular no
            podrás entrar.
          </p>
          <button
            type="button"
            className="table-action"
            onClick={() => {
              setError('');
              setNotice('');
              setSettingUp(true);
            }}
          >
            Activar app autenticadora
          </button>
        </>
      )}
    </div>
  );
}
