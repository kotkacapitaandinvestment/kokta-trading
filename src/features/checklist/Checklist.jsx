import { Link } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle, Sparkles, RotateCcw } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Hint from '../../components/ui/Hint';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import ProgressRing from '../../components/ui/ProgressRing';
import { api } from '../../lib/api';
import { toast } from '../../lib/dialogs';
import { localDay } from '../../lib/day';
import { CHART_COLORS } from '../../lib/chartColors';
import { CHECKLIST_ITEMS as items } from './items';

export default function Checklist() {
  // null until today's ticks have loaded. Items can't be ticked before then:
  // a save sends the whole day, so ticking early would wipe earlier ticks.
  const [checked, setChecked] = useState(null);
  const date = localDay();
  const saves = useRef(Promise.resolve());

  const load = useCallback(() => api.get(`/checklist/${date}`).then(({ items }) => setChecked(items)).catch(() => {
    setChecked((c) => c ?? {});
    toast('Today’s checklist couldn’t be loaded. Check your connection and refresh.', { tone: 'error' });
  }), [date]);
  useEffect(() => { load(); }, [load]);

  // One save at a time, in order, so the last tick is the one that sticks.
  const persist = (next) => {
    setChecked(next);
    saves.current = saves.current.then(() => api.put(`/checklist/${date}`, { items: next })).catch(() => {
      toast('That change wasn’t saved. Check your connection and try again.', { tone: 'error' });
      return load();
    });
  };

  const loading = checked === null;
  const completedCount = items.filter((i) => checked?.[i.id]).length;
  const baseScore = Math.round((completedCount / items.length) * 100);
  const aiApproved = completedCount === items.length;

  const readiness = useMemo(() => {
    if (baseScore >= 100) return { label: 'Ready to trade', tone: 'text-profit-600 dark:text-profit-400' };
    if (baseScore >= 60) return { label: 'Proceed with caution', tone: 'text-amber-600 dark:text-amber-400' };
    return { label: 'Not ready', tone: 'text-loss-500' };
  }, [baseScore]);

  const toggle = (id) => !loading && persist({ ...checked, [id]: !checked[id] });
  const reset = () => persist({});

  return (
    <div>
      <PageHeader
        eyebrow="Discipline"
        title="Pre-Trade Checklist"
        description="Complete every item before opening a position. This is the gate between impulse and execution."
        actions={
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={reset} disabled={loading}>
            Reset for new trade
          </Button>
        }
      />

      <Hint id="checklist-journal" className="mb-4 max-w-2xl">Reset for each new trade. When you log it in the journal, tick "Pre-trade checklist was completed". That tick is what your discipline score counts.</Hint>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2" aria-busy={loading}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="checkbox"
              aria-checked={!!checked?.[item.id]}
              disabled={loading}
              onClick={() => toggle(item.id)}
              className="flex w-full items-start gap-3 rounded-2xl border border-ink-100 bg-white p-4 text-left transition-colors hover:border-ink-200 disabled:cursor-wait disabled:opacity-60 dark:border-ink-800 dark:bg-ink-900 dark:hover:border-ink-700"
            >
              {checked?.[item.id] ? (
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
              <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{aiApproved ? 'Checklist complete' : 'Before you trade'}</p>
              <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                {aiApproved ? (
                  <>
                    Every condition is met. The checklist is your process, not a signal, so the decision is still yours.{' '}
                    <Link to="/app/ai" className="font-medium text-accent-600 hover:underline dark:text-accent-400">Pressure-test the idea with Kotka AI</Link>
                  </>
                ) : (
                  'Complete every item above. Skipped items are how most losing trades start.'
                )}
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
                color={baseScore >= 100 ? CHART_COLORS.profit : baseScore >= 60 ? '#f59e0b' : CHART_COLORS.loss}
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
