import clsx from 'clsx';

export default function Skeleton({ className }) {
  return <div className={clsx('animate-pulse rounded-md bg-ink-100 dark:bg-ink-800', className)} />;
}
