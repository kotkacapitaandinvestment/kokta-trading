import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Moon, Sun, ChevronDown, LogOut, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

export default function Topbar({ title, right }) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout, setRole } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="flex h-16 items-center justify-between border-b border-ink-100 bg-white/80 px-4 backdrop-blur lg:px-6 dark:border-ink-800 dark:bg-ink-900/80">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-ink-800 dark:text-ink-100">{title}</h2>
      </div>

      <div className="flex items-center gap-2">
        {right}

        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <Link
          to="/app/notifications"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </Link>

        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-500 text-xs font-semibold text-ink-950">
              {user?.initials ?? 'KT'}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
          </button>

          {open ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-ink-100 bg-white p-1.5 shadow-pop dark:border-ink-700 dark:bg-ink-800 dark:shadow-none">
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-50">{user?.name}</p>
                  <p className="truncate text-xs text-ink-400">{user?.email}</p>
                </div>
                <div className="my-1 h-px bg-ink-100 dark:bg-ink-700" />
                <Link
                  to="/app/settings"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700"
                >
                  <UserIcon className="h-4 w-4" /> Profile & Settings
                </Link>
                {user?.role === 'trader' || user?.role === 'premium' ? (
                  <button
                    onClick={async () => {
                      setOpen(false);
                      await setRole('admin');
                      navigate('/admin/overview');
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Preview Admin Dashboard
                  </button>
                ) : null}
                {['admin', 'super_admin'].includes(user?.role) ? (
                  <Link
                    to="/admin/overview"
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Go to Admin Dashboard
                  </Link>
                ) : null}
                {user?.role === 'admin' ? (
                  <button
                    onClick={async () => {
                      setOpen(false);
                      await setRole('super_admin');
                      navigate('/admin/integrations');
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Preview Super Admin
                  </button>
                ) : null}
                {['admin', 'super_admin'].includes(user?.role) ? (
                  <button
                    onClick={async () => {
                      setOpen(false);
                      await setRole('premium');
                      navigate('/app/dashboard');
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Exit Admin Preview
                  </button>
                ) : null}
                <div className="my-1 h-px bg-ink-100 dark:bg-ink-700" />
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-loss-500 hover:bg-loss-50 dark:hover:bg-loss-500/10"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
