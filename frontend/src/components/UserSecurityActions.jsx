import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { blockConfirmText, pendingText } from '../utils/moderation';

// "Acciones de seguridad" sobre la cuenta de otra persona, en su detalle:
// bloquear/desbloquear (aquí y en la auth-api), cerrar todas sus sesiones y
// desactivar su app autenticadora. Las dos últimas requieren la credencial
// de administración de la auth-api en el backend (features.authApiModeration).
// `lastMethod`: método de su último inicio de sesión ('otp' | 'totp'), como pista.
export function UserSecurityActions({ user, onUserChange, lastMethod }) {
  const { accessToken, profile } = useAuth();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null); // { type: 'success'|'warning'|'error', text }

  const isMe = user.auth_user_id === profile?.id;
  const moderationEnabled = Boolean(profile?.features?.authApiModeration);

  if (isMe) {
    return (
      <div className="card security-actions">
        <h2>Acciones de seguridad</h2>
        <p className="muted">
          Estas acciones no se pueden usar sobre tu propia cuenta. Para la tuya usa la tarjeta
          Seguridad del dashboard y el botón "Salir".
        </p>
      </div>
    );
  }

  async function run(key, confirmText, action, successText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    setMessage(null);
    try {
      const res = await action();
      if (res?.user) onUserChange(res.user);
      setMessage(res?.warning ? { type: 'warning', text: res.warning } : { type: 'success', text: successText });
    } catch (err) {
      setMessage({ type: 'error', text: err.data?.error || err.message });
    } finally {
      setBusy('');
    }
  }

  const blocked = Boolean(user.blocked_at);
  const pending = user.auth_api_pending_action;

  return (
    <div className="card security-actions">
      <h2>Acciones de seguridad</h2>

      <div className="security-action">
        <div>
          <strong>{blocked ? 'Desbloquear cuenta' : 'Bloquear cuenta'}</strong>
          <p className="muted">
            {blocked
              ? 'Vuelve a permitirle entrar al sistema.'
              : moderationEnabled
                ? 'No podrá entrar al sistema y se cerrarán todas sus sesiones.'
                : 'No podrá entrar al sistema.'}
          </p>
        </div>
        <button
          type="button"
          className={`table-action ${blocked ? '' : 'table-action--danger'}`}
          disabled={Boolean(busy)}
          onClick={() =>
            run(
              'block',
              blocked ? null : blockConfirmText(user.email, moderationEnabled),
              () => api.setLocalUserBlocked(user.auth_user_id, !blocked, accessToken),
              blocked ? 'Cuenta desbloqueada.' : 'Cuenta bloqueada.'
            )
          }
        >
          {busy === 'block' ? 'Guardando...' : blocked ? 'Desbloquear' : 'Bloquear'}
        </button>
      </div>

      {pending && (
        <div className="security-action security-action--pending">
          <p className="warning">⚠ {pendingText(pending)}</p>
          <button
            type="button"
            className="table-action"
            disabled={Boolean(busy)}
            onClick={() =>
              run(
                'retry',
                null,
                () => api.setLocalUserBlocked(user.auth_user_id, pending === 'ban', accessToken),
                'Aplicado también en el servicio de autenticación.'
              )
            }
          >
            {busy === 'retry' ? 'Reintentando...' : 'Reintentar'}
          </button>
        </div>
      )}

      {moderationEnabled ? (
        <>
          <div className="security-action">
            <div>
              <strong>Cerrar todas sus sesiones</strong>
              <p className="muted">
                Tendrá que volver a iniciar sesión en todos lados. No bloquea la cuenta. Útil si
                sospechas que alguien más la está usando.
              </p>
            </div>
            <button
              type="button"
              className="table-action"
              disabled={Boolean(busy)}
              onClick={() =>
                run(
                  'sessions',
                  `¿Cerrar todas las sesiones de ${user.email}? Tendrá que volver a iniciar sesión.`,
                  () => api.revokeUserSessions(user.auth_user_id, accessToken),
                  'Se cerraron todas sus sesiones.'
                )
              }
            >
              {busy === 'sessions' ? 'Cerrando...' : 'Cerrar sesiones'}
            </button>
          </div>

          <div className="security-action">
            <div>
              <strong>Desactivar su app autenticadora</strong>
              <p className="muted">
                Para quien perdió el celular: vuelve a recibir el código por correo.
                {lastMethod === 'totp' && ' Su último inicio de sesión fue con app autenticadora.'}
                {lastMethod === 'otp' && ' Su último inicio de sesión fue con código por correo.'}
              </p>
            </div>
            <button
              type="button"
              className="table-action"
              disabled={Boolean(busy)}
              onClick={() =>
                run(
                  'totp',
                  `¿Desactivar la app autenticadora de ${user.email}? Desde ahora recibirá el código por correo.`,
                  () => api.disableUserTotp(user.auth_user_id, accessToken),
                  'App autenticadora desactivada. Ahora recibirá el código por correo.'
                )
              }
            >
              {busy === 'totp' ? 'Desactivando...' : 'Desactivar app'}
            </button>
          </div>
        </>
      ) : (
        <p className="muted">
          Cerrar sus sesiones o desactivar su app autenticadora requiere la credencial de
          administración del servicio de autenticación (AUTH_API_SYSTEM_ADMIN_TOKEN), que no está
          configurada en el backend.
        </p>
      )}

      {message && <p className={message.type}>{message.text}</p>}
    </div>
  );
}
