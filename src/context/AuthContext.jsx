import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async ({ email, password }) => {
    const { user } = await api.post('/auth/login', { email, password });
    setUser(user);
    return user;
  };

  const loginWithProvider = async (provider) => {
    const { user } = await api.post('/auth/provider', { provider });
    setUser(user);
    return user;
  };

  const signup = async ({ name, email, password }) => {
    const { user } = await api.post('/auth/signup', { name, email, password });
    setUser(user);
    return user;
  };

  const logout = async () => {
    await api.post('/auth/logout', {});
    setUser(null);
  };

  const setRole = async (role) => {
    const { user } = await api.patch('/auth/role', { role });
    setUser(user);
  };

  const value = useMemo(
    () => ({ user, loading, login, loginWithProvider, signup, logout, setRole, isAuthenticated: !!user }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
