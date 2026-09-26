// compact: on phones, drop the description so tool pages (chat) get the room.
export default function PageHeader({ eyebrow, title, description, actions, compact = false }) {
  return (
    <div className={`${compact ? 'mb-3 sm:mb-6' : 'mb-5 sm:mb-6'} flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between`}>
      <div>
        {eyebrow ? (
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-400">
            {eyebrow}
          </span>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-50 sm:text-2xl">{title}</h1>
        {description ? <p className={`mt-1 max-w-2xl text-sm text-ink-500 dark:text-ink-400 ${compact ? 'hidden sm:block' : ''}`}>{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
