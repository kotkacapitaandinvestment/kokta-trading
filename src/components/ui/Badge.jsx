import clsx from 'clsx';

const tones = {
  neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  accent: 'bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300',
  profit: 'bg-profit-50 text-profit-600 dark:bg-profit-500/10 dark:text-profit-400',
  loss: 'bg-loss-50 text-loss-600 dark:bg-loss-500/10 dark:text-loss-400',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
};

export default function Badge({ tone = 'neutral', className, children }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
