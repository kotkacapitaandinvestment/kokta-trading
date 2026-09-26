import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ScrollText, Search } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { api } from '../../lib/api';

// Plain-language names for audit actions; unknown ones show their raw key.
const ACTION_LABEL = {
  'user.updated': 'Changed a user',
  'kyc.submitted': 'Submitted verification',
  'kyc.resubmitted': 'Resubmitted verification',
  'kyc.viewed': 'Opened verification details',
  'kyc.approved': 'Approved verification',
  'kyc.rejected': 'Requested verification changes',
  'platform.settings_updated': 'Changed platform settings',
  'integration.created': 'Added an integration',
  'integration.updated': 'Updated an integration',
  'research.settings_updated': 'Changed research settings',
  'research.cron_token_rotated': 'Rotated the research cron token',
  'research.assessment_created': 'Added a source assessment',
  'research.assessment_updated': 'Edited a source assessment',
  'research.assessment_deleted': 'Deleted a source assessment',
  'account.password_changed': 'Changed own password',
  'account.deleted': 'Deleted own account',
};

function describe(log) {
  const d = log.detail ?? {};
  switch (log.action) {
    case 'user.updated':
      return [d.email, ...['role', 'status', 'plan'].filter((k) => d[k]).map((k) => `${k} ${d[k].from} → ${d[k].to}`)].filter(Boolean).join(' · ');
    case 'platform.settings_updated':
      return Object.entries(d).map(([k, v]) => `${k}: ${String(v.from)} → ${String(v.to)}`).join(' · ');
    case 'kyc.viewed':
    case 'kyc.approved':
    case 'kyc.rejected':
      return [d.userEmail, d.note ? `“${d.note}”` : null].filter(Boolean).join(' · ');
    case 'kyc.submitted':
    case 'kyc.resubmitted':
      return d.country ? `Country ${d.country}` : '';
    case 'integration.created':
    case 'integration.updated':
      return [log.targetId, d.secretChanged ? 'key changed' : null, typeof d.enabled === 'boolean' ? (d.enabled ? 'enabled' : 'disabled') : null].filter(Boolean).join(' · ');
    case 'research.cron_token_rotated':
      return d.managed ? `cron-job.org job #${log.targetId} updated` : 'manual setup';
    case 'research.assessment_created':
    case 'research.assessment_updated':
    case 'research.assessment_deleted':
      return [d.currency, d.factor].filter(Boolean).join(' · ');
    case 'account.deleted':
      return d.email ?? '';
    default:
      return '';
  }
}

const GROUPS = [
  { value: '', label: 'All actions' },
  { value: 'user.', label: 'Users' },
  { value: 'kyc.', label: 'Verifications' },
  { value: 'platform.', label: 'Platform settings' },
  { value: 'integration.', label: 'Integrations' },
  { value: 'research.', label: 'Research' },
  { value: 'account.', label: 'Accounts' },
];

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [group, setGroup] = useState('');
  const [query, setQuery] = useState('');

  const fetchPage = useCallback(
    (after) => {
      const params = new URLSearchParams({ limit: '50' });
      if (group) params.set('action', group);
      if (query.trim()) params.set('q', query.trim());
      if (after) params.set('cursor', after);
      setLoading(true);
      return api
        .get(`/admin/platform/audit-logs?${params}`)
        .then((res) => {
          setLogs((prev) => (after ? [...prev, ...res.logs] : res.logs));
          setCursor(res.nextCursor);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    },
    [group, query],
  );

  useEffect(() => {
    const t = setTimeout(() => fetchPage(null), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchPage, query]);

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Audit Log"
        description="Administrative and security actions, newest first. Entries cannot be edited or deleted from the app."
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 p-4 dark:border-ink-800">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by who did it (email)"
              className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
            />
          </div>
          <select
            aria-label="Action type"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="h-9 rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-800 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
          >
            {GROUPS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>

        {error ? <p role="alert" className="p-4 text-sm text-loss-500">{error}</p> : null}

        {!loading && logs.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={ScrollText} title="No entries yet" description="Actions such as role changes, verification reviews and settings changes are recorded here from now on." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800">
                  <th className="px-5 py-3 font-medium">When (local time)</th>
                  <th className="px-5 py-3 font-medium">Who</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Details</th>
                  <th className="px-5 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-ink-50 align-top last:border-0 dark:border-ink-800/60">
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs tabular-nums text-ink-500 dark:text-ink-400">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-5 py-3 text-ink-700 dark:text-ink-200">{log.actorEmail ?? <span className="text-ink-400">System</span>}</td>
                    <td className="px-5 py-3 font-medium text-ink-800 dark:text-ink-100">{ACTION_LABEL[log.action] ?? log.action}</td>
                    <td className="max-w-md px-5 py-3 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{describe(log)}</td>
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-ink-400">{log.ip ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cursor ? (
          <div className="border-t border-ink-100 p-3 text-center dark:border-ink-800">
            <Button variant="ghost" size="sm" iconRight={ChevronDown} disabled={loading} onClick={() => fetchPage(cursor)}>
              {loading ? 'Loading…' : 'Load older entries'}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
