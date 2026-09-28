import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { PauseCircle } from 'lucide-react';
import Card, { CardHeader, CardBody } from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import EmptyState from '../../../components/ui/EmptyState';
import { Select } from '../../../components/ui/Input';
import LoadError from '../components/LoadError';
import { api } from '../../../lib/api';
import { CHART_COLORS } from '../../../lib/chartColors';
import { useTheme } from '../../../context/ThemeContext';
import { n, pct, unit } from './shared';

function Figure({ label, value, hint }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-ink-900 dark:text-ink-50">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

function FeatureCard({ f, paused }) {
  // Share of the people who used the feature in the same period.
  const reached = [
    ['Reached the daily limit', `${n(f.reachedLimit.daily.today)} today (${pct(f.reachedLimit.daily.today, f.activeUsers.day)}) · ${n(f.reachedLimit.daily.thisMonth)} this month (${pct(f.reachedLimit.daily.thisMonth, f.activeUsers.month)})`],
    ['Reached the weekly limit', `${n(f.reachedLimit.weekly.thisWeek)} this week (${pct(f.reachedLimit.weekly.thisWeek, f.activeUsers.week)}) · ${n(f.reachedLimit.weekly.thisMonth)} this month`],
    ['Reached the monthly limit', `${n(f.reachedLimit.monthly.thisMonth)} this month (${pct(f.reachedLimit.monthly.thisMonth, f.activeUsers.month)})`],
    ['Not counted this month', `${n(f.failedThisMonth)} failed · ${n(f.notChargedThisMonth)} cost nothing`],
  ];
  return (
    <Card>
      <CardHeader
        title={f.label}
        subtitle={`Counted in ${unit(f.unit, 2)}`}
        action={paused ? <Badge tone="warning">Paused</Badge> : f.atLimit ? <Badge tone="loss">{n(f.atLimit)} at a limit now</Badge> : f.approaching ? <Badge tone="warning">{n(f.approaching)} close to a limit</Badge> : null}
      />
      <CardBody className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          <Figure label="Today" value={n(f.units.day)} hint={`${n(f.activeUsers.day)} ${f.activeUsers.day === 1 ? 'person' : 'people'}`} />
          <Figure label="This week" value={n(f.units.week)} hint={`${n(f.activeUsers.week)} ${f.activeUsers.week === 1 ? 'person' : 'people'}`} />
          <Figure label="This month" value={n(f.units.month)} hint={`${n(f.activeUsers.month)} ${f.activeUsers.month === 1 ? 'person' : 'people'}`} />
        </div>
        <dl className="space-y-2.5 border-t border-ink-100 pt-4 text-xs dark:border-ink-800">
          {reached.map(([k, v]) => (
            <div key={k}>
              <dt className="text-ink-400">{k}</dt>
              <dd className="mt-0.5 tabular-nums text-ink-600 dark:text-ink-300">{v}</dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}

function Breakdown({ feature }) {
  const { theme } = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setData(null);
    api.get(`/admin/usage/features/${feature}/breakdown`).then(setData).catch((err) => setError(err.message));
  }, [feature]);

  // Every day in the last 30, including days with no use (a real zero).
  const days = useMemo(() => {
    if (!data) return [];
    const totals = new Map();
    for (const r of data.daily) totals.set(r.day, (totals.get(r.day) ?? 0) + r.units);
    const out = [];
    const start = new Date(data.since);
    for (let i = 0; i < 30; i++) {
      const d = new Date(start.getTime() + i * 86400e3);
      const key = d.toISOString().slice(0, 10);
      out.push({ key, label: d.toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' }), units: totals.get(key) ?? 0 });
    }
    return out;
  }, [data]);

  if (error) return <p className="text-sm text-loss-500">{error}</p>;
  if (!data) return <div className="h-72 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const dark = theme === 'dark';
  const anyUse = days.some((d) => d.units > 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={`${data.label}: ${unit(data.unit, 2)} per day`} subtitle="Last 30 days, UTC days. Counted use only." />
        <CardBody>
          {anyUse ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={days} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={dark ? CHART_COLORS.grid.dark : CHART_COLORS.grid.light} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} interval={4} tick={{ fontSize: 11, fill: dark ? CHART_COLORS.tick.dark : CHART_COLORS.tick.light }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: dark ? CHART_COLORS.tick.dark : CHART_COLORS.tick.light }} />
                  <Tooltip cursor={{ fill: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(v) => [n(v), unit(data.unit, 2)]} />
                  <Bar dataKey="units" name={unit(data.unit, 2)} fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState size="inline" title="No use in the last 30 days" description="This fills in as people use the feature." />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="By action" subtitle="What each backend operation used. Tokens and outside calls are for this month." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs text-ink-400 dark:border-ink-800">
                {['Action', 'Today', 'This week', 'This month', 'Failed', 'Cost nothing', 'AI tokens (in / out)', 'Outside calls', 'From cache'].map((h) => (
                  <th key={h} className="px-5 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.actions.length ? (
                data.actions.map((a) => (
                  <tr key={a.action} className="border-b border-ink-50 last:border-0 dark:border-ink-800/60">
                    <td className="px-5 py-3 text-ink-700 dark:text-ink-200">{a.label}</td>
                    <td className="px-5 py-3 tabular-nums text-ink-600 dark:text-ink-300">{n(a.units.day)}</td>
                    <td className="px-5 py-3 tabular-nums text-ink-600 dark:text-ink-300">{n(a.units.week)}</td>
                    <td className="px-5 py-3 tabular-nums text-ink-600 dark:text-ink-300">{n(a.units.month)}</td>
                    <td className="px-5 py-3 tabular-nums text-ink-600 dark:text-ink-300">{n(a.failedThisMonth)}</td>
                    <td className="px-5 py-3 tabular-nums text-ink-600 dark:text-ink-300">{n(a.notChargedThisMonth)}</td>
                    <td className="px-5 py-3 tabular-nums text-ink-600 dark:text-ink-300" title={a.tokensThisMonth ? `Reported on ${n(a.tokensThisMonth.requests)} requests` : 'The provider didn’t report tokens'}>
                      {a.tokensThisMonth ? `${n(a.tokensThisMonth.input)} / ${n(a.tokensThisMonth.output)}` : 'Not reported'}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-ink-600 dark:text-ink-300">{n(a.upstreamCallsThisMonth)}</td>
                    <td className="px-5 py-3 tabular-nums text-ink-600 dark:text-ink-300">{n(a.cacheHitsThisMonth)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-5 py-6 text-center text-xs text-ink-400">Nothing recorded yet this month.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Outside calls by source" subtitle="This month. A call is counted when the cache didn’t already have the data." />
          <CardBody>
            {data.sources.length ? (
              <ul className="divide-y divide-ink-100 text-sm dark:divide-ink-800">
                {data.sources.map((s) => (
                  <li key={s.source} className="flex justify-between py-2">
                    <span className="font-mono text-xs text-ink-600 dark:text-ink-300">{s.source}</span>
                    <span className="tabular-nums text-ink-700 dark:text-ink-200">{n(s.calls)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-400">No outside calls this month: everything came from the cache.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Heaviest use this month" subtitle={`Counted ${unit(data.unit, 2)} per person`} />
          <CardBody>
            {data.topUsers.length ? (
              <ul className="divide-y divide-ink-100 text-sm dark:divide-ink-800">
                {data.topUsers.map((u) => (
                  <li key={u.userId} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-ink-700 dark:text-ink-200">
                      {u.name} <span className="text-xs text-ink-400">{u.email}</span>
                    </span>
                    <span className="tabular-nums text-ink-700 dark:text-ink-200">{n(u.units)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-400">No one has used this yet this month.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function UsageOverview({ onOpenPerson }) {
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [feature, setFeature] = useState('kotka_ai');

  useEffect(() => {
    Promise.all([api.get('/admin/usage/overview'), api.get('/admin/usage/config')])
      .then(([o, c]) => {
        setData(o);
        setConfig(c);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <LoadError message={error} />;
  if (!data || !config) return <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const paused = config.features.filter((f) => f.paused);

  return (
    <div className="space-y-6">
      {paused.length ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Paused for everyone: {paused.map((f) => f.label).join(', ')}. People see “temporarily unavailable”. Resume it under Limits.
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {data.features.map((f) => (
          <FeatureCard key={f.feature} f={f} paused={config.features.find((c) => c.feature === f.feature)?.paused} />
        ))}
      </div>

      <Card>
        <CardHeader title="Close to or at a limit right now" subtitle="People past a warning point, or with a limit used up. Staff who aren’t limited are left out." />
        <CardBody>
          {data.people.length ? (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {data.people.map((p) => (
                <li key={`${p.userId}-${p.feature}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                  <button type="button" onClick={() => onOpenPerson(p.userId)} className="min-w-0 text-left">
                    <span className="font-medium text-ink-800 hover:underline dark:text-ink-100">{p.name}</span> <span className="text-xs text-ink-400">{p.email}</span>
                  </button>
                  <span className="flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
                    {p.label}
                    {p.headline ? ` · ${n(p.headline.used)} of ${n(p.headline.limit)} ${p.headline.period === 'day' ? 'today' : p.headline.period === 'week' ? 'this week' : 'this month'}` : ''}
                    {p.source === 'override' ? ' · own limit' : ''}
                    <Badge tone={p.status === 'reached' ? 'loss' : 'warning'}>{p.status === 'reached' ? 'At limit' : 'Close'}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState size="inline" title="No one is close to a limit" description="People show up here once they pass a limit’s warning point." />
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-ink-200 pt-6 dark:border-ink-800">
        <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">Feature detail</h2>
        <div className="w-56">
          <Select label="Feature" value={feature} onChange={(e) => setFeature(e.target.value)}>
            {config.features.map((f) => (
              <option key={f.feature} value={f.feature}>{f.label}</option>
            ))}
          </Select>
        </div>
      </div>
      <Breakdown feature={feature} />
    </div>
  );
}
