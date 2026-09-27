import { CalendarDays } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { api } from '../../../lib/api';
import { dayLabel } from '../util';
import { EventLine } from '../components/FeedCards';
import PushNudge from '../../../components/PushNudge';
import EmptyState from '../../../components/ui/EmptyState';

export default function Events() {
  const [range, setRange] = useState('upcoming');
  const [currency, setCurrency] = useState(null);
  const [high, setHigh] = useState(false);
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    const qs = new URLSearchParams({ range, ...(currency ? { currency } : {}), ...(high ? { importance: 'High' } : {}), limit: '100' });
    api.get(`/community/events?${qs}`).then(setData).catch(() => setData({ events: [] }));
  }, [range, currency, high]);
  const groups = useMemo(() => {
    const out = [];
    for (const e of data?.events ?? []) {
      const k = new Date(e.scheduledAt).toDateString();
      if (out.at(-1)?.k !== k) out.push({ k, label: dayLabel(e.scheduledAt), items: [] });
      out.at(-1).items.push(e);
    }
    return out;
  }, [data]);
  const chip = (active, onClick, label) => <button type="button" aria-pressed={active} onClick={onClick} className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', active ? 'bg-ink-900 text-white dark:bg-accent-500 dark:text-ink-950' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800')}>{label}</button>;
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="border-b border-ink-100 px-5 py-4 dark:border-ink-800">
        <h1 className="text-lg font-semibold tracking-tight text-ink-900 dark:text-ink-50">Market events</h1>
        <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Every event has a live room. Times are shown in your local time. {data?.coverage}</p>
        <PushNudge className="mt-3 border-dashed">Get a reminder before events you follow, even with Kotka closed.</PushNudge>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-100 px-4 py-2.5 dark:border-ink-800">
        {chip(range === 'upcoming', () => setRange('upcoming'), 'Upcoming')}{chip(range === 'past', () => setRange('past'), 'Past')}
        <span className="mx-1 h-4 w-px bg-ink-200 dark:bg-ink-700" />
        {chip(!currency, () => setCurrency(null), 'All')}{chip(currency === 'USD', () => setCurrency('USD'), 'USD')}{chip(currency === 'EUR', () => setCurrency('EUR'), 'EUR')}
        <span className="mx-1 h-4 w-px bg-ink-200 dark:bg-ink-700" />
        {chip(high, () => setHigh((v) => !v), 'High importance')}
      </div>
      {!data ? <div className="m-5 h-40 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" /> : null}
      {data && !data.events.length ? <EmptyState size="section" icon={CalendarDays} title="No events match these filters" description="Try a wider range or another currency. Major US and euro-area releases appear here as they’re scheduled." /> : null}
      {groups.map((g) => (
        <section key={g.k}>
          <h2 className="sticky top-0 z-[1] border-b border-ink-100 bg-ink-50/95 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500 backdrop-blur dark:border-ink-800 dark:bg-ink-900/95">{g.label}</h2>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">{g.items.map((e) => <EventLine key={e.id} event={e} />)}</div>
        </section>
      ))}
    </div>
  );
}
