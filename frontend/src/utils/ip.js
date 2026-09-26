// Muestra una IP de forma legible. Las IPv4 que llegan por un socket IPv6
// vienen como "::ffff:190.22.1.5"; se muestra solo "190.22.1.5".
export function formatIp(ip) {
  if (!ip) return '—';
  return ip.replace(/^::ffff:/i, '');
}
