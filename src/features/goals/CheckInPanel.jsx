import { useState } from 'react';
import clsx from 'clsx';
import { Check, Flame, Minus, Pencil, Plus, Share2, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import { addDaysLocal, dayLetter } from './dates';

function YesNo({ value, onChange, label }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-ink-700 dark:text-ink-200">{label}</span>
      <div className="flex shrink-0 gap-1 rounded-lg bg-ink-50 p-0.5 dark:bg-ink-800" role="group" aria-label={label}>
        {[
          [true, 'Yes'],
          [false, 'No'],
        ].map(([v, l]) => (
          <button key={l} type="button" onClick={() => onChange(v)} aria-pressed={value === v} className={clsx('h-8 rounded-md px-3 text-xs font-semibold transition-colors', value === v ? (v ? 'bg-ink-900 text-white dark:bg-accent-500 dark:text-ink-950' : 'bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-ink-50') : 'text-ink-500 dark:text-ink-400')}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper({ value, onChange, label, hint }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0 text-sm text-ink-700 dark:text-ink-200">
        {label}
        {hint ? <span className="block text-[11px] text-ink-400">{hint}</span> : null}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 text-ink-500 dark:border-ink-700" aria-label={`Fewer ${label.toLowerCase()}`}><Minus className="h-3.5 w-3.5" /></button>
        <span className="w-7 text-center font-mono text-sm tabular-nums text-ink-900 dark:text-ink-50">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(10, value + 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 text-ink-500 dark:border-ink-700" aria-label={`More ${label.toLowerCase()}`}><Plus className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

// Last three weeks at a glance: gold = disciplined, bronze = checked in,
// empty = missed trading day, faint = weekend.
export function CheckInStrip({ recent, today }) {
  const by = new Map((recent ?? []).map((c) => [c.date, c]));
  const days = Array.from({ length: 21 }, (_, i) => addDaysLocal(today, i - 20));
  return (
    <div>
      <div className="grid grid-cols-[repeat(21,minmax(0,1fr))] gap-1" role="img" aria-label="Check-ins over the last 21 days">
        {days.map((d) => {
          const c = by.get(d);
          const weekend = [0, 6].includes(new Date(`${d}T12:00:00`).getDay());
          const disciplined = c && (!c.traded || (c.planFollowed && c.riskRespected && c.noRevengeTrading));
          return <span key={d} title={`${d}${c ? (disciplined ? ': checked in, plan kept' : ': checked in') : weekend ? ': weekend' : ': no check-in'}`} className={clsx('aspect-square rounded-[4px]', c ? (disciplined ? 'bg-accent-500' : 'bg-accent-800/70 dark:bg-accent-700/70') : weekend ? 'bg-ink-50 dark:bg-ink-800/40' : 'border border-ink-200 dark:border-ink-700', d === today && 'ring-2 ring-ink-900/70 ring-offset-1 dark:ring-white/70 dark:ring-offset-ink-900')} />;
        })}
      </div>
      <div className="mt-1 grid grid-cols-[repeat(21,minmax(0,1fr))] gap-1 text-center font-mono text-[9px] text-ink-400">
        {days.map((d) => <span key={d}>{dayLetter(d)}</span>)}
      </div>
    </div>
  );
}

const blank = { traded: null, planFollowed: null, riskRespected: null, noRevengeTrading: null, learning: 0, backtests: 0, note: '' };

export default function CheckInPanel({ today, checkin, stats, recent, onSubmit, onShare }) {
  const [editing, setEditing] = useState(!checkin);
  const [form, setForm] = useState(() => (checkin ? { ...blank, ...checkin, note: checkin.note ?? '' } : blank));
  const [state, setState] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const complete = form.traded === false || (form.traded === true && [form.planFollowed, form.riskRespected, form.noRevengeTrading].every((v) => v !== null));

  const submit = async () => {
    setState({ busy: true });
    try {
      await onSubmit({ ...form, date: today });
      setEditing(false);
      setState(null);
    } catch (err) {
      setState({ error: err.message });
    }
  };

  const done = checkin && !editing;
  const disciplined = checkin && (!checkin.traded || (checkin.planFollowed && checkin.riskRespected && checkin.noRevengeTrading));

  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{done ? 'Checked in today' : 'Today’s check-in'}</h2>
          <p className="mt-0.5 text-xs text-ink-400">{done ? `Day ${stats.currentStreak} of your streak.` : 'Two minutes, every trading day. Answer honestly: the streak only means something if it’s real.'}</p>
        </div>
        {stats.currentStreak ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-2.5 py-1 text-xs font-semibold text-accent-800 dark:text-accent-300"><Flame className="h-3.5 w-3.5" /> {stats.currentStreak}-day streak</span>
        ) : null}
      </div>

      {done ? (
        <div className="mt-4 space-y-4">
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {(checkin.traded
              ? [['Followed my plan', checkin.planFollowed], ['Respected my risk rules', checkin.riskRespected], ['Avoided revenge trading', checkin.noRevengeTrading]]
              : [['No trades today: stayed patient', true]]
            ).map(([l, ok]) => (
              <li key={l} className="flex items-center gap-2 text-ink-700 dark:text-ink-200">
                <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full', ok ? 'bg-accent-500 text-ink-950' : 'bg-ink-100 text-ink-400 dark:bg-ink-800')}>{ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}</span>
                {l}
              </li>
            ))}
            {checkin.learning ? <li className="text-ink-500 dark:text-ink-400">{checkin.learning} learning {checkin.learning === 1 ? 'activity' : 'activities'}</li> : null}
            {checkin.backtests ? <li className="text-ink-500 dark:text-ink-400">{checkin.backtests} backtesting {checkin.backtests === 1 ? 'session' : 'sessions'}</li> : null}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={Share2} onClick={() => onShare(checkin.id)}>{disciplined ? `Share day ${stats.currentStreak}` : 'Share today'}</Button>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 divide-y divide-ink-100 dark:divide-ink-800">
          <div className="flex flex-wrap items-center justify-between gap-3 py-2">
            <span className="text-sm font-medium text-ink-800 dark:text-ink-100">Did you trade today?</span>
            <div className="flex gap-1.5">
              <Button size="sm" variant={form.traded === true ? 'primary' : 'secondary'} onClick={() => set('traded')(true)} aria-pressed={form.traded === true}>Yes</Button>
              <Button size="sm" variant={form.traded === false ? 'primary' : 'secondary'} onClick={() => setForm((f) => ({ ...f, traded: false, planFollowed: null, riskRespected: null, noRevengeTrading: null }))} aria-pressed={form.traded === false}>No, I stayed out</Button>
            </div>
          </div>
          {form.traded ? (
            <div>
              <YesNo label="I followed my trading plan" value={form.planFollowed} onChange={set('planFollowed')} />
              <YesNo label="I respected my risk rules" value={form.riskRespected} onChange={set('riskRespected')} />
              <YesNo label="I avoided revenge trading" value={form.noRevengeTrading} onChange={set('noRevengeTrading')} />
            </div>
          ) : null}
          <Stepper label="Learning activities" hint="Courses, reading, research reviews, a Kotka AI session" value={form.learning} onChange={set('learning')} />
          <Stepper label="Backtesting sessions" value={form.backtests} onChange={set('backtests')} />
          <div className="pt-3">
            <textarea value={form.note} onChange={(e) => set('note')(e.target.value)} rows={2} maxLength={500} placeholder="Note to yourself (private, optional)" className="w-full rounded-lg border border-ink-200 bg-white p-2.5 text-sm text-ink-900 outline-none focus:border-accent-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={submit} disabled={!complete || state?.busy}>{state?.busy ? 'Saving…' : checkin ? 'Update check-in' : 'Check in'}</Button>
              {checkin ? <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button> : null}
              {state?.error ? <span role="alert" className="text-xs text-loss-500">{state.error}</span> : null}
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-ink-100 pt-4 dark:border-ink-800">
        <CheckInStrip recent={recent} today={today} />
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-400">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent-500" /> Plan and risk kept</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent-800/70" /> Checked in</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-ink-300" /> Missed</span>
          <span>Weekends never break a streak.</span>
        </p>
      </div>
    </section>
  );
}
