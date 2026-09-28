import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { PauseCircle, PlayCircle, Plus } from 'lucide-react';
import Card, { CardHeader, CardBody } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import { Select } from '../../../components/ui/Input';
import LoadError from '../components/LoadError';
import { api } from '../../../lib/api';
import { confirmDialog, promptDialog, toast } from '../../../lib/dialogs';
import { limitText, when } from './shared';

const FIELDS = [
  ['daily', 'Daily'],
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
];

const box = 'h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-sm tabular-nums outline-none focus:border-ink-400 disabled:opacity-60 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100';
const draftOf = (l) => ({ daily: l?.daily ?? '', weekly: l?.weekly ?? '', monthly: l?.monthly ?? '', warnAtPct: l?.warnAtPct ?? 80, enabled: l?.enabled ?? true });

function LimitRow({ meter, label, sub, limit, canEdit, onSaved, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(draftOf(limit));
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(draftOf(limit)), [limit]);

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...Object.fromEntries(FIELDS.map(([f]) => [f, draft[f] === '' ? null : Number(draft[f])])), warnAtPct: Number(draft.warnAtPct), enabled: draft.enabled };
      const r = await api.put(`/admin/usage/limits/${meter}`, body);
      onSaved(r.limit);
      setEditing(false);
      toast('Saved. The new limit applies within 15 seconds.');
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className={clsx('border-b border-ink-50 align-top last:border-0 dark:border-ink-800/60', sub && 'bg-ink-50/40 dark:bg-ink-900/40')}>
      <td className="px-5 py-3">
        <p className={clsx('text-sm text-ink-800 dark:text-ink-100', sub ? 'pl-4' : 'font-medium')}>{label}</p>
        {limit?.updatedAt ? <p className={clsx('mt-0.5 text-[11px] text-ink-400', sub && 'pl-4')}>Changed {when(limit.updatedAt)}{limit.updatedByName ? ` by ${limit.updatedByName}` : ''}</p> : null}
      </td>
      {FIELDS.map(([f]) => (
        <td key={f} className="px-3 py-3">
          {editing ? (
            <input type="number" min={0} max={1000000} inputMode="numeric" aria-label={`${label}: ${f} limit`} placeholder="No limit" className={box} value={draft[f]} onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))} />
          ) : (
            <span className={clsx('text-sm tabular-nums', limit?.[f] == null ? 'text-ink-400' : 'text-ink-700 dark:text-ink-200')}>{limitText(limit?.[f])}</span>
          )}
        </td>
      ))}
      <td className="px-3 py-3">
        {editing ? (
          <input type="number" min={1} max={100} aria-label={`${label}: warning point`} className={clsx(box, 'w-20')} value={draft.warnAtPct} onChange={(e) => setDraft((d) => ({ ...d, warnAtPct: e.target.value }))} />
        ) : (
          <span className="text-sm tabular-nums text-ink-600 dark:text-ink-300">{limit ? `${limit.warnAtPct}%` : '—'}</span>
        )}
      </td>
      <td className="px-3 py-3">
        {editing ? (
          <label className="flex items-center gap-2 pt-2 text-xs text-ink-600 dark:text-ink-300">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} /> On
          </label>
        ) : limit ? (
          <Badge tone={limit.enabled ? 'profit' : 'neutral'}>{limit.enabled ? 'On' : 'Off: counting only'}</Badge>
        ) : (
          <span className="text-xs text-ink-400">Not set</span>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        {canEdit ? (
          editing ? (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setDraft(draftOf(limit)); setEditing(false); }} disabled={busy}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              {onRemove ? <Button size="sm" variant="ghost" onClick={onRemove}>Remove</Button> : null}
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            </div>
          )
        ) : null}
      </td>
    </tr>
  );
}

