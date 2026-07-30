import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  NotebookPen,
  ListChecks,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Brain,
  ChevronRight,
  Target,
} from 'lucide-react';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ProgressRing from '../../components/ui/ProgressRing';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import WeeklyPerformanceChart from './widgets/WeeklyPerformanceChart';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0] ?? 'Trader';
  const [data, setData] = useState(null);
  const [checklist, setChecklist] = useState({});
  const [market, setMarket] = useState(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    api.get('/me/dashboard').then(setData);
    api.get(`/checklist/${today}`).then(({ items }) => setChecklist(items));
    api.get('/market/snapshot').then(setMarket);
  }, []);

  const watchlistAllLive = market?.watchlist?.length > 0 && market.watchlist.every((w) => w.live);

  const checklistTotal = 8;
  const checklistDone = Object.values(checklist).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            {greeting()}, {firstName}.
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Here's what you need to know before you trade today.
          </p>
        </div>
        <Badge tone="accent" className="w-fit">
          <Calendar className="h-3 w-3" />
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </Badge>
      </div>

      {/* Hero stat row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex items-center gap-4 p-5">
          <ProgressRing value={data?.disciplineScore ?? 0} size={64} strokeWidth={6} label={data?.disciplineScore ?? '—'} color="#4a5df0" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Discipline Score</p>
            <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-300">Checklist completion rate</p>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-400">Today's Risk Limit</span>
            <ShieldAlert className="h-4 w-4 text-ink-300" strokeWidth={1.75} />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-semibold text-ink-900 dark:text-ink-50">{data?.riskUsedToday ?? 0}R</span>
            <span className="text-sm text-ink-400">/ {data?.dailyLossLimit ?? 2}R used</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
            <div
              className="h-full rounded-full bg-accent-500"
              style={{ width: `${Math.min(((data?.riskUsedToday ?? 0) / (data?.dailyLossLimit ?? 2)) * 100, 100)}%` }}
            />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-400">Current Streak</span>
            <ShieldAlert className="h-4 w-4 text-amber-500" strokeWidth={1.75} />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-semibold text-ink-900 dark:text-ink-50">{data?.streak ?? 0}</span>
            <span className="text-sm text-ink-400">days within risk limit</span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-400">Open Positions</span>
            <Target className="h-4 w-4 text-ink-300" strokeWidth={1.75} />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-semibold text-ink-900 dark:text-ink-50">{data?.openPositions?.length ?? 0}</span>
            <span className="text-sm text-ink-400">logged, not yet closed</span>
          </div>
          {data?.openPositions?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.openPositions.slice(0, 3).map((p) => (
                <Badge key={p.id} tone="accent">
                  {p.symbol} {p.direction}
                </Badge>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Weekly Performance"
              subtitle="Realized P&L, last 7 days"
              action={
                <Link to="/app/analytics" className="flex items-center text-xs font-medium text-accent-600 hover:underline dark:text-accent-400">
                  View analytics <ChevronRight className="h-3 w-3" />
                </Link>
              }
            />
            <CardBody>
              {data ? <WeeklyPerformanceChart data={data.weeklyPerformance} /> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Talk to Kotka AI"
              subtitle="Your institutional trading mentor"
              action={<Sparkles className="mt-0.5 h-4 w-4 text-accent-500" />}
            />
            <CardBody className="space-y-3">
              <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                Bring Kotka AI your thesis before you take the trade. It will challenge your bias, question your risk,
                and push you toward process over impulse — not hand you a signal.
              </p>
              <Button as={Link} to="/app/ai" variant="secondary" size="sm">
                Open Kotka AI
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent Trades" subtitle="Last 5 logged entries" />
            <CardBody className="overflow-x-auto">
              {!data?.recentTrades?.length ? (
                <p className="py-6 text-center text-sm text-ink-400">No trades logged yet.</p>
              ) : (
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800">
                      <th className="pb-2 font-medium">Symbol</th>
                      <th className="pb-2 font-medium">Direction</th>
                      <th className="pb-2 font-medium">Session</th>
                      <th className="pb-2 font-medium">R:R</th>
                      <th className="pb-2 text-right font-medium">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentTrades.map((t) => (
                      <tr key={t.id} className="border-b border-ink-50 last:border-0 dark:border-ink-800/60">
                        <td className="py-2.5 font-medium text-ink-800 dark:text-ink-100">{t.symbol}</td>
                        <td className="py-2.5 text-ink-500 dark:text-ink-400">{t.direction}</td>
                        <td className="py-2.5 text-ink-500 dark:text-ink-400">{t.session}</td>
                        <td className="py-2.5 text-ink-500 dark:text-ink-400">{t.rr}R</td>
                        <td className="py-2.5 text-right font-medium">
                          <span className={t.pnl >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500'}>
                            {t.pnl >= 0 ? '+' : ''}${t.pnl}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Today's Checklist" subtitle={`${checklistDone} of ${checklistTotal} complete`} />
            <CardBody>
              <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                <div className="h-full rounded-full bg-accent-500" style={{ width: `${(checklistDone / checklistTotal) * 100}%` }} />
              </div>
              <Button as={Link} to="/app/checklist" variant="secondary" size="sm" icon={ListChecks} className="w-full">
                Complete checklist
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Journal Reminder" />
            <CardBody className="space-y-3">
              <p className="text-sm text-ink-500 dark:text-ink-400">
                {data?.hasJournaledToday
                  ? "You've logged at least one entry today. Nice discipline."
                  : "You haven't logged a journal entry yet today."}
              </p>
              <Button as={Link} to="/app/journal" variant="secondary" size="sm" icon={NotebookPen} className="w-full">
                {data?.hasJournaledToday ? 'View journal' : 'Log trade'}
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Watchlist" action={watchlistAllLive ? <Badge tone="profit">Live</Badge> : null} />
            <CardBody className="space-y-1">
              {market?.watchlist?.slice(0, 5).map((w) => (
                <div key={w.symbol} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-1.5">
                    <div>
                      <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{w.symbol}</p>
                      <p className="text-xs text-ink-400">{w.market}</p>
                    </div>
                    {!w.live ? (
                      <span className="rounded bg-ink-100 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-400 dark:bg-ink-800">
                        sample
                      </span>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{w.price ?? '—'}</p>
                    {w.change !== null ? (
                      <p className={`flex items-center justify-end gap-0.5 text-xs font-medium ${w.change >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500'}`}>
                        {w.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {Math.abs(w.change)}%
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Economic Events" subtitle="Today" action={!market?.economicEventsLive ? <Badge tone="warning">Sample data</Badge> : <Badge tone="profit">Live</Badge>} />
            <CardBody className="space-y-3">
              {!market?.economicEvents?.length ? (
                <p className="text-sm text-ink-400">No high-impact events found for today.</p>
              ) : (
                market.economicEvents.slice(0, 4).map((e, i) => (
                  <div key={i} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{e.title}</p>
                      <p className="text-xs text-ink-400">
                        {e.time} · {e.currency}
                      </p>
                    </div>
                    <Badge tone={e.impact === 'high' ? 'loss' : 'warning'}>{e.impact}</Badge>
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Market Sentiment"
              subtitle={market?.sentimentLive ? "Derived from your watchlist's real price moves" : undefined}
              action={!market?.sentimentLive ? <Badge tone="warning">Sample data</Badge> : <Badge tone="profit">Live</Badge>}
            />
            <CardBody>
              <div className="mb-2 flex items-center justify-between text-xs text-ink-400">
                <span>Bearish</span>
                <span>Bullish</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gradient-to-r from-loss-400 via-ink-100 to-profit-500">
                <div
                  className="h-full w-0.5 bg-ink-900 dark:bg-white"
                  style={{ marginLeft: `${market?.sentiment?.overall ?? 50}%` }}
                />
              </div>
              <p className="mt-2 text-center text-sm font-medium text-ink-700 dark:text-ink-200">
                {market?.sentiment?.overall ?? '—'}/100
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Psychology Insights" action={<Brain className="mt-0.5 h-4 w-4 text-accent-500" />} />
            <CardBody>
              {data?.insights?.length ? (
                <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">{data.insights[0]}</p>
              ) : (
                <p className="text-sm text-ink-400">Log a few more trades and Kotka will start surfacing real patterns in your behavior here.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Weekly Goals" />
            <CardBody className="space-y-4">
              {data?.weeklyGoals?.map((g) => (
                <div key={g.id}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-ink-600 dark:text-ink-300">{g.label}</span>
                    <span className="font-medium text-ink-400">{g.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                    <div
                      className={`h-full rounded-full ${g.progress >= 100 ? 'bg-profit-500' : 'bg-accent-500'}`}
                      style={{ width: `${g.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
