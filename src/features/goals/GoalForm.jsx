import { useState } from 'react';
import clsx from 'clsx';
import { Lock } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { addDaysLocal } from './dates';

// Starting points. Process goals first: Kotka rewards discipline, not size.
export const TEMPLATES = [
  { metric: 'checkins', title: 'Check in on 20 trading days', target: 20, periodDays: 30, blurb: 'Show up every trading day.' },
  { metric: 'disciplined_days', title: '15 days on plan and within risk', target: 15, periodDays: 30, blurb: 'Days you followed your plan, respected risk and avoided revenge trades.' },
  { metric: 'streak', title: 'A 14-day check-in streak', target: 14, periodDays: 30, blurb: 'Two weeks without missing a trading day.' },
  { metric: 'learning', title: '20 learning activities', target: 20, periodDays: 30, blurb: 'Courses, reading, research reviews.' },
  { metric: 'backtests', title: '10 backtesting sessions', target: 10, periodDays: 30, blurb: 'Test the setup before you trade it.' },
  { metric: 'journal_trades', title: 'Journal 20 trades', target: 20, periodDays: 30, blurb: 'Every trade written up in your Kotka journal.' },
  { metric: 'net_profit', title: 'Monthly profit goal', target: 500, periodDays: 30, blurb: 'Private by default. Tracked from your journal.' },
];

export default function GoalForm({ metrics, periods, today, currency = 'USD', initial, onSave, onClose }) {
  const [form, setForm] = useState(() => initial ?? { ...TEMPLATES[0], why: '', start: today });
  const [state, setState] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const isProfit = form.metric === 'net_profit';

  const save = async (lock) => {
    setState({ busy: lock ? 'lock' : 'draft' });
    try {
      await onSave({ metric: form.metric, title: form.title, target: Number(form.target), periodDays: Number(form.periodDays), startDate: form.start, why: form.why }, { lock });
    } catch (err) {
      setState({ error: err.message });
    }
  };

  const input = 'h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-accent-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50';
  return (
    <Modal open onClose={onClose} title={initial?.id ? 'Edit goal' : 'New goal'} width="max-w-2xl">
      <div className="space-y-5">
        {!initial?.id ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Start from</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <button key={t.metric} type="button" onClick={() => setForm((f) => ({ ...f, ...t }))} aria-pressed={form.metric === t.metric} className={clsx('rounded-xl border px-3 py-2.5 text-left transition-colors', form.metric === t.metric ? 'border-accent-500 bg-accent-500/10' : 'border-ink-200 hover:border-ink-300 dark:border-ink-700')}>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-ink-900 dark:text-ink-50">{metrics.find((m) => m.id === t.metric)?.label}{t.metric === 'net_profit' ? <Lock className="h-3 w-3 text-ink-400" /> : null}</span>
                  <span className="text-xs text-ink-500 dark:text-ink-400">{t.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Name</span>
            <input value={form.title} onChange={set('title')} maxLength={80} className={input} />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Target {isProfit ? `(${currency})` : `(${metrics.find((m) => m.id === form.metric)?.unit})`}</span>
            <input type="number" min="1" step={isProfit ? 'any' : '1'} value={form.target} onChange={set('target')} className={input} />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Period</span>
            <select value={form.periodDays} onChange={set('periodDays')} className={input}>
              {periods.map((p) => <option key={p} value={p}>{p} days</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Starts</span>
            <select value={form.start} onChange={set('start')} className={input}>
              {Array.from({ length: 8 }, (_, i) => addDaysLocal(today, i)).map((d, i) => <option key={d} value={d}>{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</option>)}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Why this goal? <span className="font-normal text-ink-400">(private)</span></span>
            <input value={form.why ?? ''} onChange={set('why')} maxLength={300} placeholder="e.g. I skip my process on Fridays" className={input} />
          </label>
        </div>

        {isProfit ? (
          <p className="rounded-xl bg-ink-50 p-3 text-xs leading-relaxed text-ink-600 dark:bg-ink-800 dark:text-ink-300">
            Profit goals are tracked from your journal and stay private. Share cards call this a {Number(form.periodDays) === 7 ? 'Weekly' : Number(form.periodDays) >= 28 && Number(form.periodDays) <= 31 ? 'Monthly' : `${form.periodDays}-Day`} Profit Goal and never show amounts unless you choose to. A discipline goal alongside it usually helps more.
          </p>
        ) : null}

        <div className="rounded-xl border border-ink-100 p-3 text-xs leading-relaxed text-ink-500 dark:border-ink-800 dark:text-ink-400">
          <span className="font-semibold text-ink-700 dark:text-ink-200">Locking</span> commits you: once locked, the target and period can’t change. Drafts can be edited until you lock them.
        </div>

        {state?.error ? <p role="alert" className="text-sm text-loss-500">{state.error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={() => save(false)} disabled={!!state?.busy}>{state?.busy === 'draft' ? 'Saving…' : 'Save as draft'}</Button>
          {!initial?.id || initial.status === 'draft' ? <Button icon={Lock} onClick={() => save(true)} disabled={!!state?.busy}>{state?.busy === 'lock' ? 'Locking…' : 'Save and lock'}</Button> : null}
        </div>
      </div>
    </Modal>
  );
}
