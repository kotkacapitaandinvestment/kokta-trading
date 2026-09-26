import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { MoreHorizontal } from 'lucide-react';

// Small accessible dropdown for per-item actions.
export default function Menu({ items, label = 'More actions', icon: Icon = MoreHorizontal, align = 'right', className, buttonClassName }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const visible = items.filter(Boolean);
  if (!visible.length) return null;
  return (
    <div ref={ref} className={clsx('relative', className)}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} className={clsx('flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-100', buttonClassName)}>
        <Icon className="h-4 w-4" />
      </button>
      {open ? (
        <div role="menu" className={clsx('absolute z-30 mt-1 min-w-[12rem] rounded-xl border border-ink-100 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-800', align === 'right' ? 'right-0' : 'left-0')}>
          {visible.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={clsx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm disabled:opacity-40', it.danger ? 'text-loss-600 hover:bg-loss-50 dark:text-loss-400 dark:hover:bg-loss-500/10' : 'text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-700')}
            >
              {it.icon ? <it.icon className="h-4 w-4 shrink-0" /> : null}
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
