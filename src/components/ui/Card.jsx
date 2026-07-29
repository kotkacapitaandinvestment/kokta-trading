import clsx from 'clsx';

export default function Card({ className, hover = false, children, ...props }) {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-ink-100 bg-white shadow-card dark:border-ink-800 dark:bg-ink-900',
        hover && 'transition-shadow duration-200 hover:shadow-card-hover',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }) {
  return (
    <div className={clsx('flex items-start justify-between gap-4 px-5 pt-5', className)}>
      <div>
        <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }) {
  return <div className={clsx('px-5 pb-5 pt-3', className)}>{children}</div>;
}
