import BrandMark from '../ui/BrandMark';
import { NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

// The full navigation as a drawer. Uncontrolled it brings its own menu
// button; the trader app opens it from the bottom bar's More tab instead.
export default function MobileNav({ items, secondaryItems, open: openProp, onOpenChange }) {
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const setOpen = controlled ? onOpenChange : setOpenState;

  return (
    <div className="lg:hidden">
      {!controlled ? (
        <button
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto border-r border-ink-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))] shadow-pop dark:border-ink-700 dark:bg-ink-900 dark:shadow-none" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrandMark size={32} />
                <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">Kotka Trading</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-ink-400 hover:text-ink-700" aria-label="Close menu">
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
