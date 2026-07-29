import { useMemo } from 'react';
import { CheckCircle2, Circle, Sparkles, RotateCcw } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import ProgressRing from '../../components/ui/ProgressRing';
import { usePersistedState } from '../../lib/usePersistedState';

const items = [
  { id: 'trend', label: 'Trend confirmed?', hint: 'Higher timeframe bias matches your intended direction.' },
  { id: 'liquidity', label: 'Liquidity identified?', hint: 'You know which resting liquidity this trade is targeting or reacting to.' },
  { id: 'entry', label: 'Entry model valid?', hint: 'The setup matches a defined, backtested entry model — not improvisation.' },
  { id: 'risk', label: 'Risk acceptable?', hint: 'Position risk is within your per-trade risk policy.' },
  { id: 'dailyLimit', label: 'Daily loss limit respected?', hint: "Taking this trade won't breach today's max drawdown." },
  { id: 'emotional', label: 'Emotional state stable?', hint: 'No revenge trading, fatigue, or overconfidence driving this decision.' },
  { id: 'news', label: 'News checked?', hint: 'No high-impact release imminent that invalidates the setup.' },
  { id: 'sizing', label: 'Position size calculated?', hint: 'Lot size derived from stop distance and account risk, not guesswork.' },
];

const todayKey = () => `checklist.${new Date().toISOString().slice(0, 10)}`;

export default function Checklist() {
  const [checked, setChecked] = usePersistedState(todayKey(), {});

  const completedCount = items.filter((i) => checked[i.id]).length;
  const baseScore = Math.round((completedCount / items.length) * 100);
  const aiApproved = completedCount === items.length;

  const readiness = useMemo(() => {
    if (baseScore >= 100) return { label: 'Ready to trade', tone: 'text-profit-600 dark:text-profit-400' };
    if (baseScore >= 60) return { label: 'Proceed with caution', tone: 'text-amber-600 dark:text-amber-400' };
    return { label: 'Not ready', tone: 'text-loss-500' };
  }, [baseScore]);

  const toggle = (id) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const reset = () => setChecked({});

  return (
    <div>
      <PageHeader
        eyebrow="Discipline"
        title="Pre-Trade Checklist"
        description="Complete every item before opening a position. This is the gate between impulse and execution."
        actions={
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={reset}>
            Reset for new trade
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              className="flex w-full items-start gap-3 rounded-2xl border border-ink-100 bg-white p-4 text-left transition-colors hover:border-ink-200 dark:border-ink-800 dark:bg-ink-900 dark:hover:border-ink-700"
            >
              {checked[item.id] ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-profit-500" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-ink-300" />
              )}
              <div>
                <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{item.label}</p>
                <p className="mt-0.5 text-xs text-ink-400">{item.hint}</p>
              </div>
            </button>
          ))}

          <div className={`flex items-start gap-3 rounded-2xl border p-4 ${aiApproved ? 'border-accent-200 bg-accent-50/60 dark:border-accent-900/40 dark:bg-accent-900/10' : 'border-dashed border-ink-200 dark:border-ink-700'}`}>
            <Sparkles className={`mt-0.5 h-5 w-5 shrink-0 ${aiApproved ? 'text-accent-500' : 'text-ink-300'}`} />
            <div>
              <p className="text-sm font-medium text-ink-800 dark:text-ink-100">Kotka AI approval</p>
              <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                {aiApproved
                  ? 'All conditions met. Kotka AI has no objection to this trade — the discipline is on you now.'
                  : 'Complete every item above to request Kotka AI\'s final review.'}
              </p>
            </div>
          </div>
        </div>

        <div>
          <Card className="sticky top-6 p-6 text-center">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-400">Readiness Score</p>
            <div className="flex justify-center">
              <ProgressRing
                value={baseScore}
                size={140}
                strokeWidth={10}
                label={`${baseScore}%`}
                color={baseScore >= 100 ? '#10b981' : baseScore >= 60 ? '#f59e0b' : '#ef4444'}
              />
            </div>
            <p className={`mt-4 text-sm font-semibold ${readiness.tone}`}>{readiness.label}</p>
            <p className="mt-1 text-xs text-ink-400">{completedCount} of {items.length} conditions met</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
