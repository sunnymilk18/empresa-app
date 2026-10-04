import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const LEAVE_MS = 220;

// Cambiar de pantalla con un fundido de salida: marca `leaving` (el CSS
// .is-leaving apaga la tarjeta) y navega recién cuando termina. Con "reducir
// movimiento" navega al instante.
export function useLeave() {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  function leaveTo(to, options) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      navigate(to, options);
      return;
    }
    setLeaving(true);
    timer.current = setTimeout(() => navigate(to, options), LEAVE_MS);
  }

  // Props para un <Link>: respeta ctrl/cmd/shift + clic (abrir en otra pestaña).
  function linkProps(to) {
    return {
      to,
      onClick: (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        leaveTo(to);
      },
    };
  }

  return { leaving, leaveTo, linkProps };
}
