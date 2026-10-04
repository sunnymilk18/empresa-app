import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAfterLogin } from '../auth/useAfterLogin';

// Se llega aquí solo cuando /auth/login respondió push_approval_offered=true:
// la cuenta ya tiene un celular emparejado (app auth-2fa-app) con la
// aprobación por notificación push activada. Mientras se espera, se hace
// polling a /auth/login/push-status (~2s, mismo patrón que usa la propia
// auth-api del lado del celular) mostrando el número que la persona debe
// tocar en su teléfono para confirmar que es la misma sesión.
export function PushLoginPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const afterLogin = useAfterLogin();
  const [number, setNumber] = useState(null);
  // pending | rejected | expired
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState('');
  const [requestingCode, setRequestingCode] = useState(false);
  const [fallbackError, setFallbackError] = useState('');
  const stoppedRef = useRef(false);
  const loginToken = state?.loginToken;

  useEffect(() => {
    if (!loginToken) return undefined;
    stoppedRef.current = false;

    async function poll() {
      try {
        const res = await api.pollPushLogin(loginToken);
        if (stoppedRef.current) return;
        setNumber(res.number);
        if (res.status === 'approved') {
          stoppedRef.current = true;
          await afterLogin(res);
        } else if (res.status === 'rejected') {
          stoppedRef.current = true;
          setStatus('rejected');
        }
        // 'pending': se sigue esperando, el intervalo vuelve a preguntar.
      } catch (err) {
        if (stoppedRef.current) return;
        stoppedRef.current = true;
        // La solicitud de aprobación expiró, ya se usó, o el servicio no
        // respondió: en cualquier caso no tiene sentido seguir esperando.
        setStatus('expired');
        setError(err.data?.error || err.message);
      }
    }

    poll();
    const id = setInterval(poll, 2000);
    return () => {
      stoppedRef.current = true;
      clearInterval(id);
    };
  }, [loginToken]);

  if (!loginToken) return <Navigate to="/login" replace />;

  async function fallbackToEmail() {
    setFallbackError('');
    setRequestingCode(true);
    try {
      await api.requestLoginEmailCode({ login_token: loginToken });
      navigate('/verify-otp', { state: { loginToken, method: 'email' } });
    } catch (err) {
      setFallbackError(err.data?.error || err.message);
    } finally {
      setRequestingCode(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>Aprueba desde tu celular</h1>

      {status === 'pending' && (
        <>
          <p className="muted">
            Te enviamos una notificación a tu celular. Ábrela y toca el número que coincide con este:
          </p>
          <p className="push-number">{number != null ? String(number).padStart(2, '0') : '··'}</p>
          <p className="muted">Esperando aprobación...</p>
        </>
      )}

      {status === 'rejected' && (
        <p className="error">
          Se rechazó la aprobación desde tu celular. Si no fuiste tú quien intentó iniciar sesión, cambia
          tu contraseña de inmediato.
        </p>
      )}

      {status === 'expired' && <p className="error">{error}</p>}

      {status !== 'pending' && (
        <button type="button" onClick={() => navigate('/login')} style={{ marginTop: 14 }}>
          Volver a intentar
        </button>
      )}

      {status === 'pending' && (
        <>
          {fallbackError && <p className="error">{fallbackError}</p>}
          <button
            type="button"
            className="link-button"
            style={{ marginTop: 14 }}
            onClick={fallbackToEmail}
            disabled={requestingCode}
          >
            {requestingCode ? 'Enviando...' : 'No puedo aprobar desde el celular: usar código por correo'}
          </button>
        </>
      )}
    </div>
  );
}
