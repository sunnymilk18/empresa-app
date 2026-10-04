import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { PIN_RE, pinErrorMessage, usePinLock } from '../utils/pin';
import { PinField } from './PinField';

// Crear ('create') o cambiar ('change', pide el PIN actual) el PIN de la
// propia cuenta. El PIN es de la cuenta, no solo del panel: también
// desbloquea la app móvil. Sin onCancel no hay forma de cerrarlo (lo usa
// PinGate para obligar a crear el PIN); con cancelLabel se cambia el texto
// de ese botón.
export function PinSetupModal({ mode, cancelLabel = 'Cancelar', onDone, onCancel }) {
  const { accessToken, reloadProfile } = useAuth();
  const changing = mode === 'change';
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [locked, lock] = usePinLock();

  const mismatch = repeat !== '' && pin !== repeat;
  const ready = PIN_RE.test(pin) && pin === repeat && (!changing || PIN_RE.test(current));

  async function save(e) {
    e.preventDefault();
    if (!ready) return;
    setError('');
    setSaving(true);
    try {
      await api.setPin(changing ? { pin, current_pin: current } : { pin }, accessToken);
      await reloadProfile();
      onDone?.();
    } catch (err) {
      const code = err.data?.code;
      setError(pinErrorMessage(err));
      if (code === 'pin_invalid' || code === 'pin_locked') setCurrent('');
      if (code === 'pin_locked') lock(err.data.retry_after_seconds);
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <form className="modal card" onSubmit={save}>
        <h2 style={{ marginTop: 0 }}>{changing ? 'Cambiar PIN' : 'Crea tu PIN'}</h2>
        {!changing && (
          <p className="muted">
            Para confirmar acciones importantes (cambiar roles, bloquear cuentas, etc.) necesitas un
            PIN de 6 dígitos. Es el mismo con el que se desbloquea la app móvil.
          </p>
        )}

        {changing && <PinField label="PIN actual" value={current} onChange={setCurrent} disabled={saving} autoFocus />}
        <PinField label="PIN nuevo (6 dígitos)" value={pin} onChange={setPin} disabled={saving} autoFocus={!changing} />
        <PinField label="Repite el PIN nuevo" value={repeat} onChange={setRepeat} disabled={saving} />

        {mismatch && <p className="error" style={{ marginTop: 8 }}>Los PIN no coinciden.</p>}
        {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}

        <div className="modal-actions">
          {onCancel && (
            <button type="button" className="table-action" onClick={onCancel} disabled={saving}>
              {cancelLabel}
            </button>
          )}
          <button type="submit" disabled={!ready || saving || locked}>
            {saving ? 'Guardando...' : changing ? 'Cambiar PIN' : 'Crear PIN'}
          </button>
        </div>
      </form>
    </div>
  );
}
