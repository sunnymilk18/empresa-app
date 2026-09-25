import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

// Protección de rutas del lado del cliente: sin sesión válida, redirige a
// /login. La protección REAL (la que importa) vive en el backend, que
// verifica el JWT en cada request — esto es solo una mejora de UX.
// `roles`: si se indica, solo esos roles pueden entrar a la ruta.
export function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, loadingProfile, profile } = useAuth();

  if (loadingProfile) return <p className="centered">Cargando...</p>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(profile?.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
