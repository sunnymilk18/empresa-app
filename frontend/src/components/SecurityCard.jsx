import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { TotpSetup } from './TotpSetup';
import { PinSetupModal } from './PinSetupModal';

// Segundo factor de la propia cuenta: activar o desactivar la app
// autenticadora. Sirve para cualquier rol y para cuentas que ya pasaron su
// primer login (donde se elige el método). Un superadmin con PIN (cuando el
// servidor lo exige, features.adminPin) también puede cambiarlo desde aquí.
// `embedded`: sin tarjeta ni título propios, para ir dentro de "Mi cuenta".
export function SecurityCard({ embedded = false }) {
  const { accessToken, profile, reloadProfile } = useAuth();
  const [settingUp, setSettingUp] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const usesApp = Boolean(profile?.totp_enabled);
  const canChangePin =
    profile?.role === 'superadmin' && profile.features?.adminPin && profile.pin_set === true;

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
    <div className={embedded ? 'account-security' : 'card'}>
      {!embedded && <h2>Seguridad</h2>}
      <ul className="kv">
        <li>
          <span>Segundo factor</span>
          <span className="factor">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {usesApp ? (
                <>
                  <rect x="7" y="2.5" width="10" height="19" rx="2" />
                  <path d="M11 18.5h2" />
                </>
              ) : (
                <>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 7l9 6 9-6" />
                </>
              )}
            </svg>
            {usesApp ? 'App autenticadora' : 'Código por correo'}
            {usesApp && <span className="badge badge-active">Activa</span>}
          </span>
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
      ) : (
        <>
          {!usesApp && (
            <p className="muted" style={{ marginTop: 12 }}>
              La app autenticadora es más segura que el correo, pero si pierdes el celular no
              podrás entrar.
            </p>
          )}
          <div className="account-actions">
            {usesApp ? (
              <button type="button" className="table-action" onClick={disable} disabled={disabling}>
                {disabling ? 'Desactivando...' : 'Desactivar app autenticadora'}
              </button>
            ) : (
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
            )}
            {canChangePin && (
              <button
                type="button"
                className="table-action"
                onClick={() => {
                  setError('');
                  setNotice('');
                  setChangingPin(true);
                }}
              >
                Cambiar PIN
              </button>
            )}
          </div>
        </>
      )}

      {changingPin && (
        <PinSetupModal
          mode="change"
          onDone={() => {
            setChangingPin(false);
            setNotice('PIN cambiado.');
          }}
          onCancel={() => setChangingPin(false)}
        />
      )}
    </div>
  );
}
