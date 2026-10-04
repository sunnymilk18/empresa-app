// Guarda dónde está el mouse dentro de la tarjeta bajo el cursor para que el
// resplandor de .card/.stat (styles.css) lo siga.
export function enableSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('.card, .stat');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  });
}
