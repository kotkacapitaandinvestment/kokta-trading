import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Clock3 } from 'lucide-react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileNav from './MobileNav';
import { traderNav, traderNavSecondary } from './navConfig';
import { useAuth } from '../../context/AuthContext';
import { useAppConfig } from '../../context/AppConfigContext';
import CommunityShell from '../../features/community/CommunityShell';

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

export default function AppLayout() {
  const { user, refreshUser } = useAuth();
  const config = useAppConfig();
  const location = useLocation();
  const navigate = useNavigate();

  // The API refuses feature requests from unverified traders (e.g. after a
  // rejection that happened mid-session); re-read the user and route them.
  useEffect(() => {
    const onKycRequired = () => refreshUser().then(() => navigate('/verify', { replace: true }));
    window.addEventListener('kotka:kyc-required', onKycRequired);
    return () => window.removeEventListener('kotka:kyc-required', onKycRequired);
  }, [refreshUser, navigate]);

  return (
    <CommunityShell>
    <div className="flex h-screen overflow-hidden bg-ink-50 dark:bg-ink-950">
      <Sidebar brandTo="/app/dashboard" items={traderNav} secondaryItems={traderNavSecondary} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={titleFromPath(location.pathname)} right={<MobileNav items={traderNav} secondaryItems={traderNavSecondary} />} />
        <VerificationBanner user={user} config={config} />
        <main className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
    </CommunityShell>
  );
}
