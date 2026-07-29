import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileNav from './MobileNav';
import { traderNav, traderNavSecondary } from './navConfig';
import { useAuth } from '../../context/AuthContext';

const titleFromPath = (pathname) => {
  const match = [...traderNav, ...traderNavSecondary].find((i) => pathname.startsWith(i.to));
  return match?.label ?? 'Kotka Trading';
};

export default function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const isPremium = user?.role === 'premium' || user?.role === 'admin';

  return (
    <div className="flex h-screen overflow-hidden bg-ink-50 dark:bg-ink-950">
      <Sidebar
        brandTo="/app/dashboard"
        items={traderNav}
        secondaryItems={traderNavSecondary}
        isPremium={isPremium}
        footer={
          !isPremium ? (
            <div className="rounded-xl bg-ink-900 p-3 text-white dark:bg-ink-800">
              <p className="text-xs font-semibold">Go Premium</p>
              <p className="mt-0.5 text-[11px] text-ink-300">Unlock unlimited AI, replay engine and advanced analytics.</p>
            </div>
          ) : null
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={titleFromPath(location.pathname)} right={<MobileNav items={traderNav} secondaryItems={traderNavSecondary} />} />
        <main className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
