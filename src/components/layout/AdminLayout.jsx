import { Outlet, useLocation, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileNav from './MobileNav';
import { adminNav, traderNav } from './navConfig';
import { useAuth } from '../../context/AuthContext';
import Badge from '../ui/Badge';

const titleFromPath = (pathname) => adminNav.find((i) => pathname.startsWith(i.to))?.label ?? 'Admin';

export default function AdminLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!['admin', 'super_admin'].includes(user.role)) return <Navigate to="/app/dashboard" replace />;

  const isSuperAdmin = user.role === 'super_admin';
  const items = adminNav.map((item) => ({
    ...item,
    locked: item.superAdminOnly && !isSuperAdmin,
    badge: item.superAdminOnly ? 'Super Admin' : undefined,
  }));
  const traderTools = traderNav.map((item) => ({ ...item, locked: false, badge: undefined }));

  return (
    <div className="flex h-screen overflow-hidden bg-ink-50 dark:bg-ink-950">
      <Sidebar
        brandTo="/admin/overview"
        items={items}
        secondaryItems={traderTools}
        secondaryLabel="Trader Tools"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={titleFromPath(location.pathname)}
          right={
            <>
              <Badge tone="accent" className="hidden sm:inline-flex">{isSuperAdmin ? 'Super Admin' : 'Administrator'}</Badge>
              <MobileNav items={items} secondaryItems={traderTools} />
            </>
          }
        />
        <main className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
