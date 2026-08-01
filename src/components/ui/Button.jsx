import clsx from 'clsx';

const variants = {
  primary:
    'bg-ink-900 text-white hover:bg-ink-800 dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100',
  secondary:
    'bg-white text-ink-900 border border-ink-200 hover:bg-ink-50 dark:bg-ink-800 dark:text-ink-100 dark:border-ink-700 dark:hover:bg-ink-700',
  accent: 'bg-accent-500 text-ink-950 hover:bg-accent-600',
  ghost: 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
  danger: 'bg-loss-500 text-white hover:bg-loss-600',
};

const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  as: Comp = 'button',
  icon: Icon,
  iconRight: IconRight,
  children,
  ...props
}) {
  return (
    <Comp
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {Icon ? <Icon className="h-4 w-4" strokeWidth={2} /> : null}
      {children}
      {IconRight ? <IconRight className="h-4 w-4" strokeWidth={2} /> : null}
    </Comp>
  );
}
