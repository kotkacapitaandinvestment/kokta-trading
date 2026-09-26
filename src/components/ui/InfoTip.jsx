import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Info } from 'lucide-react';

// A small (i) that explains a term in a sentence or two. Opens on tap/click
// (hover too, on devices that have it) and keeps itself inside the screen.
export default function InfoTip({ label, children, className, tone = 'default' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const pop = useRef(null);
  const hoverTimer = useRef(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !btn.current || !pop.current) return;
    const b = btn.current.getBoundingClientRect();
    const width = pop.current.offsetWidth;
    const height = pop.current.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const left = Math.min(Math.max(8, b.left + b.width / 2 - width / 2), vw - width - 8);
    const below = b.bottom + 8 + height < window.innerHeight;
    setPos({ left, top: below ? b.bottom + 6 : b.top - height - 6 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !btn.current?.contains(e.target) && !pop.current?.contains(e.target)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;
  const hover = (next) => {
    if (!canHover) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(next), next ? 250 : 150);
  };

  return (
    <span className={clsx('inline-flex align-middle', className)} onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
      <button
        ref={btn}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label={label ? `About ${label}` : 'More information'}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        className={clsx(
          'inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors',
          tone === 'onDark' ? 'text-ink-500 hover:text-ink-200' : 'text-ink-300 hover:text-ink-600 dark:text-ink-600 dark:hover:text-ink-300',
        )}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      {open ? (
        <span
          ref={pop}
          id={id}
          role="tooltip"
          style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
          className="fixed z-50 w-64 max-w-[calc(100vw-16px)] rounded-lg border border-ink-100 bg-white px-3 py-2 text-left text-xs font-normal normal-case leading-5 tracking-normal text-ink-600 shadow-pop dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200 dark:shadow-none"
        >
          {label ? <span className="mb-0.5 block font-semibold text-ink-800 dark:text-ink-50">{label}</span> : null}
          {children}
        </span>
      ) : null}
    </span>
  );
}
