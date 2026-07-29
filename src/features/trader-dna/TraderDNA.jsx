import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { Trophy, TrendingDown, Flame, Target, Gem, ShieldAlert } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import { traderDNA } from '../../lib/mockData';

const identity = [
  { icon: Trophy, label: 'Best Session', value: traderDNA.bestSession, tone: 'profit' },
  { icon: TrendingDown, label: 'Worst Session', value: traderDNA.worstSession, tone: 'loss' },
  { icon: Target, label: 'Best Strategy', value: traderDNA.bestStrategy, tone: 'profit' },
  { icon: ShieldAlert, label: 'Worst Habit', value: traderDNA.worstHabit, tone: 'loss' },
  { icon: Flame, label: 'Emotional Trigger', value: traderDNA.emotionalTrigger, tone: 'loss' },
  { icon: Gem, label: 'Most Profitable Setup', value: traderDNA.mostProfitableSetup, tone: 'profit' },
  { icon: Trophy, label: 'Strongest Market', value: traderDNA.strongestMarket, tone: 'profit' },
  { icon: TrendingDown, label: 'Weakest Market', value: traderDNA.weakestMarket, tone: 'loss' },
];

export default function TraderDNA() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Premium · Intelligence Engine"
        title="Trader DNA"
        description="A living profile of your patience, discipline, execution, and psychology — scored from your actual behavior."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Behavioral Scorecard" subtitle="0–100, higher is better" />
          <CardBody>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={traderDNA.scores} outerRadius="75%">
                  <PolarGrid stroke="#e6e9ef" />
                  <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: '#585f70' }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10, fill: '#a3aabb' }} />
                  <Radar dataKey="value" stroke="#4a5df0" fill="#4a5df0" fillOpacity={0.25} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Score Breakdown" />
          <CardBody className="space-y-4">
            {traderDNA.scores.map((s) => (
              <div key={s.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-ink-600 dark:text-ink-300">{s.label}</span>
                  <span className="font-medium text-ink-400">{s.value}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div className="h-full rounded-full bg-accent-500" style={{ width: `${s.value}%` }} />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {identity.map((item) => (
          <Card key={item.label} className="p-5">
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${item.tone === 'profit' ? 'bg-profit-50 dark:bg-profit-500/10' : 'bg-loss-50 dark:bg-loss-500/10'}`}>
              <item.icon className={`h-4 w-4 ${item.tone === 'profit' ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500'}`} strokeWidth={1.75} />
            </div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{item.label}</p>
            <p className="mt-1 text-sm font-semibold text-ink-900 dark:text-ink-50">{item.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
