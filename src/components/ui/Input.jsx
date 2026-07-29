import clsx from 'clsx';
import { forwardRef } from 'react';

export const Input = forwardRef(function Input({ label, hint, error, className, id, ...props }, ref) {
  const inputId = id || props.name;
  return (
    <label className="block" htmlFor={inputId}>
      {label ? (
        <span className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-ink-200">{label}</span>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={clsx(
          'h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 outline-none transition-colors focus:border-ink-400 focus:ring-2 focus:ring-ink-100 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50 dark:focus:ring-ink-700',
          error && 'border-loss-400 focus:border-loss-400 focus:ring-loss-50',
          className,
        )}
        {...props}
      />
      {hint && !error ? <span className="mt-1 block text-xs text-ink-400">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-loss-500">{error}</span> : null}
    </label>
  );
});

export const Select = forwardRef(function Select({ label, className, id, children, ...props }, ref) {
  const selectId = id || props.name;
  return (
    <label className="block" htmlFor={selectId}>
      {label ? (
        <span className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-ink-200">{label}</span>
      ) : null}
      <select
        ref={ref}
        id={selectId}
        className={clsx(
          'h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none transition-colors focus:border-ink-400 focus:ring-2 focus:ring-ink-100 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  );
});

export default Input;
