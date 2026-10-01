import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import InfoTip from '../../components/ui/InfoTip';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Brain, CalendarDays, CheckCircle2, Flame, ListChecks, Megaphone, NotebookPen, Sparkles, Target } from 'lucide-react';
import { localToday } from '../goals/card';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { localDay } from '../../lib/day';
import WeeklyPerformanceChart from './widgets/WeeklyPerformanceChart';
import EmptyState from '../../components/ui/EmptyState';

// "Get started": the first things worth doing, ticked from what the trader
// has actually done. Hidden once they're all done, or when dismissed.
function GettingStarted({ userId }) {
  const key = `kotka:getting-started-hidden:${userId}`;
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  });
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!hidden) api.get('/me/getting-started').then(setData).catch(() => {});
  }, [hidden]);
  if (hidden || !data || data.done === data.steps.length) return null;
  const hide = () => {
    setHidden(true);
    try { localStorage.setItem(key, '1'); } catch { /* storage blocked */ }
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">Get started</p>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{data.done} of {data.steps.length} done. Each one takes a minute or two.</p>
        </div>
        <button type="button" onClick={hide} className="text-xs font-medium text-ink-400 hover:text-ink-700 dark:hover:text-ink-200">Hide</button>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-ink-100 dark:bg-ink-800" role="progressbar" aria-valuemin={0} aria-valuemax={data.steps.length} aria-valuenow={data.done} aria-label="Getting started progress">
        <div className="h-1.5 rounded-full bg-accent-500" style={{ width: `${(data.done / data.steps.length) * 100}%` }} />
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {data.steps.map((s) => (
          <li key={s.key}>
            <Link to={s.to} className={clsx('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm', s.done ? 'text-ink-400 line-through decoration-ink-300' : 'text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800')}>
              <CheckCircle2 className={clsx('h-4 w-4 shrink-0', s.done ? 'text-profit-500' : 'text-ink-300')} aria-hidden="true" />
              <span>{s.label}</span>
              <span className="sr-only">{s.done ? '(done)' : '(to do)'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const CHECKLIST_TOTAL = 8;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const money = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}$${Math.abs(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function useGet(path) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.get(path).then(setData).catch(() => setFailed(true));
  }, [path]);
  return [data, failed];
}

// One readout inside the readiness panel. Big mono figure, small caption.
function Gauge({ label, value, unit, caption, info, children }) {
  return (
    <div className="min-w-0 py-5 sm:px-6 sm:first:pl-0 sm:last:pr-0">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-400">
        {label}
        {info ? <InfoTip label={label} tone="onDark">{info}</InfoTip> : null}
      </p>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-white">{value}</span>
        {unit ? <span className="font-mono text-sm text-ink-400">{unit}</span> : null}
      </p>
      {children}
      {caption ? <p className="mt-2 text-xs leading-relaxed text-ink-400">{caption}</p> : null}
    </div>
  );
}

function Meter({ value, max, tone = 'gold', label }) {
  const pct = Math.min((value / (max || 1)) * 100, 100);
  return (
    <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={clsx('h-full rounded-full transition-[width] duration-700', tone === 'loss' ? 'bg-loss-400' : 'bg-accent-400')} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ReadinessPanel({ user, data, checklistDone }) {
  const firstName = user?.name?.split(' ')[0] ?? 'Trader';
  const risk = data?.riskUsedToday ?? 0;
  const limit = data?.dailyLossLimit ?? 2;
  const overLimit = risk >= limit;
  const ready = checklistDone >= CHECKLIST_TOTAL && !overLimit;

  return (
    <section className="on-dark relative overflow-hidden rounded-3xl bg-ink-950 p-6 text-white ring-1 ring-ink-800 sm:p-8 dark:bg-ink-900">
      <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-accent-500/10 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-ink-400">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting()}, {firstName}.
          </h1>
        </div>
        <p className={clsx('flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium', ready ? 'bg-profit-500/15 text-profit-400' : overLimit ? 'bg-loss-500/15 text-loss-400' : 'bg-accent-500/15 text-accent-300')}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', ready ? 'bg-profit-400' : overLimit ? 'bg-loss-400' : 'bg-accent-400')} />
          {ready ? 'Process complete for today' : overLimit ? 'Daily loss limit reached' : 'Finish your process before trading'}
        </p>
      </div>

      <div className="relative mt-4 grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Gauge label="Risk used today" info={<>R is what you risk on one trade, so 2R means two full losses. This adds up the risk on today's losing trades; hit the limit and you're done for the day. Change it in <Link to="/app/settings?section=trading" className="underline">Settings</Link>.</>} value={risk} unit={`/ ${limit}R`} caption={overLimit ? 'Stop for today. The limit exists for days like this.' : `${Math.max(limit - risk, 0)}R left before your daily stop.`}>
          <Meter value={risk} max={limit} tone={overLimit ? 'loss' : 'gold'} label="Risk used today" />
        </Gauge>
        <Gauge label="Pre-trade checklist" info="Today's checklist. Work through it before each entry, then tick 'Pre-trade checklist was completed' when you journal the trade so it counts." value={checklistDone} unit={`/ ${CHECKLIST_TOTAL}`} caption={checklistDone >= CHECKLIST_TOTAL ? 'Every condition checked.' : 'Conditions still open for today.'}>
          <Meter value={checklistDone} max={CHECKLIST_TOTAL} label="Checklist items done today" />
        </Gauge>
        <Gauge label="Discipline score" info="The share of your journaled trades entered with the checklist complete. It measures process, not profit." value={data?.disciplineScore ?? 0} unit="/ 100" caption={data?.totalEntries ? `Checklist completion across ${data.totalEntries} journaled trades. ${data.streak} day${data.streak === 1 ? '' : 's'} within your loss limit.` : 'Builds as you journal trades.'} />
      </div>

      <div className="relative mt-2 flex flex-wrap gap-2 border-t border-white/10 pt-5">
        <Button as={Link} to="/app/checklist" variant="accent" size="sm" icon={ListChecks} className="active:scale-[0.98]">
          {checklistDone >= CHECKLIST_TOTAL ? 'Review checklist' : 'Complete checklist'}
        </Button>
        <Button as={Link} to="/app/journal" variant="onDark" size="sm" icon={NotebookPen}>
          {data?.hasJournaledToday ? 'Open journal' : 'Log a trade'}
        </Button>
        <Button as={Link} to="/app/ai" variant="ghostOnDark" size="sm" icon={Sparkles}>
          Pressure-test an idea
        </Button>
      </div>
    </section>
  );
}

function SideNotice({ announcement, releases }) {
  if (announcement) {
    return (
      <Card className="flex h-full flex-col p-6">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-700 dark:text-accent-400">
          <Megaphone className="h-3.5 w-3.5" /> From the Kotka team
        </p>
        <h2 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-ink-900 dark:text-ink-50">{announcement.title}</h2>
        {announcement.body ? <p className="mt-2 line-clamp-5 whitespace-pre-line text-sm leading-relaxed text-ink-600 dark:text-ink-300">{announcement.body}</p> : null}
        <p className="mt-auto pt-4 text-xs text-ink-400">{new Date(announcement.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</p>
      </Card>
    );
  }
  const [first, ...rest] = releases;
  const when = (e) =>
    `${new Date(e.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${e.dateOnly ? '' : ` · ${new Date(e.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`}`;
  const title = (e) => e.title.replace(/\s*—\s*/g, ': ');
  return (
    <Card className="flex h-full flex-col p-6">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
        <CalendarDays className="h-3.5 w-3.5" /> Coming up, official releases
      </p>
      {first ? (
        <>
          <p className="mt-3 font-mono text-sm tabular-nums text-accent-700 dark:text-accent-400">{when(first)}</p>
          <h2 className="mt-1 text-lg font-semibold leading-snug tracking-tight text-ink-900 dark:text-ink-50">{title(first)}</h2>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            {first.currency} · {first.importance} importance · {first.source.name.split(/ [—-] /)[0]}
          </p>
          {rest.length ? (
            <ul className="mt-4 space-y-2.5 border-t border-ink-100 pt-4 dark:border-ink-800">
              {rest.slice(0, 3).map((e, i) => (
                <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-2 text-xs">
                  <span className="font-mono font-semibold text-ink-500 dark:text-ink-400">{e.currency}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-ink-800 dark:text-ink-100">{title(e)}</span>
                    <span className="font-mono text-[11px] tabular-nums text-ink-400">{when(e)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-ink-400">No major releases in the next 7 days.</p>
      )}
      <Link to="/app/market" className="mt-auto flex items-center gap-1 pt-4 text-xs font-medium text-accent-600 hover:underline dark:text-accent-400">
        Full calendar and research <ArrowRight className="h-3 w-3" />
      </Link>
    </Card>
  );
}

function PulseList({ pulse }) {
  return (
    <Card className="p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Market pulse</h2>
        <Link to="/app/market" className="text-xs font-medium text-accent-600 hover:underline dark:text-accent-400">Research</Link>
      </div>
      <p className="mt-0.5 text-[11px] text-ink-400">Yesterday’s closing prices, not live</p>
      <ul className="mt-4 divide-y divide-ink-100 dark:divide-ink-800">
        {!pulse
          ? [0, 1, 2, 3, 4].map((i) => <li key={i} className="my-2 h-8 animate-pulse rounded bg-ink-50 dark:bg-ink-800" />)
          : pulse.instruments.map((i) => (
              <li key={i.symbol} className="flex items-center justify-between gap-3 py-2.5">
                <span className="font-mono text-xs font-semibold text-ink-800 dark:text-ink-100">{i.symbol}</span>
                {i.available ? (
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs tabular-nums text-ink-600 dark:text-ink-300">{Number(i.close).toLocaleString(undefined, { minimumFractionDigits: i.decimals, maximumFractionDigits: i.decimals })}</span>
                    <span className={clsx('flex w-16 items-center justify-end gap-0.5 font-mono text-xs tabular-nums', i.changePct > 0 ? 'text-profit-600 dark:text-profit-400' : i.changePct < 0 ? 'text-loss-500' : 'text-ink-400')}>
                      {i.changePct > 0 ? <ArrowUpRight className="h-3 w-3" /> : i.changePct < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
                      {i.changePct > 0 ? '+' : ''}
                      {i.changePct}%
                    </span>
                  </span>
                ) : (
                  <span className="text-[11px] text-ink-400">{['rate_limited', 'not_loaded'].includes(i.reason) ? 'Loading…' : 'No price yet'}</span>
                )}
              </li>
            ))}
      </ul>
    </Card>
  );
}

// Goal Room at a glance: today's check-in and running goals.
function GoalRoomStrip({ summary }) {
  if (!summary) return null;
  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-500/15 text-accent-700 dark:text-accent-300"><Flame className="h-5 w-5" /></span>
        <div>
          <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{summary.currentStreak ? `${summary.currentStreak}-day streak` : 'Start your streak'}</p>
          <p className="text-xs text-ink-400">Goal Room · Level {summary.level.n} {summary.level.name}{summary.adherence30 != null ? ` · ${summary.adherence30}% discipline` : ''}</p>
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-2">
        {summary.goals.map((g) => (
          <li key={g.id} className="min-w-[10rem] flex-1">
            <p className="flex justify-between gap-2 text-xs"><span className="truncate text-ink-600 dark:text-ink-300">{g.title}</span><span className="font-mono tabular-nums text-ink-400">{g.pct}%</span></p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800"><div className={clsx('h-full rounded-full', g.pct >= 100 ? 'bg-accent-500' : 'bg-ink-900 dark:bg-accent-600')} style={{ width: `${g.pct}%` }} /></div>
          </li>
        ))}
      </ul>
      <Button as={Link} to="/app/goals" size="sm" variant={summary.checkedInToday ? 'secondary' : 'primary'} icon={summary.checkedInToday ? Target : CheckCircle2}>
        {summary.checkedInToday ? 'Goal Room' : 'Check in today'}
      </Button>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const today = localDay();
  const [data, dataFailed] = useGet('/me/dashboard');
  const [checklist] = useGet(`/checklist/${today}`);
  const [pulse] = useGet('/market/pulse');
  const [calendar] = useGet('/market/calendar?days=7');
  const [ann] = useGet('/me/announcements');
  const [goalSummary] = useGet(`/goals/summary?today=${localToday()}`);

  const checklistDone = Object.values(checklist?.items ?? {}).filter(Boolean).length;
  const weekNet = data?.weeklyPerformance?.reduce((s, d) => s + d.pnl, 0) ?? 0;
  const announcement = ann?.announcements?.[0];
  // High-importance releases first, in date order.
  const releases = [...(calendar?.events ?? []).filter((e) => e.importance === 'High'), ...(calendar?.events ?? []).filter((e) => e.importance !== 'High')];

  return (
    <div className="space-y-6">
      {dataFailed ? (
        <p role="alert" className="rounded-xl border border-loss-500/30 bg-loss-50 px-4 py-3 text-sm text-loss-600 dark:bg-loss-500/10 dark:text-loss-400">
          We couldn’t load your numbers just now, so some figures below may show zero. Refresh the page to try again.
        </p>
      ) : null}
      {user ? <GettingStarted userId={user.id} /> : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <ReadinessPanel user={user} data={data} checklistDone={checklistDone} />
        </div>
        <div className="xl:col-span-4">
          <SideNotice announcement={announcement} releases={releases} />
        </div>
      </div>

      <GoalRoomStrip summary={goalSummary} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="p-6 xl:col-span-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Realized P&amp;L, last 7 days</h2>
              <p className="mt-0.5 text-xs text-ink-400">Closed trades from your journal, by day</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-ink-400">Net</p>
              <p className={clsx('font-mono text-xl font-semibold tabular-nums', weekNet > 0 ? 'text-profit-600 dark:text-profit-400' : weekNet < 0 ? 'text-loss-500' : 'text-ink-900 dark:text-ink-50')}>{money(weekNet)}</p>
            </div>
          </div>
          <div className="mt-4">{data ? <WeeklyPerformanceChart data={data.weeklyPerformance} /> : <div className="h-48 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" />}</div>
          <Link to="/app/analytics" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-600 hover:underline dark:text-accent-400">
            Full analytics <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
        <div className="xl:col-span-4">
          <PulseList pulse={pulse} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="overflow-hidden xl:col-span-8">
          <div className="flex items-baseline justify-between gap-3 px-6 pt-6">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Recent trades</h2>
            {data?.openPositions?.length ? <span className="text-xs text-ink-400">{data.openPositions.length} open position{data.openPositions.length === 1 ? '' : 's'}</span> : null}
          </div>
          {!data?.recentTrades?.length ? (
            <EmptyState
              size="inline"
              icon={NotebookPen}
              title="No trades logged yet"
              description="Your first journal entry starts your discipline record and fills this list."
              action={<Button as={Link} to="/app/journal" variant="secondary" size="sm" icon={NotebookPen}>Log a trade</Button>}
            />
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-ink-100 text-left text-[11px] uppercase tracking-wide text-ink-400 dark:border-ink-800">
                    <th className="px-6 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Market</th>
                    <th className="px-3 py-2 font-medium">Side</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">Session</th>
                    <th className="px-6 py-2 text-right font-medium">P&amp;L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                  {data.recentTrades.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap px-6 py-3 font-mono text-xs tabular-nums text-ink-500 dark:text-ink-400">{t.date.slice(5)}</td>
                      <td className="px-3 py-3 font-medium text-ink-800 dark:text-ink-100">{t.symbol}</td>
                      <td className="px-3 py-3 text-ink-500 dark:text-ink-400">{t.direction}</td>
                      <td className="hidden px-3 py-3 text-ink-500 dark:text-ink-400 sm:table-cell">{t.session || ''}</td>
                      <td className={clsx('px-6 py-3 text-right font-mono tabular-nums', t.pnl > 0 ? 'text-profit-600 dark:text-profit-400' : t.pnl < 0 ? 'text-loss-500' : 'text-ink-400')}>{t.pnl == null ? 'Open' : money(t.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6 xl:col-span-4">
          <Card className="p-6">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
              <Brain className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400" /> Pattern in your journal
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-700 dark:text-ink-200">
              {data?.insights?.length ? data.insights[0] : 'Journal a few more trades and Kotka will surface real patterns in your behaviour here.'}
            </p>
          </Card>
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">This week</h2>
            <div className="mt-4 space-y-4">
              {(data?.weeklyGoals ?? []).map((g) => (
                <div key={g.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-ink-600 dark:text-ink-300">{g.label}</span>
                    <span className="font-mono tabular-nums text-ink-500 dark:text-ink-400">{g.progress}%</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                    <div className={clsx('h-full rounded-full', g.progress >= 100 ? 'bg-profit-500' : 'bg-accent-500')} style={{ width: `${g.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
