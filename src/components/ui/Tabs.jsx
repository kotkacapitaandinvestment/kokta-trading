import clsx from 'clsx';

export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-ink-50 p-1 dark:bg-ink-800">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={clsx(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            active === tab.value
              ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-ink-50 dark:shadow-none'
              : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
