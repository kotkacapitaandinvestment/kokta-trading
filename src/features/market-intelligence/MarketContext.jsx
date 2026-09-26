import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, CalendarDays, ExternalLink } from 'lucide-react';
import { api } from '../../lib/api';
import { txt } from './research/primitives';

const REGIME_TONE = {
  Normal: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  Elevated: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  High: 'bg-loss-50 text-loss-600 dark:bg-loss-500/10 dark:text-loss-400',
};

const UNAVAILABLE = {
  not_configured: 'Price data is not connected',
  rate_limited: 'Loading, check back in a minute',
  fetch_failed: 'Provider did not respond',
  insufficient_history: 'Not enough history',
};

const fmtPrice = (v, decimals) => (v == null ? '' : Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals + 1 }));

// 30 daily closes as a single thin line. Neutral ink: the change figure next
// to it carries the direction, so the line doesn't need to repeat it in colour.
function Sparkline({ closes, label }) {
  if (!closes?.length) return null;
  const w = 120;
  const h = 32;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const pts = closes.map((c, i) => `${((i / (closes.length - 1)) * w).toFixed(1)},${(h - 2 - ((c - min) / span) * (h - 4)).toFixed(1)}`).join(' ');
  const last = pts.split(' ').pop().split(',');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
      <title>{label}</title>
      <polyline points={pts} fill="none" className="stroke-ink-400 dark:stroke-ink-500" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" className="fill-ink-900 dark:fill-ink-50" />
    </svg>
  );
}

