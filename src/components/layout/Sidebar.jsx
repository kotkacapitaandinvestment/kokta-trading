import BrandMark from '../ui/BrandMark';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Lock, ShieldCheck } from 'lucide-react';

export default function Sidebar({ brandTo, items, secondaryItems, secondaryLabel, footer }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-100 bg-white lg:flex dark:border-ink-800 dark:bg-ink-900">
      <div className="flex h-16 items-center gap-2.5 border-b border-ink-100 px-6 dark:border-ink-800">
        <NavLink to={brandTo} className="flex items-center gap-2.5">
          <BrandMark size={32} />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink-900 dark:text-ink-50">Kotka Trading</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-400">Discipline is Freedom</div>
          </div>
        </NavLink>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const locked = !!item.locked;
            return (
              <li key={item.to}>
                <NavLink
                  to={locked ? '#' : item.to}
                  onClick={(e) => locked && e.preventDefault()}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors',
                      locked
                        ? 'border-transparent cursor-not-allowed text-ink-300 dark:text-ink-600'
                        : isActive
                          ? 'border-accent-500 bg-ink-100 text-ink-900 dark:bg-ink-800 dark:text-white'
                          : 'border-transparent text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800',
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {locked ? <span title="Only a Super Admin can open this"><Lock className="h-3.5 w-3.5 text-ink-300" aria-label="Only a Super Admin can open this" /></span> : null}
                  {/* An icon, not a text badge, so long labels aren't cut off. */}
                  {item.badge && !locked ? <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent-600 dark:text-accent-400" aria-label={`${item.badge} only`} title={`${item.badge} only`} /> : null}
                </NavLink>
              </li>
            );
          })}
        </ul>

        {secondaryItems ? (
          <>
            <div className="my-3 h-px bg-ink-100 dark:bg-ink-800" />
            {secondaryLabel ? (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-ink-300 dark:text-ink-600">
                {secondaryLabel}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {secondaryItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'border-accent-500 bg-ink-100 text-ink-900 dark:bg-ink-800 dark:text-white'
                          : 'border-transparent text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    <span className="flex-1 truncate">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </nav>

      {footer ? <div className="border-t border-ink-100 p-3 dark:border-ink-800">{footer}</div> : null}
    </aside>
  );
}
