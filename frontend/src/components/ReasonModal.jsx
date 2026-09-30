import { useState } from 'react';

const MAX_LENGTH = 500;

// Diálogo genérico para pedir un motivo obligatorio antes de confirmar una
// acción de administración (bloquear/desbloquear, cambiar rol). El botón de
// confirmar queda deshabilitado hasta que se escribe algo — el motivo queda
// en Actividad, ver backend/src/routes/me.js.
//
// Props: title, description (texto o nodo), confirmLabel, danger (botón rojo),
// onConfirm(reason) -> Promise, onCancel().
export function ReasonModal({ title, description, confirmLabel, danger, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const trimmed = reason.trim();

  async function handleConfirm() {
    if (!trimmed) return;
    setError('');
    setSaving(true);
    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError(err.data?.error || err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !saving && onCancel()}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {description && <p className="muted">{description}</p>}

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

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="table-action" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className={danger ? 'table-action--danger-solid' : undefined}
            onClick={handleConfirm}
            disabled={!trimmed || saving}
          >
            {saving ? 'Guardando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
