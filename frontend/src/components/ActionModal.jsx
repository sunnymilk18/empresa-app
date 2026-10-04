import { useState } from 'react';
import { PIN_RE, pinErrorMessage, usePinLock } from '../utils/pin';
import { PinField } from './PinField';

const MAX_LENGTH = 500;

// Diálogo para confirmar una acción de administración. Pide un motivo
// (askReason, queda en Actividad) y/o el PIN de la cuenta (askPin, solo cuando
// el servidor lo exige: features.adminPin). El botón de confirmar queda
// deshabilitado hasta completar lo que se pide. Si no se pide nada, funciona
// como un simple "¿estás seguro?".
//
// onConfirm({ reason, pin }) debe lanzar el error si falla: el diálogo lo
// muestra y se queda abierto; si sale bien, quien lo usa lo cierra.
export function ActionModal({
  title,
  description,
  confirmLabel,
  danger,
  askReason = true,
  askPin = false,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [locked, lock] = usePinLock();

  const trimmed = reason.trim();
  const ready = (!askReason || trimmed) && (!askPin || PIN_RE.test(pin));

  async function handleConfirm() {
    setError('');
    setSaving(true);
    try {
      await onConfirm({ reason: trimmed, pin: askPin ? pin : undefined });
    } catch (err) {
      const code = err.data?.code;
      setError(pinErrorMessage(err));
      if (code === 'pin_invalid' || code === 'pin_locked') setPin('');
      if (code === 'pin_locked') lock(err.data.retry_after_seconds);
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !saving && onCancel()}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {description && <p className="muted">{description}</p>}

        {askReason && (
          <>
            <label className="form" style={{ marginTop: 8 }}>
              Motivo (obligatorio)
              <textarea
                autoFocus
                rows={3}
                maxLength={MAX_LENGTH}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explica brevemente el motivo de esta acción"
                disabled={saving}
              />
            </label>
            <p className="muted" style={{ textAlign: 'right', marginTop: 2 }}>
              {trimmed.length}/{MAX_LENGTH}
            </p>
          </>
        )}

        {askPin && (
          <PinField label="Tu PIN (6 dígitos)" value={pin} onChange={setPin} disabled={saving} autoFocus={!askReason} />
        )}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="table-action" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className={danger ? 'table-action--danger-solid' : undefined}
            onClick={handleConfirm}
            disabled={!ready || saving || locked}
          >
            {saving ? 'Guardando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
