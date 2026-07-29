export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 px-6 py-14 text-center dark:border-ink-700">
      {Icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink-50 dark:bg-ink-800">
          <Icon className="h-5 w-5 text-ink-400" strokeWidth={1.75} />
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-400">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
