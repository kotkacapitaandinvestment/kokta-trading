import { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { Sparkles, AlertTriangle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import StatTile from '../../components/ui/StatTile';
import Tabs from '../../components/ui/Tabs';
import Badge from '../../components/ui/Badge';
import PerformanceHeatmap from './widgets/PerformanceHeatmap';
import {
  equityCurve,
  strategyPerformance,
  sessionPerformance,
  emotionBreakdown,
  psychologyInsights,
} from '../../lib/mockData';

const pieColors = ['#4a5df0', '#10b981', '#f59e0b', '#ef4444', '#a3aabb'];
const ruleViolations = [
  { rule: 'Traded past daily loss limit', count: 2 },
  { rule: 'Entered without checklist complete', count: 5 },
  { rule: 'Moved stop loss further away', count: 1 },
  { rule: 'Sized up after a loss', count: 3 },
];

export default function Analytics() {
  const [range, setRange] = useState('30d');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Performance Analytics"
        description="The numbers behind your process — not just your P&L."
        actions={
          <Tabs
            tabs={[{ label: '7D', value: '7d' }, { label: '30D', value: '30d' }, { label: '90D', value: '90d' }]}
            active={range}
            onChange={setRange}
          />
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Win Rate" value="64%" delta="+4% vs prior" deltaTone="profit" />
        <StatTile label="Avg Risk/Reward" value="1.8R" delta="+0.2R vs prior" deltaTone="profit" />
        <StatTile label="Profit Factor" value="2.1" delta="-0.1 vs prior" deltaTone="loss" />
        <StatTile label="Expectancy" value="0.42R" delta="per trade" deltaTone="neutral" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Equity Curve" subtitle="Cumulative account growth" />
          <CardBody>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityCurve} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4a5df0" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#4a5df0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#e6e9ef" strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#a3aabb' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#a3aabb' }} domain={['dataMin - 200', 'dataMax + 200']} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e6e9ef', fontSize: 12 }} formatter={(v) => [`$${Math.round(v).toLocaleString()}`, 'Equity']} />
                  <Area type="monotone" dataKey="equity" stroke="#4a5df0" strokeWidth={2.5} fill="url(#equityFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Emotion Breakdown" subtitle="Pre-trade emotional state" />
          <CardBody>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={emotionBreakdown} dataKey="value" nameKey="emotion" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {emotionBreakdown.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e6e9ef', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1.5">
              {emotionBreakdown.map((e, i) => (
                <li key={e.emotion} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-ink-500 dark:text-ink-400">
                    <span className="h-2 w-2 rounded-full" style={{ background: pieColors[i % pieColors.length] }} />
                    {e.emotion}
                  </span>
                  <span className="font-medium text-ink-700 dark:text-ink-200">{e.value}%</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Strategy Analysis" subtitle="Win rate & expectancy by strategy" />
          <CardBody>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={strategyPerformance} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="#e6e9ef" strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#a3aabb' }} />
                  <YAxis type="category" dataKey="strategy" width={130} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#585f70' }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e6e9ef', fontSize: 12 }} formatter={(v) => [`${v}%`, 'Win rate']} />
                  <Bar dataKey="winRate" radius={[0, 6, 6, 0]} fill="#4a5df0" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Session Analysis" subtitle="Win rate by trading session" />
          <CardBody>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sessionPerformance} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e6e9ef" strokeDasharray="3 3" />
                  <XAxis dataKey="session" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#a3aabb' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#a3aabb' }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e6e9ef', fontSize: 12 }} formatter={(v) => [`${v}%`, 'Win rate']} />
                  <Bar dataKey="winRate" radius={[6, 6, 0, 0]} fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Performance Heatmap" subtitle="Daily P&L, last 5 weeks" />
          <CardBody>
            <PerformanceHeatmap />
            <div className="mt-3 flex items-center gap-3 text-xs text-ink-400">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-loss-500" /> Loss</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-ink-100 dark:bg-ink-800" /> Flat</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-profit-500" /> Profit</span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Rule Violations" subtitle="Mistake frequency" action={<AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />} />
          <CardBody className="space-y-3">
            {ruleViolations.map((r) => (
              <div key={r.rule} className="flex items-center justify-between text-sm">
                <span className="text-ink-600 dark:text-ink-300">{r.rule}</span>
                <Badge tone={r.count > 3 ? 'loss' : 'warning'}>{r.count}×</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Kotka AI Insights" action={<Sparkles className="mt-0.5 h-4 w-4 text-accent-500" />} />
        <CardBody className="space-y-3">
          {psychologyInsights.map((p, i) => (
            <p key={i} className="rounded-xl bg-ink-50 p-3 text-sm text-ink-600 dark:bg-ink-800 dark:text-ink-300">
              {p}
            </p>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
