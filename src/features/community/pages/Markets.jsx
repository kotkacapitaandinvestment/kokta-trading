import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { MessagesSquare, Star } from 'lucide-react';
import { api } from '../../../lib/api';
import { price, signedPct, tradingDay } from '../util';

export default function Markets() {
  const [data, setData] = useState(null);
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  useEffect(() => { api.get('/community/markets').then(setData).catch(() => setData({ groups: [], markets: [] })); }, []);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-900 dark:text-ink-50">Market rooms</h1>
          <p className="text-xs text-ink-500 dark:text-ink-400">Every market has its own room with a live chat. Prices are the latest daily close, not live. The mood bar shows traders’ views from the last 7 days.</p>
        </div>
        <button type="button" onClick={() => setOnlyFollowed((v) => !v)} aria-pressed={onlyFollowed} className={clsx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium', onlyFollowed ? 'bg-ink-900 text-white dark:bg-accent-500 dark:text-ink-950' : 'border border-ink-200 text-ink-600 dark:border-ink-700 dark:text-ink-300')}><Star className="h-3.5 w-3.5" /> Followed only</button>
      </div>
      {!data ? <div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-ink-900" /> : null}
      {data?.groups.map((g) => {
        const list = data.markets.filter((m) => m.market === g && (!onlyFollowed || m.followed));
        if (!list.length) return null;
        return (
          <section key={g}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{g}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((m) => {
                const s = m.sentiment;
                return (
                  <Link key={m.symbol} to={`/app/community/markets/${m.symbol}`} className="group rounded-2xl border border-ink-100 bg-white p-4 transition-colors hover:border-accent-300 dark:border-ink-800 dark:bg-ink-900 dark:hover:border-accent-700">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-1.5 font-mono text-base font-semibold text-ink-900 dark:text-ink-50">{m.display}{m.followed ? <Star className="h-3.5 w-3.5 fill-accent-500 text-accent-500" aria-label="Followed" /> : null}</p>
                        <p className="text-xs text-ink-400">{m.name}</p>
                      </div>
                      <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-medium', m.status.open ? 'bg-profit-50 text-profit-700 dark:bg-profit-500/10 dark:text-profit-400' : 'bg-ink-100 text-ink-500 dark:bg-ink-800')}>{m.status.open ? 'Open' : 'Closed'}</span>
                    </div>
                    {m.data.close != null ? (
                      <p className="mt-3 flex items-baseline gap-2">
                        <span className="font-mono text-lg font-semibold tabular-nums text-ink-900 dark:text-ink-50">{price(m.data.close, m.decimals)}</span>
                        <span className={clsx('font-mono text-xs tabular-nums', m.data.changePct > 0 ? 'text-profit-600 dark:text-profit-400' : m.data.changePct < 0 ? 'text-loss-500' : 'text-ink-400')}>{signedPct(m.data.changePct)}</span>
                        <span className="text-[10px] text-ink-400">close, {tradingDay(m.data.closeDate)}</span>
                      </p>
                    ) : (
                      <p className="mt-3 text-xs text-ink-400">{m.data.note ?? (m.data.reason === 'not_loaded' ? 'Open the room to see the latest price' : 'No price yet')}</p>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink-100 pt-2.5 text-[11px] text-ink-500 dark:border-ink-800 dark:text-ink-400">
                      <span className="inline-flex items-center gap-1"><MessagesSquare className="h-3.5 w-3.5" /> {m.activity.participants24h ? `${m.activity.participants24h} traders today` : 'Quiet today'}</span>
                      {s.total ? (
                        <span className="flex items-center gap-1.5" title="Traders’ views over the last 7 days. Opinion, not a trading signal.">
                          <span className="flex h-1.5 w-16 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                            <span className="bg-profit-500" style={{ width: `${s.bullishPct}%` }} />
                            <span className="bg-ink-300 dark:bg-ink-600" style={{ width: `${s.neutralPct}%` }} />
                            <span className="bg-loss-500" style={{ width: `${s.bearishPct}%` }} />
                          </span>
                          {s.bullishPct}% bullish
                        </span>
                      ) : <span>No views yet</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
