import clsx from 'clsx';
import Card from './Card';

export default function StatTile({ label, value, delta, deltaTone = 'neutral', icon: Icon, hint, className }) {
  const toneClass = {
    neutral: 'text-ink-400',
    profit: 'text-profit-600 dark:text-profit-400',
    loss: 'text-loss-500',
  }[deltaTone];

  return (
    <Card className={clsx('p-5', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</span>
        {Icon ? <Icon className="h-4 w-4 text-ink-300" strokeWidth={1.75} /> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">{value}</span>
        {delta ? <span className={clsx('text-xs font-medium', toneClass)}>{delta}</span> : null}
      </div>
      {hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </Card>
  );
}
