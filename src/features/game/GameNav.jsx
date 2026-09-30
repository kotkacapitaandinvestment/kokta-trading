// Kotka Trading's own sections, shown at the top of each of its pages.
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Swords, GraduationCap, History, Trophy, Wallet, UserRound } from 'lucide-react';

const ITEMS = [
  ['/app/game', 'Arena', Swords, true],
  ['/app/game/learn', 'Learn', GraduationCap],
  ['/app/game/history', 'My matches', History],
  ['/app/game/leaderboard', 'Leaderboard', Trophy],
  ['/app/game/wallet', 'Wallet', Wallet],
  ['/app/game/profile', 'Profile', UserRound],
];

export default function GameNav() {
  return (
    <nav aria-label="Kotka Trading" className="-mx-1 mb-5 flex gap-1 overflow-x-auto scrollbar-thin px-1 pb-1">
      {ITEMS.map(([to, label, Icon, end]) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            clsx(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
              isActive ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-ink-50',
            )
          }
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} /> {label}
        </NavLink>
      ))}
    </nav>
  );
}
