import { NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

export default function MobileNav({ items, secondaryItems }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-ink-100 bg-white p-4 shadow-pop dark:border-ink-700 dark:bg-ink-900 dark:shadow-none">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500 text-sm font-bold text-ink-950 dark:bg-accent-400">
                  K
                </div>
                <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">Kotka Trading</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-ink-400 hover:text-ink-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium',
                        isActive
                          ? 'border-accent-500 bg-ink-100 text-ink-900 dark:bg-ink-800 dark:text-white'
                          : 'border-transparent text-ink-600 dark:text-ink-300',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" strokeWidth={1.75} />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            {secondaryItems ? (
              <>
                <div className="my-3 h-px bg-ink-100 dark:bg-ink-800" />
                <ul className="space-y-0.5">
                  {secondaryItems.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          clsx(
                            'flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium',
                            isActive
                              ? 'border-accent-500 bg-ink-100 text-ink-900 dark:bg-ink-800 dark:text-white'
                              : 'border-transparent text-ink-600 dark:text-ink-300',
                          )
                        }
                      >
                        <item.icon className="h-4 w-4" strokeWidth={1.75} />
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
