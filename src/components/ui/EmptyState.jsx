import clsx from 'clsx';

// "Nothing here yet" moments. Always say what belongs here and how to get
// it: a title, one line of explanation, and the next step as a button.
// size: 'page' (own card, dashed border), 'section' (inside a card), 'inline' (side panels, small lists).
export default function EmptyState({ icon: Icon, title, description, action, secondary, size = 'page', className }) {
  const inline = size === 'inline';
  return (
    <div
      className={clsx(
        'flex flex-col items-center text-center',
        size === 'page' && 'rounded-2xl border border-dashed border-ink-200 bg-white/50 px-6 py-14 dark:border-ink-700 dark:bg-ink-900/40',
        size === 'section' && 'px-6 py-12',
        inline && 'px-3 py-6',
        className,
      )}
    >
      {Icon ? (
        <div className={clsx('relative flex items-center justify-center rounded-2xl', inline ? 'mb-2.5 h-9 w-9' : 'mb-4 h-14 w-14')}>
          <span className="absolute inset-0 rounded-2xl bg-accent-500/10 ring-1 ring-inset ring-accent-500/25" />
          <span className="absolute -inset-2 -z-0 rounded-3xl bg-accent-500/5 blur-md" aria-hidden="true" />
          <Icon className={clsx('relative text-accent-700 dark:text-accent-300', inline ? 'h-4 w-4' : 'h-6 w-6')} strokeWidth={1.75} />
        </div>
      ) : null}
      <h3 className={clsx('font-semibold text-ink-900 dark:text-ink-50', inline ? 'text-sm' : 'text-base')}>{title}</h3>
      {description ? <p className={clsx('mt-1 max-w-sm leading-relaxed text-ink-500 dark:text-ink-400', inline ? 'text-xs' : 'text-sm')}>{description}</p> : null}
      {action || secondary ? (
        <div className={clsx('flex flex-wrap items-center justify-center gap-2', inline ? 'mt-3' : 'mt-5')}>
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}
