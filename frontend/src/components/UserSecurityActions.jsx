import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { blockConfirmText, pendingText } from '../utils/moderation';
import { pinErrorMessage } from '../utils/pin';
import { ActionModal } from './ActionModal';

// Reintentar lo pendiente en la auth-api no es una decisión nueva (ya se
// decidió al bloquear/desbloquear la primera vez): no se le vuelve a pedir
// motivo a la persona, se manda uno automático que deja constancia del porqué.
const RETRY_REASON = 'Reintento de sincronización con el servicio de autenticación.';

// "Acciones de seguridad" sobre la cuenta de otra persona, en su detalle:
// bloquear/desbloquear (aquí y en la auth-api), cerrar todas sus sesiones,
// desactivar su app autenticadora y resetear su PIN. Las tres últimas
// requieren la credencial de administración de la auth-api en el backend
// (features.authApiModeration). Cada una se confirma en un ActionModal, que
// pide además el PIN si el servidor lo exige (features.adminPin).
export function UserSecurityActions({ user, onUserChange }) {
  const { accessToken, profile } = useAuth();
  const [modal, setModal] = useState(null); // 'block' | 'retry' | 'sessions' | 'totp' | 'resetPin'
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success'|'warning'|'error', text }

  const isMe = user.auth_user_id === profile?.id;
  const moderationEnabled = Boolean(profile?.features?.authApiModeration);
  const pinEnforced = Boolean(profile?.features?.adminPin);

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

  const blocked = Boolean(user.blocked_at);
  const pending = user.auth_api_pending_action;
  const id = user.auth_user_id;

  const actions = {
    block: {
      title: blocked ? 'Desbloquear cuenta' : 'Bloquear cuenta',
      description: blocked
        ? `¿Desbloquear a ${user.email}? Podrá volver a entrar al sistema.`
        : blockConfirmText(user.email, moderationEnabled),
      confirmLabel: blocked ? 'Desbloquear' : 'Bloquear',
      danger: !blocked,
      askReason: true,
      call: ({ reason, pin }) => api.setLocalUserBlocked(id, !blocked, reason, pin, accessToken),
      success: blocked ? 'Cuenta desbloqueada.' : 'Cuenta bloqueada.',
    },
    retry: {
      title: 'Reintentar en el servicio de autenticación',
      description: `Volver a aplicar ${pending === 'ban' ? 'el bloqueo' : 'el desbloqueo'} de ${user.email} en el servicio de autenticación.`,
      confirmLabel: 'Reintentar',
      call: ({ pin }) => api.setLocalUserBlocked(id, pending === 'ban', RETRY_REASON, pin, accessToken),
      success: 'Aplicado también en el servicio de autenticación.',
    },
    sessions: {
      title: 'Cerrar todas sus sesiones',
      description: `¿Cerrar todas las sesiones de ${user.email}? Tendrá que volver a iniciar sesión.`,
      confirmLabel: 'Cerrar sesiones',
      askReason: true,
      call: ({ reason, pin }) => api.revokeUserSessions(id, reason, pin, accessToken),
      success: 'Se cerraron todas sus sesiones.',
    },
    totp: {
      title: 'Desactivar su app autenticadora',
      description: `¿Desactivar la app autenticadora de ${user.email}? Desde ahora recibirá el código por correo.`,
      confirmLabel: 'Desactivar TOTP',
      askReason: true,
      call: ({ reason, pin }) => api.disableUserTotp(id, reason, pin, accessToken),
      success: 'App autenticadora desactivada. Ahora recibirá el código por correo.',
    },
    changeEmail: {
      title: 'Corregir su correo',
      description: `Se enviará un código al correo nuevo. El correo de ${user.email} solo cambiará cuando la propia persona lo confirme con ese código; tú no lo verás. Al confirmarse se cierran todas sus sesiones.`,
      confirmLabel: 'Enviar código',
      askReason: true,
      askEmail: true,
      call: ({ email, reason, pin }) => api.changeUserEmail(id, email, reason, pin, accessToken),
      success: 'Código enviado al correo nuevo. La persona debe confirmarlo en "Confirmar correo nuevo", desde el inicio de sesión.',
    },
    resetPassword: {
      title: 'Restablecer su contraseña',
      description: `¿Enviarle a ${user.email} el código para restablecer su contraseña? Le llegará a su correo y ella elegirá la nueva; tú no la verás.`,
      confirmLabel: 'Enviar código',
      askReason: true,
      call: ({ reason, pin }) => api.sendUserPasswordReset(id, reason, pin, accessToken),
      success: 'Código enviado a su correo. Ella elegirá su nueva contraseña.',
    },
    resetPin: {
      title: 'Resetear su PIN',
      description: `¿Resetear el PIN de ${user.email}? Se cerrarán sus sesiones y se revocarán sus dispositivos de confianza; creará un PIN nuevo al volver a entrar.`,
      confirmLabel: 'Resetear PIN',
      askReason: true,
      call: ({ reason, pin }) => api.resetUserPin(id, reason, pin, accessToken),
      success: 'PIN reseteado. Creará uno nuevo al volver a entrar.',
    },
  };

  // Si falla, lanza el error: el ActionModal lo muestra y se queda abierto.
  async function confirm(kind, values) {
    const res = await actions[kind].call(values);
    if (res?.user) onUserChange(res.user);
    setMessage(
      res?.warning ? { type: 'warning', text: res.warning } : { type: 'success', text: actions[kind].success }
    );
    setModal(null);
  }

  function open(kind) {
    setMessage(null);
    setModal(kind);
  }

  // Sin PIN que pedir, reintentar sale directo, sin diálogo.
  async function retry() {
    if (pinEnforced) {
      open('retry');
      return;
    }
    setMessage(null);
    setRetrying(true);
    try {
      await confirm('retry', {});
    } catch (err) {
      setMessage({ type: 'error', text: pinErrorMessage(err) });
    } finally {
      setRetrying(false);
    }
  }

  const blockHint = blocked
    ? 'Vuelve a permitirle entrar.'
    : moderationEnabled
      ? 'No podrá entrar y se cerrarán sus sesiones.'
      : 'No podrá entrar.';

  return (
    <div className="card security-actions">
      <h2>Acciones de seguridad</h2>
      <p className="muted security-hint">Cada acción pide confirmación. Pasa el mouse sobre un botón para ver qué hace.</p>

      <div className="security-action" title={blockHint}>
        <div>
          <strong>{blocked ? 'Desbloquear cuenta' : 'Bloquear cuenta'}</strong>
          <p className="muted">{blockHint}</p>
        </div>
        <button
          type="button"
          className={`table-action ${blocked ? '' : 'table-action--danger'}`}
          onClick={() => open('block')}
        >
          {blocked ? 'Desbloquear' : 'Bloquear'}
        </button>
      </div>

      {pending && (
        <div className="security-action security-action--pending">
          <p className="warning">⚠ {pendingText(pending)}</p>
          <button type="button" className="table-action" disabled={retrying} onClick={retry}>
            {retrying ? 'Reintentando...' : 'Reintentar'}
          </button>
        </div>
      )}

      {moderationEnabled ? (
        <>
          <div className="security-action" title="Tendrá que volver a iniciar sesión. No bloquea la cuenta.">
            <div>
              <strong>Cerrar todas sus sesiones</strong>
              <p className="muted">
                Tendrá que volver a iniciar sesión. No bloquea la cuenta.
              </p>
            </div>
            <button type="button" className="table-action" onClick={() => open('sessions')}>
              Cerrar sesiones
            </button>
          </div>

          <div className="security-action" title="Para quien perdió el celular: vuelve al código por correo.">
            <div>
              <strong>Desactivar su app autenticadora</strong>
              <p className="muted">
                Para quien perdió el celular: vuelve al código por correo.
              </p>
            </div>
            <button type="button" className="table-action" onClick={() => open('totp')}>
              Desactivar TOTP
            </button>
          </div>

          <div
            className="security-action security-action--wide"
            title="Le llega un código a su correo y ella elige la nueva contraseña; tú no la ves."
          >
            <div>
              <strong>Restablecer su contraseña</strong>
              <p className="muted">Le llega un código a su correo y ella elige la nueva contraseña; tú no la ves.</p>
            </div>
            <button type="button" className="table-action" onClick={() => open('resetPassword')}>
              Restablecer contraseña
            </button>
          </div>

          <div
            className="security-action security-action--wide"
            title="Para quien se equivocó al escribir su correo: le llega un código al correo nuevo y ella lo confirma."
          >
            <div>
              <strong>Corregir su correo</strong>
              <p className="muted">Para quien se equivocó al escribir su correo: le llega un código al correo nuevo y ella lo confirma.</p>
            </div>
            <button type="button" className="table-action" onClick={() => open('changeEmail')}>
              Corregir correo
            </button>
          </div>

          {pinEnforced && (
            <div className="security-action" title="Para quien lo olvidó: crea uno nuevo al volver a entrar.">
              <div>
                <strong>Resetear su PIN</strong>
                <p className="muted">
                  Para quien lo olvidó: crea uno nuevo al volver a entrar.
                </p>
              </div>
              <button type="button" className="table-action" onClick={() => open('resetPin')}>
                Resetear PIN
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="muted">
          Cerrar sus sesiones, desactivar su app autenticadora o resetear su PIN requiere la
          credencial de administración del servicio de autenticación (AUTH_API_SYSTEM_ADMIN_TOKEN),
          que no está configurada en el backend.
        </p>
      )}

      {message && <p className={message.type}>{message.text}</p>}

      {modal && (
        <ActionModal
          title={actions[modal].title}
          description={actions[modal].description}
          confirmLabel={actions[modal].confirmLabel}
          danger={actions[modal].danger}
          askReason={Boolean(actions[modal].askReason)}
          askEmail={Boolean(actions[modal].askEmail)}
          askPin={pinEnforced}
          onConfirm={(values) => confirm(modal, values)}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}
