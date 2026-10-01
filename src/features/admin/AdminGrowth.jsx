import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { TrendingUp } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import LoadError from './components/LoadError';
import { api } from '../../lib/api';

// Growth from real rows only: the sign-up funnel, active people and weekly
// retention. Retention starts the day daily activity started being recorded;
// weeks before that say so instead of showing a number.
const PERIODS = [[30, '30 days'], [90, '90 days'], [365, '12 months']];
const shortDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { day: 'numeric', month: 'short' });

function Funnel({ steps }) {
  const top = steps[0]?.count || 1;
  return (
    <ol className="space-y-2.5">
      {steps.map((s) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink-700 dark:text-ink-200">{s.label}</span>
            <span className="tabular-nums text-ink-900 dark:text-ink-50">{s.count}<span className="ml-1.5 text-xs text-ink-400">{s.pct !== null ? `${s.pct}%` : ''}</span></span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-ink-100 dark:bg-ink-800" title={`${s.label}: ${s.count}${s.pct !== null ? ` (${s.pct}% of sign-ups)` : ''}`}>
            <div className="h-2.5 rounded-full bg-accent-500" style={{ width: `${Math.max(s.count ? 1.5 : 0, (s.count / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Daily({ days }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={`People active each day for the last ${days.length} days, up to ${max} a day`}>
        {days.map((d) => (
          <span key={d.day} title={`${shortDay(d.day)}: ${d.count} active`} className="min-w-0 flex-1 rounded-t-[4px] bg-accent-500/80 hover:bg-accent-600" style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-400"><span>{shortDay(days[0].day)}</span><span>{shortDay(days.at(-1).day)}</span></div>
    </div>
  );
}

function Cell({ v }) {
  if (v === null || v === undefined) return <td className="px-3 py-2 text-center text-xs text-ink-300 dark:text-ink-600" title="Not recorded yet">·</td>;
  // One hue, light to dark, by share of the cohort that came back.
  const step = v >= 60 ? 'bg-accent-600 text-white' : v >= 40 ? 'bg-accent-500 text-white' : v >= 20 ? 'bg-accent-300 text-ink-900' : v > 0 ? 'bg-accent-100 text-ink-900 dark:bg-accent-900/40 dark:text-ink-100' : 'bg-ink-50 text-ink-500 dark:bg-ink-800';
  return <td className="px-1.5 py-1.5"><span className={clsx('block rounded-md px-2 py-1 text-center text-xs font-medium tabular-nums', step)}>{v}%</span></td>;
}

export default function AdminGrowth() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setData(null);
    api.get(`/admin/stats/growth?days=${days}`).then(setData).catch((err) => setError(err.message));
  }, [days]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Growth"
        description="How new traders get started, how many use Kotka, and how many come back. Staff accounts aren’t counted."
        actions={
          <div className="flex gap-1 text-xs">
            {PERIODS.map(([n, label]) => (
              <button key={n} type="button" onClick={() => setDays(n)} aria-pressed={days === n} className={clsx('rounded-lg px-2.5 py-1.5 font-medium', days === n ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'text-ink-500 hover:bg-white dark:hover:bg-ink-800')}>{label}</button>
            ))}
          </div>
        }
      />
      {error ? <LoadError message={error} /> : null}
      {!data && !error ? <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" /> : null}
      {data ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Getting started" subtitle={`Of the traders who signed up in the last ${PERIODS.find(([n]) => n === days)[1]}, how many reached each step.`} />
            <CardBody>{data.funnel[0].count ? <Funnel steps={data.funnel} /> : <EmptyState size="inline" icon={TrendingUp} title="No sign-ups in this period" />}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Active people" subtitle={data.trackingFrom ? `Counted from ${new Date(`${data.trackingFrom}T12:00:00Z`).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'Counting starts with the first visit after this page shipped.'} />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[['Today', data.active.dau], ['Last 7 days', data.active.wau], ['Last 30 days', data.active.mau]].map(([label, n]) => (
                  <div key={label} className="rounded-xl bg-ink-50 px-3 py-2.5 dark:bg-ink-800/60">
                    <p className="text-[11px] text-ink-500 dark:text-ink-400">{label}</p>
                    <p className="font-mono text-xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">{n}</p>
                  </div>
                ))}
              </div>
              {data.active.daily.length > 1 ? <Daily days={data.active.daily} /> : <p className="text-xs text-ink-400">The daily chart fills in as days pass.</p>}
            </CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Coming back" subtitle="Of each week’s new traders, the share who used Kotka again in their 2nd, 3rd and 5th week. A dot means that week isn’t recorded yet." />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="text-left text-xs text-ink-400">{['Signed up the week of', 'New traders', 'Week 2', 'Week 3', 'Week 5'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {data.cohorts.map((c) => (
                    <tr key={c.weekOf} className="border-t border-ink-50 dark:border-ink-800/60">
                      <td className="px-3 py-2 text-ink-700 dark:text-ink-200">{shortDay(c.weekOf)}</td>
                      <td className="px-3 py-2 tabular-nums text-ink-600 dark:text-ink-300">{c.size}</td>
                      <Cell v={c.week2} />
                      <Cell v={c.week3} />
                      <Cell v={c.week5} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
