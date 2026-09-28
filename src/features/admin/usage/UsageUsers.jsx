import { useEffect, useState } from 'react';
import { Search, RotateCcw, UserRound, ListOrdered } from 'lucide-react';
import Card, { CardHeader, CardBody } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import EmptyState from '../../../components/ui/EmptyState';
import Input, { Select } from '../../../components/ui/Input';
import LoadError from '../components/LoadError';
import { api } from '../../../lib/api';
import { confirmDialog, promptDialog, toast } from '../../../lib/dialogs';
import { whenItResets } from '../../../lib/usage';
import { RecordsTable } from './UsageLogs';
import { n, limitText, dateOnly, when } from './shared';

const PERIODS = [
  ['day', 'Today'],
  ['week', 'This week'],
  ['month', 'This month'],
];
const SOURCE = { default: 'Everyone’s limits', override: 'Their own limits', exempt: 'Staff: not limited', off: 'Limit switched off', none: 'No limit set' };

function FeatureUsage({ f, onReset }) {
  return (
    <Card>
      <CardHeader
        title={f.label}
        subtitle={SOURCE[f.source] ?? f.source}
        action={f.paused ? <Badge tone="warning">Paused for everyone</Badge> : f.status === 'reached' ? <Badge tone="loss">At a limit</Badge> : f.status === 'warning' ? <Badge tone="warning">Close to a limit</Badge> : null}
      />
      <CardBody className="space-y-4">
        <dl className="grid grid-cols-3 gap-3">
          {PERIODS.map(([p, label]) => {
            const v = f.periods[p];
            return (
              <div key={p}>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink-900 dark:text-ink-50">
                  {n(v.used)}
                  <span className="text-sm font-normal text-ink-400"> / {limitText(v.limit)}</span>
                </dd>
                {v.limit !== null ? <dd className="text-[11px] text-ink-400" title={`Resets ${whenItResets(v.resetAt)}`}>{n(v.remaining)} left</dd> : null}
              </div>
            );
          })}
        </dl>
        {f.actions.map((a) => (
          <p key={a.action} className="text-xs text-ink-500 dark:text-ink-400">
            {a.label}: {PERIODS.filter(([p]) => a.periods[p].limit !== null).map(([p, l]) => `${n(a.periods[p].used)} of ${n(a.periods[p].limit)} ${l.toLowerCase()}`).join(' · ')}
          </p>
        ))}
        <div className="flex flex-wrap items-center gap-1 border-t border-ink-100 pt-3 dark:border-ink-800">
          <span className="mr-1 flex items-center gap-1 text-xs text-ink-400"><RotateCcw className="h-3.5 w-3.5" /> Reset</span>
          {PERIODS.map(([p, label]) => (
            <Button key={p} size="sm" variant="ghost" onClick={() => onReset(f, p, label)}>
              {label}
            </Button>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

const startOfLocalDay = (value) => (value ? new Date(`${value}T00:00:00`).toISOString() : null);
const endOfLocalDay = (value) => (value ? new Date(`${value}T23:59:59.999`).toISOString() : null);

function OverrideForm({ person, config, onCreated }) {
  const meters = config.features.flatMap((f) => [{ meter: f.feature, label: f.label }, ...f.actions.map((a) => ({ meter: a.meter, label: `${f.label}: ${a.label}` }))]);
  const defaults = new Map(config.limits.map((l) => [l.meter, l]));
  const [meter, setMeter] = useState('kotka_ai');
  const [form, setForm] = useState({ daily: '', weekly: '', monthly: '', starts: '', ends: '', reason: '' });
  const [busy, setBusy] = useState(false);

  // Start from everyone's limits for this feature, so only what changes needs typing.
  useEffect(() => {
    const d = defaults.get(meter);
    setForm((f) => ({ ...f, daily: d?.daily ?? '', weekly: d?.weekly ?? '', monthly: d?.monthly ?? '' }));
  }, [meter]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await api.post(`/admin/usage/users/${person.id}/overrides`, {
        meter,
        daily: form.daily === '' ? null : Number(form.daily),
        weekly: form.weekly === '' ? null : Number(form.weekly),
        monthly: form.monthly === '' ? null : Number(form.monthly),
        startsAt: form.starts && form.starts > today ? startOfLocalDay(form.starts) : null,
        expiresAt: endOfLocalDay(form.ends),
        reason: form.reason,
      });
      toast(`${person.name} has their own limits now.`);
      setForm((f) => ({ ...f, starts: '', ends: '', reason: '' }));
      onCreated();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Feature or action" value={meter} onChange={(e) => setMeter(e.target.value)}>
          {meters.map((m) => (
            <option key={m.meter} value={m.meter}>{m.label}</option>
          ))}
        </Select>
        <Input label="Reason" placeholder="For example: beta tester" value={form.reason} onChange={set('reason')} maxLength={300} required />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Input label="Daily" type="number" min={0} placeholder="No limit" value={form.daily} onChange={set('daily')} />
        <Input label="Weekly" type="number" min={0} placeholder="No limit" value={form.weekly} onChange={set('weekly')} />
        <Input label="Monthly" type="number" min={0} placeholder="No limit" value={form.monthly} onChange={set('monthly')} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Starts" type="date" hint="Leave empty to start now." value={form.starts} onChange={set('starts')} />
        <Input label="Ends" type="date" hint="Leave empty to keep it until you end it." value={form.ends} onChange={set('ends')} />
      </div>
      <p className="text-xs text-ink-400">These replace everyone’s limits for this person while active. An empty box means no limit for that period. An earlier override for the same thing ends.</p>
      <Button type="submit" disabled={busy || form.reason.trim().length < 3}>{busy ? 'Saving…' : 'Give them these limits'}</Button>
    </form>
  );
}

function PersonDetail({ id, onShowLogs }) {
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const load = () => api.get(`/admin/usage/users/${id}`).then(setData).catch((err) => setError(err.message));
  useEffect(() => {
    setData(null);
    setError(null);
    load();
    api.get('/admin/usage/config').then(setConfig).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <LoadError message={error} />;
  if (!data) return <div className="h-72 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const { user } = data;

  const reset = async (f, period, label) => {
    const reason = await promptDialog({
      title: `Reset ${user.name}’s ${f.label} usage for ${label.toLowerCase()}?`,
      message: `Their count starts again from now.${period === 'week' ? ' This also resets today.' : period === 'month' ? ' This also resets today and this week.' : ''} Their history stays in the usage log.`,
      label: 'Reason (optional)',
      optional: true,
      maxLength: 300,
      confirmLabel: 'Reset',
    });
    if (reason === null) return;
    try {
      await api.post(`/admin/usage/users/${user.id}/reset`, { feature: f.feature, period, reason: reason || undefined });
      toast('Reset. Their count starts again from now.');
      load();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  const endOverride = async (o) => {
    if (!(await confirmDialog({ title: 'End this override?', message: 'Everyone’s limits apply to them again straight away.', confirmLabel: 'End it' }))) return;
    try {
      await api.post(`/admin/usage/overrides/${o.id}/end`, {});
      toast('Ended.');
      load();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  const meterName = (meter) => {
    const [f, a] = meter.split('.');
    const feat = config?.features.find((x) => x.feature === f);
    return a ? `${feat?.label ?? f}: ${feat?.actions.find((x) => x.action === a)?.label ?? a}` : feat?.label ?? f;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-ink-900 dark:text-ink-50">{user.name}</p>
          <p className="text-xs text-ink-400">
            {user.email}
            {user.username ? ` · @${user.username}` : ''} · {user.role.replace('_', ' ')}
            {data.exempt ? ' · staff, not held to limits' : ''}
          </p>
        </div>
        <Button size="sm" variant="secondary" icon={ListOrdered} onClick={() => onShowLogs(user.id)}>Their usage log</Button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {data.features.map((f) => (
          <FeatureUsage key={f.feature} f={f} onReset={reset} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Their own limits" subtitle="For testers, staff, ambassadors or anyone who needs different limits." />
          <CardBody className="space-y-5">
            {data.overrides.length ? (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {data.overrides.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-ink-800 dark:text-ink-100">
                        {meterName(o.meter)}
                        <Badge tone={o.active ? 'accent' : 'neutral'}>{o.active ? 'Active' : o.upcoming ? `Starts ${dateOnly(o.startsAt)}` : o.endedAt ? 'Ended' : 'Expired'}</Badge>
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                        Daily {limitText(o.daily)} · weekly {limitText(o.weekly)} · monthly {limitText(o.monthly)}
                        {o.expiresAt ? ` · until ${dateOnly(o.expiresAt)}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-400">“{o.reason}”{o.createdByName ? ` · ${o.createdByName}` : ''}, {when(o.createdAt)}</p>
                    </div>
                    {o.active || o.upcoming ? <Button size="sm" variant="ghost" onClick={() => endOverride(o)}>End</Button> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-400">None. Everyone’s limits apply.</p>
            )}
            {config ? (
              <div className="border-t border-ink-100 pt-5 dark:border-ink-800">
                <OverrideForm person={user} config={config} onCreated={load} />
              </div>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Resets" subtitle="When an admin started their count again. Nothing was deleted." />
          <CardBody>
            {data.resets.length ? (
              <ul className="divide-y divide-ink-100 text-sm dark:divide-ink-800">
                {data.resets.map((r) => (
                  <li key={r.id} className="py-2.5">
                    <p className="text-ink-700 dark:text-ink-200">
                      {meterName(r.feature)}: {r.period === 'day' ? 'the day' : r.period === 'week' ? 'the week' : 'the month'}
                    </p>
                    <p className="text-xs text-ink-400">
                      {when(r.createdAt)}
                      {r.createdByName ? ` by ${r.createdByName}` : ''}
                      {r.reason ? ` · “${r.reason}”` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-400">No resets.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-900 dark:text-ink-50">Most recent activity</h3>
        <RecordsTable records={data.recent} showPerson={false} />
      </div>
    </div>
  );
}

export default function UsageUsers({ personId, onSelect, onShowLogs }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (q.trim().length < 2) return setResults(null);
    const t = setTimeout(() => {
      api.get(`/admin/usage/users?q=${encodeURIComponent(q.trim())}`).then((r) => setResults(r.users)).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find someone by name, email or username…"
              aria-label="Find someone"
              className="h-10 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
            />
          </div>
          {results ? (
            results.length ? (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {results.map((u) => (
                  <li key={u.id}>
                    <button type="button" onClick={() => { onSelect(u.id); setQ(''); }} className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm hover:bg-ink-50 dark:hover:bg-ink-800/40">
                      <span className="min-w-0 truncate text-ink-800 dark:text-ink-100">
                        {u.name} <span className="text-xs text-ink-400">{u.email}</span>
                      </span>
                      <span className="text-xs text-ink-400">{u.role.replace('_', ' ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-400">No one matches “{q.trim()}”.</p>
            )
          ) : null}
        </CardBody>
      </Card>
      {personId ? (
        <PersonDetail id={personId} onShowLogs={onShowLogs} />
      ) : (
        <EmptyState icon={UserRound} title="Look someone up" description="Search above to see their usage, the limits that apply to them, and to reset or change them." />
      )}
    </div>
  );
}
