import { useMemo, useState } from 'react';
import { Search, Download } from 'lucide-react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import EmptyState from '../../../components/ui/EmptyState';

export default function AdminTable({ columns, rows, searchKeys, exportable = true, emptyLabel = 'No records found' }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) => (searchKeys ?? Object.keys(r)).some((k) => String(r[k] ?? '').toLowerCase().includes(q)));
  }, [rows, query, searchKeys]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-4 dark:border-ink-800">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
          />
        </div>
        {exportable ? (
          <Button variant="secondary" size="sm" icon={Download}>
            Export CSV
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="p-6">
          <EmptyState title={emptyLabel} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800">
                {columns.map((c) => (
                  <th key={c.key} className="px-5 py-3 font-medium">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={row.id ?? i} className="border-b border-ink-50 last:border-0 hover:bg-ink-50 dark:border-ink-800/60 dark:hover:bg-ink-800/40">
                  {columns.map((c) => (
                    <td key={c.key} className="px-5 py-3 text-ink-600 dark:text-ink-300">
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
