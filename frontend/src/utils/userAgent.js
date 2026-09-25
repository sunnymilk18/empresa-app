// Resume el User-Agent del navegador en algo legible: "Chrome en Windows".
// Es aproximado (los navegadores imitan a otros; Brave aparece como Chrome).
export function describeUserAgent(ua) {
  if (!ua) return '—';

  let browser = 'Navegador desconocido';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  else if (/curl|node|axios|python|PostmanRuntime/i.test(ua)) browser = 'Cliente de API';

  let os = null;
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  return os ? `${browser} en ${os}` : browser;
}
