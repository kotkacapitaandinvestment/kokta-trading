import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { LayoutDashboard, NotebookPen, Globe2, MessagesSquare, Menu } from 'lucide-react';
import { useCommunity } from '../../features/community/CommunityContext';

const TABS = [
  { to: '/app/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/app/journal', label: 'Journal', icon: NotebookPen },
  { to: '/app/market', label: 'Markets', icon: Globe2 },
  { to: '/app/community', label: 'Community', icon: MessagesSquare, badge: 'messages' },
];

// Phone and tablet navigation: the four places traders go most, plus More
// for everything else. Hidden from lg up, where the sidebar takes over.
export default function BottomNav({ onMore, moreOpen }) {
  const { unread } = useCommunity();
  const { pathname } = useLocation();
  const inTabs = TABS.some((t) => pathname.startsWith(t.to));
  return (
    <nav aria-label="Primary" className="shrink-0 border-t border-ink-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-ink-800 dark:bg-ink-900/95 lg:hidden">
      <ul className="mx-auto grid h-14 max-w-lg grid-cols-5">
        {TABS.map((t) => {
          const count = t.badge ? unread?.[t.badge] ?? 0 : 0;
          return (
            <li key={t.to}>
              <NavLink
                to={t.to}
                className={({ isActive }) =>
                  clsx('relative flex h-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors', isActive ? 'text-ink-900 dark:text-white' : 'text-ink-400 dark:text-ink-500')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={clsx('absolute top-0 h-0.5 w-8 rounded-full', isActive ? 'bg-accent-500' : 'bg-transparent')} />
                    <span className="relative">
                      <t.icon className="h-5 w-5" strokeWidth={isActive ? 2 : 1.75} />
                      {count ? <span className="absolute -right-2 -top-1 min-w-[1rem] rounded-full bg-loss-500 px-1 text-center text-[9px] font-semibold leading-4 text-white">{count > 99 ? '99+' : count}</span> : null}
                    </span>
                    {t.label}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onMore}
            aria-expanded={moreOpen}
            className={clsx('relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium', !inTabs || moreOpen ? 'text-ink-900 dark:text-white' : 'text-ink-400 dark:text-ink-500')}
          >
            <span className={clsx('absolute top-0 h-0.5 w-8 rounded-full', !inTabs ? 'bg-accent-500' : 'bg-transparent')} />
            <Menu className="h-5 w-5" strokeWidth={1.75} />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
