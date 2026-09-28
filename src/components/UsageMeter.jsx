import clsx from 'clsx';
import { periodWord, whenItResets } from '../lib/usage';

// "7 / 10 used today", only when a limit applies. The title lists every
// period with a limit and when each resets.
export default function UsageMeter({ usage, className }) {
  const h = usage?.headline;
  if (!usage || usage.exempt || usage.paused || !h) return null;
  const detail = ['day', 'week', 'month']
    .filter((p) => usage.periods[p].limit !== null)
    .map((p) => `${usage.periods[p].used} of ${usage.periods[p].limit} used ${periodWord(p)}, resets ${whenItResets(usage.periods[p].resetAt)}`)
    .join('\n');
  return (
    <span
      title={detail}
      className={clsx(
        'whitespace-nowrap text-xs tabular-nums',
        h.remaining === 0 ? 'text-loss-500' : usage.status === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-ink-400',
        className,
      )}
    >
      {h.used} / {h.limit} used {periodWord(h.period)}
    </span>
  );
}
