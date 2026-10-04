import { useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

// Protección de rutas del lado del cliente: sin sesión válida, redirige a
// /login. La protección REAL (la que importa) vive en el backend, que
// verifica el JWT en cada request — esto es solo una mejora de UX.
// `roles`: si se indica, solo esos roles pueden entrar a la ruta.
// `skeleton`: forma del relleno mientras se recupera la sesión: 'page' (por
// defecto, recuadro de altura estándar) o 'list' (más bajo, como una lista con
// pocas filas: el recuadro de esas pantallas mide lo que miden sus filas).
export function ProtectedRoute({ children, roles, skeleton = 'page' }) {
  const { isAuthenticated, loadingProfile, profile } = useAuth();
  const showedSkeleton = useRef(false);

  // Mientras se recupera la sesión: el recuadro estándar con relleno gris, así
  // el contenido se llena dentro de la misma forma en vez de aparecer de golpe.
  if (loadingProfile) {
    showedSkeleton.current = true;
    if (skeleton === 'list') {
      return (
        <div className="page page--static" aria-busy="true">
          <span className="skeleton-bar" style={{ width: '22%', height: 22 }} />
          <span className="skeleton-bar" style={{ width: '60%', marginTop: 18 }} />
          <span className="skeleton-block" style={{ height: 42, marginTop: 22 }} />
          <div className="skeleton-rows">
            {Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton-bar" style={{ width: `${88 - (i % 3) * 12}%` }} />)}
          </div>
          <span className="skeleton-bar" style={{ width: '30%', marginTop: 26 }} />
        </div>
      );
    }
    return (
      <div className="page page--std page--static" aria-busy="true">
        <span className="skeleton-bar" style={{ width: '28%', height: 22 }} />
        <span className="skeleton-bar" style={{ width: '55%', marginTop: 14 }} />
        <div className="skeleton-grid">
          <span className="skeleton-block" />
          <span className="skeleton-block" />
          <span className="skeleton-block" />
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(profile?.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  // Si venimos del relleno, el recuadro real no repite su entrada (se vería
  // un destello transparente); solo entra su contenido.
  return showedSkeleton.current ? <div className="after-skeleton">{children}</div> : children;
}
