import clsx from 'clsx';
import { Star, Search, Plus } from 'lucide-react';

export default function ConversationList({ conversations, activeId, onSelect, onNew, search, onSearch }) {
  const filtered = conversations.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 p-3">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-800 dark:bg-white dark:text-ink-900"
        >
          <Plus className="h-4 w-4" /> New analysis
        </button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search conversations"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
          />
        </div>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto scrollbar-thin px-3 pb-3">
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={clsx(
              'w-full rounded-lg px-3 py-2.5 text-left transition-colors',
              activeId === c.id ? 'bg-ink-100 dark:bg-ink-800' : 'hover:bg-ink-50 dark:hover:bg-ink-800/60',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium text-ink-800 dark:text-ink-100">{c.title}</p>
              {c.favorite ? <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" /> : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-ink-400">{c.market} · {new Date(c.updatedAt).toLocaleDateString()}</p>
          </button>
        ))}
        {filtered.length === 0 ? <p className="px-3 py-6 text-center text-xs text-ink-400">No conversations found.</p> : null}
      </div>
    </div>
  );
}
