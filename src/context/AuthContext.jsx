import { createContext, useContext, useMemo, useState } from 'react';
import { readStorage, writeStorage } from '../lib/storage';

const AuthContext = createContext(null);

const DEFAULT_USER = {
  id: 'usr_demo_001',
  name: 'Alex Morgan',
  email: 'alex.morgan@example.com',
  role: 'premium', // 'trader' | 'premium' | 'admin'
  plan: 'Institutional',
  initials: 'AM',
  memberSince: '2024-11-02',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStorage('auth.user', null));

  const persist = (next) => {
    setUser(next);
    writeStorage('auth.user', next);
  };

  const login = async ({ email }) => {
    const next = { ...DEFAULT_USER, email: email || DEFAULT_USER.email };
    persist(next);
    return next;
  };

  const loginWithProvider = async (provider) => {
    const next = {
      ...DEFAULT_USER,
      name: provider === 'apple' ? 'Alex Morgan' : DEFAULT_USER.name,
      email: `alex.morgan@${provider}.mock`,
    };
    persist(next);
    return next;
  };

  const signup = async ({ name, email }) => {
    const initials = (name || 'New Trader')
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const next = {
      ...DEFAULT_USER,
      id: `usr_${Date.now()}`,
      name: name || 'New Trader',
      email,
      role: 'trader',
      plan: 'Free',
      initials,
      memberSince: new Date().toISOString().slice(0, 10),
    };
    persist(next);
    return next;
  };

  const logout = () => persist(null);

  const setRole = (role) => {
    if (!user) return;
    persist({ ...user, role, plan: role === 'trader' ? 'Free' : user.plan === 'Free' ? 'Premium' : user.plan });
  };

  const value = useMemo(
    () => ({ user, login, loginWithProvider, signup, logout, setRole, isAuthenticated: !!user }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
