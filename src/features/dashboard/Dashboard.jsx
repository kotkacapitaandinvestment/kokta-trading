import { Link } from 'react-router-dom';
import {
  Flame,
  ShieldAlert,
  NotebookPen,
  ListChecks,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Brain,
  Target,
  ChevronRight,
} from 'lucide-react';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ProgressRing from '../../components/ui/ProgressRing';
import { useAuth } from '../../context/AuthContext';
import WeeklyPerformanceChart from './widgets/WeeklyPerformanceChart';
import {
  watchlist,
  economicEvents,
  recentTrades,
  psychologyInsights,
  weeklyGoals,
  marketSentiment,
} from '../../lib/mockData';

const disciplineScore = 84;
const riskUsed = 0.6; // R used today
const riskLimit = 2; // R daily limit
const currentStreak = 5;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0] ?? 'Trader';

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
          <ProgressRing value={disciplineScore} size={64} strokeWidth={6} label={disciplineScore} color="#4a5df0" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Discipline Score</p>
            <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-300">Trending up this week</p>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-400">Today's Risk Limit</span>
            <ShieldAlert className="h-4 w-4 text-ink-300" strokeWidth={1.75} />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-semibold text-ink-900 dark:text-ink-50">{riskUsed}R</span>
            <span className="text-sm text-ink-400">/ {riskLimit}R used</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
            <div
              className="h-full rounded-full bg-accent-500"
              style={{ width: `${Math.min((riskUsed / riskLimit) * 100, 100)}%` }}
            />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-400">Current Streak</span>
            <Flame className="h-4 w-4 text-amber-500" strokeWidth={1.75} />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-semibold text-ink-900 dark:text-ink-50">{currentStreak}</span>
            <span className="text-sm text-ink-400">days of rule-following</span>
          </div>
          <p className="mt-3 text-xs text-ink-400">Best this quarter: 11 days</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-400">Open Positions</span>
            <Target className="h-4 w-4 text-ink-300" strokeWidth={1.75} />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-semibold text-ink-900 dark:text-ink-50">2</span>
            <span className="text-sm text-ink-400">across Forex, Indices</span>
          </div>
          <div className="mt-3 flex -space-x-1">
            <Badge tone="profit">EUR/USD +0.8R</Badge>
            <Badge tone="loss">US30 -0.3R</Badge>
          </div>
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
              <WeeklyPerformanceChart />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Kotka AI Briefing"
              subtitle="Generated 06:45 based on your open positions and market structure"
              action={<Sparkles className="mt-0.5 h-4 w-4 text-accent-500" />}
            />
            <CardBody className="space-y-3">
              <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                EUR/USD remains inside yesterday's range with no clear displacement — treat any entry as counter-trend
                until London liquidity is taken. Gold is approaching a daily order block; watch for reaction rather
                than anticipating a break. Your discipline score dipped slightly after Tuesday's early exit — review
                that trade before sizing up today.
              </p>
              <Button as={Link} to="/app/ai" variant="secondary" size="sm">
                Open full briefing
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent Trades" subtitle="Last 5 logged entries" />
            <CardBody className="overflow-x-auto">
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
                  {recentTrades.map((t) => (
                    <tr key={t.id} className="border-b border-ink-50 last:border-0 dark:border-ink-800/60">
                      <td className="py-2.5 font-medium text-ink-800 dark:text-ink-100">{t.symbol}</td>
                      <td className="py-2.5 text-ink-500 dark:text-ink-400">{t.direction}</td>
                      <td className="py-2.5 text-ink-500 dark:text-ink-400">{t.session}</td>
                      <td className="py-2.5 text-ink-500 dark:text-ink-400">{t.rr > 0 ? `${t.rr}R` : `${t.rr}R`}</td>
                      <td className="py-2.5 text-right font-medium">
                        <span className={t.pnl >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500'}>
                          {t.pnl >= 0 ? '+' : ''}${t.pnl}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Today's Checklist" subtitle="3 of 8 complete" />
            <CardBody>
              <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                <div className="h-full w-[38%] rounded-full bg-accent-500" />
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
                You have 1 trade from this morning that hasn't been journaled yet.
              </p>
              <Button as={Link} to="/app/journal" variant="secondary" size="sm" icon={NotebookPen} className="w-full">
                Log trade
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Watchlist" />
            <CardBody className="space-y-1">
              {watchlist.slice(0, 5).map((w) => (
                <div key={w.symbol} className="flex items-center justify-between py-1.5">
                  <div>
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{w.symbol}</p>
                    <p className="text-xs text-ink-400">{w.market}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{w.price}</p>
                    <p className={`flex items-center justify-end gap-0.5 text-xs font-medium ${w.change >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500'}`}>
                      {w.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(w.change)}%
                    </p>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Economic Events" subtitle="Today" />
            <CardBody className="space-y-3">
              {economicEvents.slice(0, 4).map((e) => (
                <div key={e.title} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{e.title}</p>
                    <p className="text-xs text-ink-400">
                      {e.time} · {e.currency}
                    </p>
                  </div>
                  <Badge tone={e.impact === 'high' ? 'loss' : 'warning'}>{e.impact}</Badge>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Market Sentiment" />
            <CardBody>
              <div className="mb-2 flex items-center justify-between text-xs text-ink-400">
                <span>Bearish</span>
                <span>Bullish</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gradient-to-r from-loss-400 via-ink-100 to-profit-500">
                <div
                  className="h-full w-0.5 bg-ink-900 dark:bg-white"
                  style={{ marginLeft: `${marketSentiment.overall}%` }}
                />
              </div>
              <p className="mt-2 text-center text-sm font-medium text-ink-700 dark:text-ink-200">
                {marketSentiment.overall}/100 · Moderately Bullish
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Psychology Insights" action={<Brain className="mt-0.5 h-4 w-4 text-accent-500" />} />
            <CardBody>
              <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">{psychologyInsights[0]}</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Weekly Goals" />
            <CardBody className="space-y-4">
              {weeklyGoals.map((g) => (
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
