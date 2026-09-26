import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { BadgeCheck } from 'lucide-react';

export function Avatar({ user, size = 36, showOnline = false, className }) {
  const s = { width: size, height: size };
  return (
    <span className={clsx('relative inline-flex shrink-0', className)} style={s}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" style={s} loading="lazy" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-ink-800 font-semibold text-accent-300 dark:bg-ink-700" style={{ ...s, fontSize: Math.max(10, size * 0.36) }}>
          {user?.initials ?? '?'}
        </span>
      )}
      {showOnline && user?.online ? <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-profit-500 ring-2 ring-white dark:ring-ink-900" title="Online" /> : null}
    </span>
  );
}

// Staff accounts carry an explicit badge; nobody else can look official.
export function StaffBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-accent-500/15 px-1 py-px text-[10px] font-semibold text-accent-700 dark:text-accent-300" title="Official Kotka staff account">
      <BadgeCheck className="h-3 w-3" /> Kotka team
    </span>
  );
}

export function UserName({ user, className, showHandle = true, link = true }) {
  if (!user || user.deleted) return <span className={clsx('text-ink-400', className)}>Deleted account</span>;
  const name = <span className="font-semibold text-ink-900 dark:text-ink-50">{user.name}</span>;
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-1.5', className)}>
      {link && user.username ? <Link to={`/app/community/u/${user.username}`} className="truncate hover:underline">{name}</Link> : <span className="truncate">{name}</span>}
      {user.staff ? <StaffBadge /> : null}
      {showHandle && user.username ? <span className="truncate text-xs text-ink-400">@{user.username}</span> : null}
    </span>
  );
}
