import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type User } from './api';
import { resetAiStatus } from './lib/ai';
import { clearOfflineData } from './lib/offline';
import { flushOutbox } from './lib/outbox';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; university?: string; course?: string }) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User | null }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    const onUnauthorized = () => setUser(null);
    window.addEventListener('cs:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cs:unauthorized', onUnauthorized);
  }, []);

  const uid = user?.id ?? null;
  useEffect(() => {
    if (!loading) resetAiStatus(uid !== null);
  }, [uid, loading]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ user: User }>('/auth/login', { body: { email, password } });
    setUser(r.user);
  }, []);

  const register = useCallback(async (data: { name: string; email: string; password: string; university?: string; course?: string }) => {
    const r = await api<{ user: User }>('/auth/register', { body: data });
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    await flushOutbox().catch(() => 0); // send anything studied offline before leaving
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    await clearOfflineData();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, register, logout, setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