function FeatureSwitch({ f, onChange }) {
  const [busy, setBusy] = useState(false);
  const flip = async () => {
    let note = null;
    if (!f.paused) {
      note = await promptDialog({
        title: `Pause ${f.label} for everyone?`,
        message: `Nobody can use ${f.label} until you resume it. They’ll see “${f.label} is temporarily unavailable”, not a limit message. Use this for outages, cost spikes or abuse.`,
        label: 'Reason (only admins see this)',
        placeholder: 'For example: provider outage',
        optional: true,
        maxLength: 200,
        confirmLabel: `Pause ${f.label}`,
        danger: true,
      });
      if (note === null) return;
    } else if (!(await confirmDialog({ title: `Resume ${f.label}?`, message: 'It becomes available again straight away, with the usual limits.', confirmLabel: 'Resume' }))) return;
    setBusy(true);
    try {
      const r = await api.put(`/admin/usage/features/${f.feature}`, { enabled: f.paused, note: note || undefined });
      onChange(r);
      toast(r.paused ? `${f.label} is paused.` : `${f.label} is available again.`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-ink-800 dark:text-ink-100">
          {f.label} <Badge tone={f.paused ? 'warning' : 'profit'}>{f.paused ? 'Paused' : 'Available'}</Badge>
        </p>
        {f.switchedAt && (f.paused || f.switchedByName) ? (
          <p className="mt-0.5 text-xs text-ink-400">
            {f.paused ? 'Paused' : 'Last switched'} {when(f.switchedAt)}{f.switchedByName ? ` by ${f.switchedByName}` : ''}{f.pauseNote && f.paused ? `: ${f.pauseNote}` : ''}
          </p>
        ) : null}
      </div>
      <Button size="sm" variant={f.paused ? 'primary' : 'secondary'} icon={f.paused ? PlayCircle : PauseCircle} onClick={flip} disabled={busy}>
        {f.paused ? 'Resume' : 'Pause'}
      </Button>
    </div>
  );
}

export default function UsageLimits() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState('');

  useEffect(() => {
    api.get('/admin/usage/config').then(setConfig).catch((err) => setError(err.message));
  }, []);

  if (error) return <LoadError message={error} />;
  if (!config) return <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;

  const byMeter = new Map(config.limits.map((l) => [l.meter, l]));
  const saved = (l) => setConfig((c) => ({ ...c, limits: [...c.limits.filter((x) => x.meter !== l.meter), l] }));
  const unlimitedActions = config.features.flatMap((f) => f.actions.filter((a) => !byMeter.has(a.meter)).map((a) => ({ ...a, featureLabel: f.label })));

  const remove = async (meter, label) => {
    if (!(await confirmDialog({ title: `Remove the limit for ${label}?`, message: 'The feature’s own limit still applies to it.', confirmLabel: 'Remove', danger: true }))) return;
    try {
      await api.delete(`/admin/usage/limits/${meter}`);
      setConfig((c) => ({ ...c, limits: c.limits.filter((x) => x.meter !== meter) }));
      toast('Removed.');
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  const addActionLimit = async () => {
    if (!adding) return;
    try {
      // Starts with no numbers set; the new row opens for editing below.
      const r = await api.put(`/admin/usage/limits/${adding}`, { daily: null, weekly: null, monthly: null, enabled: true });
      saved(r.limit);
      setAdding('');
      toast('Added. Set its numbers with Edit.');
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Emergency switches" subtitle="Pause a whole feature for everyone, for example during a provider outage or a cost spike. Reading saved research reports keeps working." />
        <CardBody className="divide-y divide-ink-100 py-1 dark:divide-ink-800">
          {config.features.map((f) => (
            <FeatureSwitch key={f.feature} f={f} onChange={(r) => setConfig((c) => ({ ...c, features: c.features.map((x) => (x.feature === r.feature ? { ...x, paused: r.paused, pauseNote: r.pauseNote, switchedAt: new Date().toISOString(), switchedByName: null } : x)) }))} />
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Limits for everyone"
          subtitle="Empty means no limit for that period. The most restrictive limit wins, and an action’s own limit applies on top of its feature’s. Periods reset in UTC."
          action={config.canEditLimits ? null : <Badge tone="neutral">Only a Super Admin can change these</Badge>}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs text-ink-400 dark:border-ink-800">
                <th className="px-5 py-3 font-medium">Feature or action</th>
                {FIELDS.map(([, l]) => (
                  <th key={l} className="px-3 py-3 font-medium">{l}</th>
                ))}
                <th className="px-3 py-3 font-medium">Warn at</th>
                <th className="px-3 py-3 font-medium">Limit</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {config.features.map((f) => [
                <LimitRow key={f.feature} meter={f.feature} label={f.label} limit={byMeter.get(f.feature)} canEdit={config.canEditLimits} onSaved={saved} />,
                ...f.actions
                  .filter((a) => byMeter.has(a.meter))
                  .map((a) => <LimitRow key={a.meter} sub meter={a.meter} label={a.label} limit={byMeter.get(a.meter)} canEdit={config.canEditLimits} onSaved={saved} onRemove={() => remove(a.meter, a.label)} />),
              ])}
            </tbody>
          </table>
        </div>
        {config.canEditLimits && unlimitedActions.length ? (
          <CardBody className="flex flex-wrap items-end gap-3 border-t border-ink-100 dark:border-ink-800">
            <div className="w-full max-w-xs">
              <Select label="Add a limit for one action" value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Choose an action…</option>
                {unlimitedActions.map((a) => (
                  <option key={a.meter} value={a.meter}>{a.featureLabel}: {a.label}</option>
                ))}
              </Select>
            </div>
            <Button variant="secondary" icon={Plus} onClick={addActionLimit} disabled={!adding}>Add</Button>
          </CardBody>
        ) : null}
      </Card>
    </div>
  );
}
