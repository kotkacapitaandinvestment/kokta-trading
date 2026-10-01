import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Clock3, Download, MailWarning, WifiOff } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from '../../lib/dialogs';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileNav from './MobileNav';
import BottomNav from './BottomNav';
import { traderNav, traderNavSecondary } from './navConfig';
import { useAuth } from '../../context/AuthContext';
import { useAppConfig } from '../../context/AppConfigContext';
import CommunityShell from '../../features/community/CommunityShell';
import { isStandalone, resyncPush } from '../../lib/pwa';
import { PageLoading } from '../../lib/lazyPage';

// On phones the More menu also offers the app, until Kotka is opened as one.
const phoneSecondaryNav = () => (isStandalone() ? traderNavSecondary : [...traderNavSecondary, { to: '/install', label: 'Get the app', icon: Download }]);

const titleFromPath = (pathname) => {
  const match = [...traderNav, ...traderNavSecondary].find((i) => pathname.startsWith(i.to));
  return match?.label ?? 'Kotka Trading';
};

// Pending verification doesn't block anything, it just stays visible until
// an administrator has reviewed it.
function VerificationBanner({ user, config }) {
  if (!config.kycRequired || ['admin', 'super_admin'].includes(user?.role) || user?.kycStatus !== 'pending') return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 lg:px-8">
      <Clock3 className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1">Your identity details are being reviewed. You have full access in the meantime.</span>
      <Link to="/verify" className="shrink-0 font-medium underline-offset-2 hover:underline">View</Link>
    </div>
  );
}

// Until the email address is confirmed; can be hidden for this visit.
function EmailBanner({ user }) {
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user || user.emailVerified !== false || hidden) return null;
  const resend = async () => {
    setBusy(true);
    try {
      const r = await api.post('/account/verify-email/resend', {});
      toast(r.alreadyVerified ? 'Your email is already confirmed.' : `We’ve sent a new link to ${user.email}.`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2 border-b border-accent-500/20 bg-accent-50 px-4 py-2 text-xs text-accent-900 dark:bg-accent-500/10 dark:text-accent-200 lg:px-8">
      <MailWarning className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1">Please confirm your email, so you can reset your password if you ever forget it.</span>
      <button type="button" disabled={busy} onClick={resend} className="shrink-0 font-medium underline-offset-2 hover:underline disabled:opacity-50">{busy ? 'Sending…' : 'Send confirmation link'}</button>
      <button type="button" onClick={() => setHidden(true)} className="shrink-0 text-accent-800 hover:underline dark:text-accent-300">Later</button>
    </div>
  );
}

function ConnectionBanner() {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b border-ink-200 bg-ink-100 px-4 py-2 text-xs text-ink-600 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300 lg:px-8">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      You're offline. Prices, messages and research refresh when you reconnect.
    </div>
  );
}

export default function AppLayout() {
  const { user, refreshUser } = useAuth();
  const config = useAppConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Full-height screens (Kotka AI, Messages, market rooms) size themselves to
  // the window; --banners tells them how much room the notices above take.
  const banners = useRef(null);
  useEffect(() => {
    const el = banners.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const set = () => document.documentElement.style.setProperty('--banners', `${el.offsetHeight}px`);
    const ro = new ResizeObserver(set);
    ro.observe(el);
    set();
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--banners'); };
  }, []);
  // Keep this browser's push subscription tied to the current session.
  useEffect(() => {
    if (user?.id) resyncPush();
  }, [user?.id]);

  // A tapped push notification asks the open window to go to its link.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (e) => {
      if (e.data?.type !== 'navigate' || !e.data.link) return;
      const url = new URL(e.data.link, window.location.origin);
      if (url.origin === window.location.origin) navigate(url.pathname + url.search);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  // The API refuses feature requests from unverified traders (e.g. after a
  // rejection that happened mid-session); re-read the user and route them.
  useEffect(() => {
    const onKycRequired = () => refreshUser().then(() => navigate('/verify', { replace: true }));
    window.addEventListener('kotka:kyc-required', onKycRequired);
    return () => window.removeEventListener('kotka:kyc-required', onKycRequired);
  }, [refreshUser, navigate]);

  return (
    <CommunityShell>
    <div className="flex h-[100dvh] overflow-hidden bg-ink-50 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] dark:bg-ink-950">
      <Sidebar brandTo="/app/dashboard" items={traderNav} secondaryItems={traderNavSecondary} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={titleFromPath(location.pathname)} />
        <MobileNav items={traderNav} secondaryItems={phoneSecondaryNav()} open={menuOpen} onOpenChange={setMenuOpen} />
        <div ref={banners} className="shrink-0">
          <ConnectionBanner />
          <VerificationBanner user={user} config={config} />
          <EmailBanner user={user} />
        </div>
        <main className="flex-1 overflow-y-auto scrollbar-thin px-4 py-5 sm:py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl animate-fade-in">
            <Suspense fallback={<PageLoading />}><Outlet /></Suspense>
          </div>
        </main>
        <BottomNav onMore={() => setMenuOpen((o) => !o)} moreOpen={menuOpen} />
      </div>
    </div>
    </CommunityShell>
  );
}
