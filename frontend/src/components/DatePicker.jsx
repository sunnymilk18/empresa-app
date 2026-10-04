import { useEffect, useRef, useState } from 'react';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];

const pad = (n) => String(n).padStart(2, '0');
const toValue = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;

// Calendario propio (el desplegable nativo de <input type="date"> no se puede
// estilizar). Trabaja con "AAAA-MM-DD", igual que el input nativo; '' = sin fecha.
export function DatePicker({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ year: 0, month: 0 });
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      const [y, m] = value ? value.split('-').map(Number) : [];
      const now = new Date();
      setView(value ? { year: y, month: m - 1 } : { year: now.getFullYear(), month: now.getMonth() });
    }
    setOpen(!open);
  }

  function shiftMonth(delta) {
    const d = new Date(view.year, view.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  }

  function pick(next) {
    onChange(next);
    setOpen(false);
  }

  const now = new Date();
  const today = toValue(now.getFullYear(), now.getMonth(), now.getDate());
  const blanks = (new Date(view.year, view.month, 1).getDay() + 6) % 7; // semana desde el lunes
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const shown = value ? value.split('-').reverse().join('-') : 'dd-mm-aaaa';

  return (
    <div className="toolbar-date datepicker" ref={ref}>
      {label}
      <button type="button" className="datepicker-trigger" onClick={toggle} aria-haspopup="dialog" aria-expanded={open}>
        <span className={value ? undefined : 'muted'}>{shown}</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="2" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
        </svg>
      </button>

      {open && (
        <div className="datepicker-pop" role="dialog" aria-label={`Elegir fecha: ${label}`}>
          <div className="datepicker-head">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">‹</button>
            <strong>{MONTHS[view.month]} de {view.year}</strong>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">›</button>
          </div>
          <div className="datepicker-grid">
            {WEEKDAYS.map((w) => <span key={w} className="datepicker-weekday">{w}</span>)}
            {Array.from({ length: blanks }, (_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = toValue(view.year, view.month, i + 1);
              const cls = ['datepicker-day', day === value && 'is-selected', day === today && 'is-today'].filter(Boolean).join(' ');
              return (
                <button key={day} type="button" className={cls} onClick={() => pick(day)}>{i + 1}</button>
              );
            })}
          </div>
          <div className="datepicker-foot">
            <button type="button" onClick={() => pick('')}>Borrar</button>
            <button type="button" onClick={() => pick(today)}>Hoy</button>
          </div>
        </div>
      )}
    </div>
  );
}
