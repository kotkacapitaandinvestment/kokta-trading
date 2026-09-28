import clsx from 'clsx';
import { TrendingDown, TrendingUp } from 'lucide-react';

const STATUS = {
  open: 'bg-profit-50 text-profit-700 dark:bg-profit-500/10 dark:text-profit-400',
  updated: 'bg-accent-50 text-accent-800 dark:bg-accent-900/30 dark:text-accent-300',
  closed: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  invalidated: 'bg-loss-50 text-loss-600 dark:bg-loss-500/10 dark:text-loss-400',
};

export const IDEA_STATUS_LABEL = { open: 'Open', updated: 'Updated', closed: 'Closed', invalidated: 'No longer valid' };
export const TIMEFRAME_LABEL = { '1m': '1-minute', '5m': '5-minute', '15m': '15-minute', '30m': '30-minute', '1H': '1-hour', '4H': '4-hour', Daily: 'Daily', Weekly: 'Weekly', Monthly: 'Monthly' };

export function IdeaStatus({ status }) {
  return <span className={clsx('rounded-md px-1.5 py-0.5 text-[11px] font-semibold', STATUS[status])}>{IDEA_STATUS_LABEL[status] ?? status}</span>;
}

// Structured trade-idea card. Direction is shown with an icon and a word,
// never colour alone.
export default function IdeaBlock({ idea, compact = false }) {
  if (!idea) return null;
  const bull = idea.direction === 'bullish';
  const Icon = bull ? TrendingUp : TrendingDown;
  const cells = [
    ['Entry', idea.entry],
    ['Stop loss', idea.stop],
    ['Take profit', idea.target],
    ['Reward-to-risk', idea.riskReward ? `${idea.riskReward}:1` : '–'],
  ];
  return (
    <div className={clsx('mt-2 rounded-xl border border-ink-100 dark:border-ink-800', compact ? 'p-2.5' : 'p-3.5')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold text-ink-900 dark:text-ink-50">{idea.display}</span>
        <span className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold', bull ? 'bg-profit-50 text-profit-700 dark:bg-profit-500/10 dark:text-profit-400' : 'bg-loss-50 text-loss-600 dark:bg-loss-500/10 dark:text-loss-400')}>
          <Icon className="h-3.5 w-3.5" /> {bull ? 'Bullish' : 'Bearish'}
        </span>
        <span className="text-xs text-ink-500 dark:text-ink-400">{TIMEFRAME_LABEL[idea.timeframe] ?? idea.timeframe} chart</span>
        <span className="ml-auto"><IdeaStatus status={idea.status} /></span>
      </div>
      <dl className="mt-2.5 grid grid-cols-4 gap-2">
        {cells.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] text-ink-400">{k}</dt>
            <dd className="font-mono text-sm tabular-nums text-ink-900 dark:text-ink-50">{v}</dd>
          </div>
        ))}
      </dl>
      {!compact && idea.statusNote ? <p className="mt-2.5 border-t border-ink-100 pt-2 text-xs text-ink-600 dark:border-ink-800 dark:text-ink-300"><span className="font-medium">{IDEA_STATUS_LABEL[idea.status] ?? idea.status}:</span> {idea.statusNote}</p> : null}
    </div>
  );
}
