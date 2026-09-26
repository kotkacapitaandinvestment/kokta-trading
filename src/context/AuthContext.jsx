import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(
    () =>
      api
        .get('/auth/me')
        .then(({ user }) => {
          setUser(user);
          return user;
        })
        .catch(() => {
          setUser(null);
          return null;
        }),
    [],
  );

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = async ({ email, password }) => {
    const { user } = await api.post('/auth/login', { email, password });
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

  // Local patch after an action the server already confirmed (profile edit,
  // KYC submission) so the shell updates without a round trip.
  const patchUser = useCallback((changes) => setUser((prev) => (prev ? { ...prev, ...changes } : prev)), []);

  const value = useMemo(
    () => ({ user, loading, login, signup, logout, refreshUser, patchUser, setUser, isAuthenticated: !!user }),
    [user, loading, refreshUser, patchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

const ADMIN_ROLES = ['admin', 'super_admin'];

// Traders must submit identity details before using the app; access continues
// while the review is pending. Admins are exempt.
export function needsVerification(user, config) {
  if (!user || !config?.kycRequired || ADMIN_ROLES.includes(user.role)) return false;
  return user.kycStatus === 'none' || user.kycStatus === 'rejected';
}
