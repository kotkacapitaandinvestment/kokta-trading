import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import EmptyState from '../../../components/ui/EmptyState';
import { Select } from '../../../components/ui/Input';
import LoadError from '../components/LoadError';
import { api } from '../../../lib/api';
import { modelName } from '../../../lib/aiModelNames';
import { STATUS, StatusBadge, n, when } from './shared';

const seconds = (ms) => (ms === null || ms === undefined ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

// One row per metered operation, newest first.
export function RecordsTable({ records, showPerson = true }) {
  if (!records.length) return <EmptyState size="inline" title="Nothing recorded" description="Usage shows up here as it happens." />;
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-xs text-ink-400 dark:border-ink-800">
              {['When', ...(showPerson ? ['Person'] : []), 'Feature', 'Action', 'Units', 'Status', 'Provider and model', 'Tokens (in / out)', 'Time taken'].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className="border-b border-ink-50 last:border-0 dark:border-ink-800/60">
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-500 dark:text-ink-400">{when(r.createdAt)}</td>
                {showPerson ? (
                  <td className="max-w-[14rem] truncate px-4 py-2.5 text-ink-700 dark:text-ink-200" title={r.userEmail}>
                    {r.userName ?? 'Deleted account'}
                  </td>
                ) : null}
                <td className="px-4 py-2.5 text-ink-600 dark:text-ink-300">{r.featureLabel}</td>
                <td className="px-4 py-2.5 text-ink-600 dark:text-ink-300" title={r.metadata?.subject ?? undefined}>
                  {r.actionLabel}
                  {r.metadata?.subject ? <span className="text-xs text-ink-400"> · {r.metadata.subject}</span> : null}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-ink-600 dark:text-ink-300">{n(r.units)}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={r.status} />
                  {r.metadata?.exempt ? <span className="ml-1 text-[11px] text-ink-400">staff</span> : null}
                </td>
                <td className="px-4 py-2.5 text-xs text-ink-500 dark:text-ink-400" title={r.model ?? undefined}>
                  {[r.provider, r.model ? modelName(r.model) : null].filter(Boolean).join(' · ') || (r.metadata?.cacheHits ? 'From cache' : '')}
                </td>
                <td className="px-4 py-2.5 text-xs tabular-nums text-ink-500 dark:text-ink-400">{r.totalTokens !== null ? `${n(r.inputTokens)} / ${n(r.outputTokens)}` : ''}</td>
                <td className="px-4 py-2.5 text-xs tabular-nums text-ink-500 dark:text-ink-400">{seconds(r.latencyMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function UsageLogs({ userId, onClearUser }) {
  const [features, setFeatures] = useState([]);
  const [filters, setFilters] = useState({ feature: '', action: '', status: '' });
  const [page, setPage] = useState({ records: null, nextCursor: null });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/usage/config').then((c) => setFeatures(c.features)).catch(() => {});
  }, []);

  const query = useCallback(
    (cursor) => {
      const qs = new URLSearchParams(Object.entries({ ...filters, userId: userId ?? '', cursor: cursor ?? '' }).filter(([, v]) => v));
      return api.get(`/admin/usage/records?${qs}`);
    },
    [filters, userId],
  );

  useEffect(() => {
    setPage({ records: null, nextCursor: null });
    query().then(setPage).catch((err) => setError(err.message));
  }, [query]);

  const more = async () => {
    setBusy(true);
    try {
      const next = await query(page.nextCursor);
      setPage((p) => ({ records: [...p.records, ...next.records], nextCursor: next.nextCursor }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value, ...(k === 'feature' ? { action: '' } : {}) }));
  const actions = features.find((f) => f.feature === filters.feature)?.actions ?? [];

  if (error) return <LoadError message={error} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Select label="Feature" value={filters.feature} onChange={set('feature')}>
            <option value="">All features</option>
            {features.map((f) => (
              <option key={f.feature} value={f.feature}>{f.label}</option>
            ))}
          </Select>
        </div>
        <div className="w-56">
          <Select label="Action" value={filters.action} onChange={set('action')} disabled={!filters.feature}>
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a.action} value={a.action}>{a.label}</option>
            ))}
          </Select>
        </div>
        <div className="w-56">
          <Select label="Status" value={filters.status} onChange={set('status')}>
            <option value="">Any status</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
        </div>
        {userId ? (
          <Button variant="secondary" size="md" icon={X} onClick={onClearUser}>
            {page.records?.[0]?.userName ? `Only ${page.records[0].userName}` : 'One person only'}
          </Button>
        ) : null}
      </div>
      {page.records ? <RecordsTable records={page.records} /> : <div className="h-72 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />}
      {page.nextCursor ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={more} disabled={busy}>{busy ? 'Loading…' : 'Show older'}</Button>
        </div>
      ) : null}
    </div>
  );
}
