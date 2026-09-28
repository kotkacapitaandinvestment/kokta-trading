import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Moon, Sun, ChevronDown, LogOut, ShieldCheck, User as UserIcon, Download, Share, LifeBuoy, MessageCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useCommunity } from '../../features/community/CommunityContext';
import { useInstallPrompt } from '../../lib/pwa';
import BrandMark from '../ui/BrandMark';
import { useAppConfig } from '../../context/AppConfigContext';
import { CONTACT, mailto } from '../../lib/contact';

export default function Topbar({ title, right }) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { unread } = useCommunity();
  const unreadCount = unread?.notifications ?? 0;
  const [open, setOpen] = useState(false);
  const [iosSteps, setIosSteps] = useState(false);
  const installer = useInstallPrompt();
  const { supportEmail } = useAppConfig();
  const navigate = useNavigate();

  return (
    // relative z-30: page content below (animated cards) would otherwise paint over the account menu.
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-ink-100 bg-white/80 px-4 backdrop-blur sm:h-16 lg:px-6 dark:border-ink-800 dark:bg-ink-900/80">
      <div className="flex min-w-0 items-center gap-2.5">
        <Link to="/app/dashboard" className="shrink-0 lg:hidden" aria-label="Kotka home"><BrandMark size={26} /></Link>
        <h2 className="truncate text-sm font-semibold text-ink-800 dark:text-ink-100">{title}</h2>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
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
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <Bell className="h-4 w-4" />
          {unreadCount ? <span className="absolute right-1 top-1 min-w-[1rem] rounded-full bg-loss-500 px-1 text-center text-[9px] font-semibold leading-4 text-white">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
        </Link>

        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Account menu"
            className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-500 text-xs font-semibold text-ink-950">
                {user?.initials ?? 'KT'}
              </div>
            )}
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
                {['moderator', 'admin', 'super_admin'].includes(user?.role) ? (
                  <Link
                    to="/admin/overview"
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Go to Admin Dashboard
                  </Link>
                ) : null}
                {installer.canInstall ? (
                  <button
                    onClick={() => { setOpen(false); installer.install(); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700"
                  >
                    <Download className="h-4 w-4" /> Install app
                  </button>
                ) : installer.iosManual ? (
                  <>
                    <button
                      onClick={() => setIosSteps((v) => !v)}
                      aria-expanded={iosSteps}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700"
                    >
                      <Download className="h-4 w-4" /> Add to Home Screen
                    </button>
                    {iosSteps ? (
                      <p className="px-3 pb-2 text-xs leading-5 text-ink-500 dark:text-ink-400">
                        In Safari, tap <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-label="Share" /> then <span className="font-medium text-ink-700 dark:text-ink-200">Add to Home Screen</span>. Push alerts on iPhone work from there.
                      </p>
                    ) : null}
                  </>
                ) : null}
                <a
                  href={mailto(supportEmail, 'Help with my Kotka account')}
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700"
                >
                  <LifeBuoy className="h-4 w-4" /> Get help
                </a>
                <a
                  href={mailto(CONTACT.hello, 'Feedback on Kotka')}
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700"
                >
                  <MessageCircle className="h-4 w-4" /> Share feedback
                </a>
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
