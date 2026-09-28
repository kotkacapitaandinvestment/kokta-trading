import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, BellRing, ExternalLink, Radio, Sparkles } from 'lucide-react';
import { api } from '../../../lib/api';
import { price, signedPct } from '../util';
import { FollowButton, SaveButton } from '../components/Buttons';
import AiPanel, { useAiAction } from '../components/AiPanel';
import ConversationChat from '../chat/ConversationChat';

const PHASES = [
  ['upcoming', 'Before release'],
  ['live', 'Release'],
  ['reaction', 'Market reaction'],
  ['released', 'After the release'],
];

function Countdown({ at }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(at).getTime() - now;
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return <span className="font-mono tabular-nums">{d ? `${d}d ` : ''}{String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span>;
}

export default function EventDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const ai = useAiAction();
  useEffect(() => {
    setData(null);
    api.get(`/community/events/${id}`).then(setData).catch((err) => setError(err.message));
  }, [id]);
  if (error) return <p className="rounded-2xl bg-white p-6 text-sm text-loss-500 dark:bg-ink-900">{error}</p>;
  if (!data) return <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const e = data.event;
  const phaseIdx = e.phase === 'upcoming' ? 0 : e.phase === 'live' ? 1 : data.reaction.length ? 3 : 2;
  const values = [['Previous', e.previous], ['Forecast', e.forecast], ['Actual', e.actual]];
  const summary = ai.state ?? (e.summary ? { kind: 'summary', result: e.summary, cached: true } : null);
  return (
    <div className="space-y-4">
      <Link to="/app/community/events" className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800 dark:text-ink-400"><ArrowLeft className="h-3.5 w-3.5" /> All events</Link>
      <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-4">
          <header className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {e.phase === 'live' ? <span className="inline-flex items-center gap-1 rounded bg-loss-500 px-1.5 py-0.5 font-semibold uppercase text-white"><Radio className="h-3 w-3" /> Live</span> : null}
              <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono font-semibold text-ink-700 dark:bg-ink-800 dark:text-ink-200">{e.currency}</span>
              <span className="text-ink-500">{e.country}</span>
              <span className={clsx('font-medium', e.importance === 'High' ? 'text-accent-700 dark:text-accent-300' : 'text-ink-400')}>{e.importance} importance</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">{e.title}</h1>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
              {new Date(e.scheduledAt).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', ...(e.dateOnly ? {} : { hour: '2-digit', minute: '2-digit' }) })}
              {e.dateOnly ? ' · time not announced yet' : ''}
              {e.referencePeriod ? ` · covers ${e.referencePeriod}` : ''}
            </p>
            {e.phase === 'upcoming' && !e.dateOnly ? <p className="mt-3 text-sm text-ink-700 dark:text-ink-200">Starts in <Countdown at={e.scheduledAt} /></p> : null}
            <ol className="mt-5 grid grid-cols-4 gap-2" aria-label="Event phases">
              {PHASES.map(([k, l], i) => (
                <li key={k} className="text-center">
                  <span className={clsx('mx-auto block h-1.5 rounded-full', i <= phaseIdx ? 'bg-accent-500' : 'bg-ink-100 dark:bg-ink-800')} />
                  <span className={clsx('mt-1.5 block text-[11px]', i === phaseIdx ? 'font-semibold text-ink-900 dark:text-ink-50' : 'text-ink-400')}>{l}</span>
                </li>
              ))}
            </ol>
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-ink-100 pt-4 dark:border-ink-800">
              {values.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] text-ink-400">{k}</dt>
                  <dd className="mt-0.5 font-mono text-lg font-semibold text-ink-900 dark:text-ink-50">{v ?? <span className="font-sans text-xs font-normal text-ink-400">Not out yet</span>}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-ink-400">{e.valuesNote ? `Figures: ${e.valuesNote}.` : 'Forecast and actual figures appear here once they’re published.'}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <FollowButton targetType="event" targetId={e.id} following={data.following} labels={['Remind me', 'Reminder set']} />
              <SaveButton itemType="event" itemId={e.id} />
              {e.sourceUrl ? <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:underline dark:text-ink-400">{e.sourceName ?? 'Source'} <ExternalLink className="h-3 w-3" /></a> : null}
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-400"><BellRing className="h-3 w-3" /> {data.followers} reminder{data.followers === 1 ? '' : 's'} set</span>
            </div>
          </header>

          <section className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Market reaction</h2>
            {data.reaction.length ? (
              <>
                <table className="mt-3 w-full text-sm">
                  <thead><tr className="text-left text-[11px] text-ink-400"><th className="pb-1 font-medium">Market</th><th className="pb-1 text-right font-medium">Close</th><th className="pb-1 text-right font-medium">Day change</th><th className="pb-1 text-right font-medium">Day range</th></tr></thead>
                  <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                    {data.reaction.map((r) => (
                      <tr key={r.symbol}>
                        <td className="py-1.5"><Link to={`/app/community/markets/${r.symbol}`} className="font-mono font-semibold text-ink-800 hover:underline dark:text-ink-100">{r.display}</Link></td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{price(r.close, r.decimals)}</td>
                        <td className={clsx('py-1.5 text-right font-mono tabular-nums', r.changePct > 0 ? 'text-profit-600 dark:text-profit-400' : r.changePct < 0 ? 'text-loss-500' : '')}>{signedPct(r.changePct)}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-ink-500">{r.rangePct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] text-ink-400">Closing prices on the release day. The day’s change includes everything else that happened that day too.</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-400">{e.phase === 'upcoming' || e.phase === 'live' ? 'Shows up after markets close on the release day.' : 'Prices for this day aren’t in yet. Check back later.'}</p>
            )}
            {e.instruments?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{e.instruments.map((s) => <Link key={s} to={`/app/community/markets/${s}`} className="rounded bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] text-ink-600 hover:bg-ink-100 dark:bg-ink-800 dark:text-ink-300">{/^[A-Z]{6}$/.test(s) ? `${s.slice(0, 3)}/${s.slice(3)}` : s}</Link>)}</div> : null}
          </section>

          <section className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Kotka summary</h2>
              <button type="button" onClick={() => ai.run('summary', '/community/ai/summarize', { conversationId: data.room.id })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent-700 hover:bg-accent-500/10 dark:text-accent-300"><Sparkles className="h-3.5 w-3.5" /> {e.summary ? 'Refresh' : 'Summarise discussion'}</button>
            </div>
            {summary ? <AiPanel state={summary} onClose={ai.clear} className="mt-3" /> : <p className="mt-2 text-sm text-ink-400">Once there’s some chat about this event, Kotka can summarise it, keeping confirmed figures apart from opinion.</p>}
          </section>
        </div>

        <div className="flex h-[70dvh] min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900 xl:sticky xl:top-4 xl:h-[calc(100dvh-10rem)]">
          <p className="border-b border-ink-100 px-4 py-2.5 text-sm font-semibold text-ink-900 dark:border-ink-800 dark:text-ink-50">Event chat <span className="font-normal text-ink-400">· {data.room.participants} trader{data.room.participants === 1 ? '' : 's'}</span></p>
          <ConversationChat conversationId={data.room.id} variant="event" isPublic focusId={params.get('m')} emptyText="No messages yet. Share what you expect before the release." />
        </div>
      </div>
    </div>
  );
}
