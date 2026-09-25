// Formatea un RUT chileno para mostrarlo: "180052038" -> "18.005.203-8".
// Solo es visual; la auth-api y la base lo guardan sin formato.
export function formatRut(value) {
  if (!value) return '';
  const clean = String(value).replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 2) return value;
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${clean.slice(-1)}`;
}