function PulseTile({ item, onSelect }) {
  const interactive = !!item.research && !!onSelect;
  const Comp = interactive ? 'button' : 'div';
  const up = item.changePct > 0;
  return (
    <Comp
      type={interactive ? 'button' : undefined}
      onClick={interactive ? () => onSelect(item.research) : undefined}
      className={clsx(
        'group flex min-w-0 flex-col rounded-xl border border-ink-100 bg-white p-3.5 text-left dark:border-ink-800 dark:bg-ink-900',
        interactive && 'transition-colors hover:border-accent-300 active:scale-[0.99] dark:hover:border-accent-700',
      )}
      title={interactive ? `Open fundamental research for ${item.symbol}` : undefined}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-ink-900 dark:text-ink-50">{item.symbol}</span>
        <span className="text-[10px] uppercase tracking-wide text-ink-400">{item.market}</span>
      </div>
      {item.available ? (
        <>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-base font-semibold tabular-nums text-ink-900 dark:text-ink-50">{fmtPrice(item.close, item.decimals)}</span>
            <span className={clsx('flex items-center gap-0.5 font-mono text-xs font-medium tabular-nums', up ? 'text-profit-600 dark:text-profit-400' : item.changePct < 0 ? 'text-loss-500' : 'text-ink-400')}>
              {up ? <ArrowUpRight className="h-3 w-3" /> : item.changePct < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
              {up ? '+' : ''}
              {item.changePct}%
            </span>
          </div>
          <div className="mt-2">
            <Sparkline closes={item.closes} label={`${item.symbol}: last 30 daily closes, ${fmtPrice(item.closes[0], item.decimals)} to ${fmtPrice(item.close, item.decimals)}`} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-500 dark:text-ink-400">
            <span className="tabular-nums">ATR 14d {item.atrPct}%</span>
            <span className={clsx('rounded-full px-1.5 py-0.5 text-[10px] font-medium', REGIME_TONE[item.regime])}>{item.regime}</span>
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs text-ink-400">{UNAVAILABLE[item.reason] ?? 'Unavailable'}</p>
      )}
    </Comp>
  );
}

export function MarketPulse({ onSelect }) {
  const [pulse, setPulse] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/market/pulse').then(setPulse).catch((err) => setError(err.message));
  }, []);

  const closeDate = pulse?.instruments?.find((i) => i.available)?.closeDate;

  return (
    <section aria-labelledby="pulse-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="pulse-title" className="text-sm font-semibold text-ink-900 dark:text-ink-50">Market pulse</h2>
        <p className="text-[11px] text-ink-400">
          {closeDate
            ? `Daily closes as of ${new Date(`${closeDate}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })} · end-of-day data from Massive, not live quotes`
            : 'End-of-day data from Massive, not live quotes'}
        </p>
      </div>
      {error ? <p className="text-sm text-loss-500">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {pulse
          ? pulse.instruments.map((item) => <PulseTile key={item.symbol} item={item} onSelect={onSelect} />)
          : Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[9.5rem] animate-pulse rounded-xl bg-white dark:bg-ink-900" />)}
      </div>
    </section>
  );
}

function dayKey(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function ReleaseCalendar({ days = 14 }) {
  const [cal, setCal] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/market/calendar?days=${days}`).then(setCal).catch((err) => setError(err.message));
  }, [days]);

  const groups = [];
  for (const e of cal?.events ?? []) {
    const key = dayKey(e.date);
    if (groups.at(-1)?.key !== key) groups.push({ key, items: [] });
    groups.at(-1).items.push(e);
  }
  const failed = cal?.sources?.filter((s) => !s.ok) ?? [];

  return (
    <section aria-labelledby="calendar-title" className="flex min-h-0 flex-col rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-baseline justify-between gap-3 border-b border-ink-100 px-4 py-3 dark:border-ink-800">
        <h2 id="calendar-title" className="flex items-center gap-1.5 text-sm font-semibold text-ink-900 dark:text-ink-50">
          <CalendarDays className="h-4 w-4 text-accent-600 dark:text-accent-400" strokeWidth={1.75} />
          Official releases, next {days} days
        </h2>
        <span className="text-[11px] text-ink-400">Your local time</span>
      </div>

      <div className="max-h-[15.5rem] flex-1 overflow-y-auto scrollbar-thin px-4">
        {error ? <p className="py-6 text-sm text-loss-500">{error}</p> : null}
        {!cal && !error ? (
          <div className="space-y-2 py-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-ink-50 dark:bg-ink-800" />)}
          </div>
        ) : null}
        {cal && !cal.events.length ? <p className="py-8 text-center text-sm text-ink-400">No scheduled releases from the covered calendars in this window.</p> : null}
        {groups.map((g) => (
          <div key={g.key} className="border-b border-ink-100 py-3 last:border-0 dark:border-ink-800">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{g.key}</p>
            <ul className="space-y-2.5">
              {g.items.map((e, i) => (
                <li key={`${e.title}-${i}`} className="grid grid-cols-[4.5rem_2.75rem_1fr] items-start gap-2 text-sm">
                  <span className="whitespace-nowrap pt-0.5 font-mono text-[11px] tabular-nums text-ink-500 dark:text-ink-400">
                    {e.dateOnly ? 'TBA' : new Date(e.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="mt-0.5 w-fit rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-700 dark:bg-ink-800 dark:text-ink-200">{e.currency}</span>
                  <span className="min-w-0">
                    <span className="flex items-start gap-1.5">
                      {e.importance === 'High' ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" title="High importance" aria-label="High importance" /> : null}
                      <span className="leading-snug text-ink-800 dark:text-ink-100">{txt(e.title)}</span>
                    </span>
                    <a href={e.source.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-ink-400 hover:text-accent-600 dark:hover:text-accent-400">
                      {txt(e.source.name.split(/ [—-] /)[0])}
                      {e.referencePeriod ? ` · ${e.referencePeriod}` : ''}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="border-t border-ink-100 px-4 py-2.5 text-[11px] leading-relaxed text-ink-400 dark:border-ink-800">
        From the publishers' own calendars: Federal Reserve, BLS and BEA for USD; ECB and Eurostat for EUR. Other currencies are not covered yet. A gold dot marks a high-importance release.
        {failed.length ? ` Unavailable right now: ${failed.map((s) => s.key.toUpperCase()).join(', ')}.` : ''}
      </p>
    </section>
  );
}
