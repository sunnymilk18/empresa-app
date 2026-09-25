import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api';

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

  const setSession = useCallback((session) => {
    setTokens(session);
    saveSession(session);
  }, []);

  const loadProfile = useCallback(async (accessToken) => {
    try {
      const me = await api.me(accessToken);
      setProfile(me);
      return me;
    } catch {
      setProfile(null);
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

  async function completeLogin(tokenResponse) {
    setSession(tokenResponse);
    await loadProfile(tokenResponse.access_token);
  }

  async function logout() {
    if (tokens?.refresh_token) {
      try {
        await api.logout({ refresh_token: tokens.refresh_token });
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
    completeLogin,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
