import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

// Qué hacer con la respuesta de un paso de login (código, app o push): si la
// cuenta tiene el PIN obligatorio llega { pin_required, pin_token, pin_set } en
// vez de tokens y falta el paso del PIN; si no, entra al panel.
export function useAfterLogin() {
  const navigate = useNavigate();
  const { completeLogin } = useAuth();
  return async function afterLogin(res) {
    if (res.pin_required) {
      navigate('/pin-login', { state: { pinToken: res.pin_token, pinSet: res.pin_set } });
      return;
    }
    await completeLogin(res);
    navigate('/dashboard');
  };
}
