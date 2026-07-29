export default function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-400">
            {eyebrow}
          </span>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-500 dark:text-ink-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
