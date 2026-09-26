import { useState } from 'react';
import clsx from 'clsx';
import { BellRing, Share, X } from 'lucide-react';
import { enablePush, local, usePushState } from '../lib/pwa';

// A quiet one-line offer to turn on push, shown where alerts matter
// (messages, notifications, events). Asked once per device: dismissing it,
// or answering the browser prompt, retires it everywhere.
const KEY = 'kotka:push-nudge';

export default function PushNudge({ children = 'Get alerts for messages and events even when Kotka is closed.', className }) {
  const push = usePushState();
  const [hidden, setHidden] = useState(() => local.get(KEY) === 'done');
  const [state, setState] = useState(null);
  if (hidden || !push.ready || (push.subscribed && state !== 'on')) return null;
  // 'granted' but not subscribed: e.g. signed back in on this browser.
  if (!['default', 'granted', 'needs-install'].includes(push.support)) return null;

  const done = () => {
    local.set(KEY, 'done');
    setHidden(true);
  };
  const turnOn = async () => {
    setState('busy');
    try {
      await enablePush();
      local.set(KEY, 'done');
      setState('on');
      setTimeout(() => setHidden(true), 2500);
    } catch (err) {
      setState(err.message);
      local.set(KEY, 'done');
    }
  };

  return (
    <div className={clsx('flex items-center gap-2.5 rounded-xl border border-ink-100 bg-white px-3 py-2 text-[13px] text-ink-600 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300', className)}>
      <BellRing className="h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400" />
      <p className="min-w-0 flex-1 leading-5">
        {state === 'on' ? (
          'Push is on for this device.'
        ) : state && state !== 'busy' ? (
          state
        ) : push.support === 'needs-install' ? (
          <>For alerts on iPhone, add Kotka to your Home Screen: tap <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-label="Share" /> then Add to Home Screen.</>
        ) : (
          children
        )}
      </p>
      {(push.support === 'default' || push.support === 'granted') && !state ? (
        <button type="button" onClick={turnOn} className="shrink-0 rounded-lg bg-ink-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-white dark:text-ink-900">
          Turn on
        </button>
      ) : null}
      {state === 'busy' ? <span className="shrink-0 text-xs text-ink-400">Waiting for your browser…</span> : null}
      {state !== 'busy' && state !== 'on' ? (
        <button type="button" onClick={done} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-300 hover:text-ink-600 dark:text-ink-600 dark:hover:text-ink-300" aria-label="Not now">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
