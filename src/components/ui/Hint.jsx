import { useState } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { local } from '../../lib/pwa';

// A one-line pointer that stays out of the way: a thin accent rule, muted
// text, gone for good once dismissed on this device.
export default function Hint({ id, children, action, className }) {
  const key = `kotka:hint:${id}`;
  const [hidden, setHidden] = useState(() => local.get(key) === '1');
  if (hidden) return null;
  const dismiss = () => {
    local.set(key, '1');
    setHidden(true);
  };
  return (
    <div className={clsx('flex items-start gap-2 border-l-2 border-accent-500/70 py-0.5 pl-3 text-[13px] leading-5 text-ink-500 dark:text-ink-400', className)}>
      <p className="min-w-0 flex-1">
        {children}
        {action ? <> {action}</> : null}
      </p>
      <button type="button" onClick={dismiss} className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-300 hover:text-ink-600 dark:text-ink-600 dark:hover:text-ink-300" aria-label="Dismiss tip">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
