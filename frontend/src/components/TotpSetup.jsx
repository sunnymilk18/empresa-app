import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api';

// Clave en grupos de 4 para copiarla a mano con menos errores.
function groupSecret(secret) {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

// Activación de la app autenticadora: muestra el QR (y la clave en texto),
// y pide el primer código de 6 dígitos para confirmar.
// - Primer login: pasar `loginToken`; onConfirmed recibe los tokens de sesión.
// - Desde el perfil: pasar `accessToken`; onConfirmed se llama sin datos.
// El QR se genera en el navegador: la clave secreta nunca sale del equipo.
export function TotpSetup({ loginToken, accessToken, onConfirmed, children }) {
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  // StrictMode ejecuta los efectos dos veces en desarrollo; cada enroll genera
  // una clave nueva, así que pedimos una sola para que el QR sea el vigente.
  const enrolled = useRef(false);

  useEffect(() => {
    if (enrolled.current) return;
    enrolled.current = true;
    (async () => {
      try {
        const res = await api.totpEnroll(loginToken ? { login_token: loginToken } : {}, accessToken);
        setSecret(new URL(res.otpauth_url).searchParams.get('secret') || '');
        setQr(await QRCode.toDataURL(res.otpauth_url, { margin: 1, width: 200 }));
      } catch (err) {
        setError(err.data?.error || err.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setConfirming(true);
    try {
      const res = await api.totpConfirm(
        loginToken ? { login_token: loginToken, code } : { code },
        accessToken
      );
      await onConfirmed(res);
    } catch (err) {
      setError(err.data?.error || err.message);
      setConfirming(false);
    }
  }

  if (loading) return <p className="muted">Preparando el código QR...</p>;

  return (
    <div className="totp-setup">
      {qr && (
        <>
          <ol className="totp-steps">
            <li>
              Abre tu app autenticadora (Google Authenticator, Microsoft Authenticator, Authy…)
              y escanea este código.
            </li>
            <li>Escribe abajo el código de 6 dígitos que te muestra la app.</li>
          </ol>
          <img className="totp-qr" src={qr} alt="Código QR para la app autenticadora" />
          {secret && (
            <p className="muted totp-secret">
              ¿No puedes escanear? Ingresa esta clave a mano:
              <code>{groupSecret(secret)}</code>
            </p>
          )}
          <form onSubmit={onSubmit} className="form">
            <label>
              Código de la app
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={confirming || code.length !== 6}>
              {confirming ? 'Verificando...' : 'Activar app autenticadora'}
            </button>
          </form>
        </>
      )}
      {!qr && error && <p className="error">{error}</p>}
      {children}
    </div>
  );
}
