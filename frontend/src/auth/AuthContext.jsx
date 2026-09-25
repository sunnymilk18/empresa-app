import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, configureAuth, isUnavailable } from '../api';

const AuthContext = createContext(null);

// Almacenamiento de sesión para esta DEMO local: localStorage. Documentado
// a propósito en el README (sección "Seguridad") — en una app real de
// producción, lo más seguro es guardar el refresh_token en una cookie
// httpOnly puesta por el backend, no accesible desde JavaScript.
const STORAGE_KEY = 'empresa_app_session';

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function saveSession(session) {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }) {
  const [tokens, setTokens] = useState(() => loadSession());
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  // Aviso para mostrar en /login cuando se cierra la sesión por una razón
  // que la persona debe conocer (p. ej. su cuenta fue bloqueada).
  const [sessionNotice, setSessionNotice] = useState('');

  const setSession = useCallback((session) => {
    setTokens(session);
    saveSession(session);
  }, []);

  // Le indica a api.js cómo leer y actualizar la sesión al renovar tokens.
  // Se lee de localStorage (no del estado) para ver lo que otra pestaña
  // haya guardado.
  useEffect(() => {
    configureAuth({
      getSession: loadSession,
      onRefreshed: (session) => setSession(session),
      onExpired: () => {
        setSession(null);
        setProfile(null);
        setSessionNotice('Tu sesión expiró. Vuelve a iniciar sesión.');
      },
    });
  }, [setSession]);

  // Mantiene sincronizadas las pestañas: si otra renueva los tokens o cierra
  // sesión, esta toma el cambio.
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== STORAGE_KEY) return;
      const next = loadSession();
      setTokens(next);
      if (!next) setProfile(null);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const loadProfile = useCallback(async (accessToken) => {
    try {
      const me = await api.me(accessToken);
      setProfile(me);
      setSessionNotice('');
      return me;
    } catch (err) {
      setProfile(null);
      if (isUnavailable(err)) {
        // Servicio caído: conservamos la sesión guardada para que al recargar,
        // cuando vuelva, no haya que repetir el login completo.
        setSessionNotice(err.data?.error || err.message);
        return null;
      }
      if (err.data?.code === 'account_blocked') setSessionNotice(err.data.error);
      setSession(null);
      return null;
    }
  }, [setSession]);

  useEffect(() => {
    const current = loadSession();
    if (current?.access_token) {
      loadProfile(current.access_token).finally(() => setLoadingProfile(false));
    } else {
      setLoadingProfile(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vuelve a pedir el perfil (p. ej. tras activar o desactivar la app
  // autenticadora, para que se refleje el método actual).
  async function reloadProfile() {
    const current = loadSession();
    if (current?.access_token) await loadProfile(current.access_token);
  }

  async function completeLogin(tokenResponse) {
    setSession(tokenResponse);
    await loadProfile(tokenResponse.access_token);
  }

  async function logout() {
    // El refresh_token más reciente puede haberlo guardado otra pestaña.
    const current = loadSession() ?? tokens;
    if (current?.refresh_token) {
      try {
        await api.logout({ refresh_token: current.refresh_token });
      } catch {
        // best-effort: igual limpiamos la sesión local
      }
    }
    setSession(null);
    setProfile(null);
  }

  const value = {
    accessToken: tokens?.access_token || null,
    profile,
    loadingProfile,
    isAuthenticated: Boolean(tokens?.access_token && profile),
    sessionNotice,
    completeLogin,
    reloadProfile,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
