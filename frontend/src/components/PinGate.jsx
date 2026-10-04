import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PinSetupModal } from './PinSetupModal';

// Obliga a un superadmin que aún no tiene PIN a crearlo, cuando el servidor lo
// exige (features.adminPin). Solo actúa si se sabe con certeza que no hay PIN
// (pin_set === false): si la auth-api no respondió y el dato falta, no fuerza
// nada. Al guardarlo, el perfil se recarga y este aviso desaparece solo.
export function PinGate() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  const needsPin =
    profile?.role === 'superadmin' && profile.features?.adminPin && profile.pin_set === false;
  if (!needsPin) return null;

  async function leave() {
    await logout();
    navigate('/login');
  }

  return <PinSetupModal mode="create" cancelLabel="Cerrar sesión" onCancel={leave} />;
}
