import { useMemo, useState } from 'react';
import { Search, Download } from 'lucide-react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import EmptyState from '../../../components/ui/EmptyState';

function csvCell(value) {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Exports what's on screen (after search). Columns without plain data, like
// action buttons, are skipped unless they provide csv(row).
function downloadCsv(columns, rows, filename) {
  const cols = columns.filter((c) => c.key !== 'actions' && c.csv !== false);
  const lines = [cols.map((c) => csvCell(c.label)).join(',')];
  for (const row of rows) lines.push(cols.map((c) => csvCell(typeof c.csv === 'function' ? c.csv(row) : row[c.key])).join(','));
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${filename}-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminTable({ columns, rows, searchKeys, exportable = true, exportName = 'kotka-export', emptyLabel = 'Nothing here yet' }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    // Match what people see (column labels such as "Super Admin"), not only raw values.
    const labelled = columns.filter((c) => typeof c.csv === 'function');
    return rows.filter((r) => (searchKeys ?? Object.keys(r)).some((k) => String(r[k] ?? '').toLowerCase().includes(q)) || labelled.some((c) => String(c.csv(r) ?? '').toLowerCase().includes(q)));
  }, [rows, query, searchKeys, columns]);

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
          <Button variant="secondary" size="sm" icon={Download} disabled={!filtered.length} onClick={() => downloadCsv(columns, filtered, exportName)}>
            Download spreadsheet
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="p-6">
          <EmptyState size="inline" title={rows.length && query ? `Nothing matches “${query}”` : emptyLabel} description={rows.length && query ? 'Try a different name, email or word.' : undefined} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs text-ink-400 dark:border-ink-800">
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
