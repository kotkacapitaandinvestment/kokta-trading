import { useEffect, useState } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { Trophy, TrendingDown, Flame, Target, Gem, ShieldAlert } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import { Dna } from 'lucide-react';
import { api } from '../../lib/api';

const identityMeta = [
  { key: 'bestSession', icon: Trophy, label: 'Best Session', tone: 'profit' },
  { key: 'worstSession', icon: TrendingDown, label: 'Worst Session', tone: 'loss' },
  { key: 'bestStrategy', icon: Target, label: 'Best Strategy', tone: 'profit' },
  { key: 'worstHabit', icon: ShieldAlert, label: 'Recent Mistake Pattern', tone: 'loss' },
  { key: 'emotionalTrigger', icon: Flame, label: 'Emotional Trigger', tone: 'loss' },
  { key: 'mostProfitableSetup', icon: Gem, label: 'Most Profitable Setup', tone: 'profit' },
  { key: 'strongestMarket', icon: Trophy, label: 'Strongest Market', tone: 'profit' },
  { key: 'weakestMarket', icon: TrendingDown, label: 'Weakest Market', tone: 'loss' },
];

export default function TraderDNA() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/me/dna').then(setData);
  }, []);

  if (!data) return null;

  if (!data.hasData) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Premium · Intelligence Engine"
          title="Trader DNA"
          description="A living profile of your patience, discipline, execution, and psychology — scored from your actual behavior."
        />
        <EmptyState
          icon={Dna}
          title="No journal data yet"
          description="Log a few trades in your Journal and Trader DNA will start scoring your real behavior — patience, discipline, execution, and more."
        />
      </div>
    );
  }

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
                <RadarChart data={data.scores} outerRadius="75%">
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
            {data.scores.map((s) => (
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
        {identityMeta.map((item) => {
          const value = data.identity?.[item.key];
          return (
            <Card key={item.key} className="p-5">
              <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${item.tone === 'profit' ? 'bg-profit-50 dark:bg-profit-500/10' : 'bg-loss-50 dark:bg-loss-500/10'}`}>
                <item.icon className={`h-4 w-4 ${item.tone === 'profit' ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500'}`} strokeWidth={1.75} />
              </div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{item.label}</p>
              <p className="mt-1 text-sm font-semibold text-ink-900 dark:text-ink-50">{value ?? 'Not enough data yet'}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
