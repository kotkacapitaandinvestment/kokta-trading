import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { api } from '../../lib/api';
import Badge from '../../components/ui/Badge';
import { periodWord, unitWord, whenItResets } from '../../lib/usage';

const PERIODS = ['day', 'week', 'month'];

function Bar({ used, limit }) {
  const pct = limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800" aria-hidden>
      <div className={clsx('h-full rounded-full', used >= limit ? 'bg-loss-500' : pct >= 80 ? 'bg-amber-500' : 'bg-accent-500')} style={{ width: `${pct}%` }} />
    </div>
  );
}

function PeriodRow({ usage, period, label }) {
  const p = usage.periods[period];
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-x-4 gap-y-1 sm:grid-cols-[6.5rem_1fr_auto]">
      <span className="text-xs text-ink-500 dark:text-ink-400">{label ?? periodWord(period).replace(/^./, (c) => c.toUpperCase())}</span>
      <Bar used={p.used} limit={p.limit} />
      <span className="col-start-2 text-xs tabular-nums text-ink-500 dark:text-ink-400 sm:col-start-auto">
        {p.used} of {p.limit} · resets {whenItResets(p.resetAt)}
      </span>
    </div>
  );
}

// What each metered feature has used and has left. Kotka is free; limits
// keep outside data and AI fair for everyone. The server counts; this shows.
export default function UsageSettings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/usage').then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-loss-500">{error}</p>;
  if (!data) return <div className="h-48 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" />;
  const dayReset = new Date(data.periods.day.resetAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">Usage</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
        Kotka is free. Features that draw on AI or outside data have limits so everyone gets a fair share. Daily limits reset at {dayReset} your time, weekly ones on Monday and monthly ones on the 1st.
      </p>
      <div className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-100 dark:divide-ink-800 dark:border-ink-800">
        {data.features.map((u) => {
          const limited = PERIODS.filter((p) => u.periods[p].limit !== null);
          return (
            <div key={u.feature} className="space-y-3 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{u.label}</p>
                {u.paused ? (
                  <Badge tone="neutral">Temporarily unavailable</Badge>
                ) : u.status === 'reached' ? (
                  <Badge tone="loss">Limit reached</Badge>
                ) : u.status === 'warning' ? (
                  <Badge tone="warning">Nearly used</Badge>
                ) : null}
              </div>
              {u.exempt ? (
                <p className="text-xs text-ink-500 dark:text-ink-400">Staff accounts aren’t limited. Used today: {u.periods.day.used}.</p>
              ) : limited.length ? (
                <div className="space-y-2">
                  {limited.map((p) => (
                    <PeriodRow key={p} usage={u} period={p} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  No limit right now. {u.periods.day.used} {unitWord(u, u.periods.day.used)} today, {u.periods.month.used} this month.
                </p>
              )}
              {u.actions.map((a) => (
                <div key={a.action} className="space-y-2 border-t border-ink-100 pt-3 dark:border-ink-800">
                  <p className="text-xs font-medium text-ink-600 dark:text-ink-300">{a.label}</p>
                  {PERIODS.filter((p) => a.periods[p].limit !== null).map((p) => (
                    <PeriodRow key={p} usage={{ periods: a.periods }} period={p} />
                  ))}
                </div>
              ))}
              {u.source === 'override' && u.overrideExpiresAt ? <p className="text-xs text-ink-400">Your limits here are set for you until {new Date(u.overrideExpiresAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}.</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
