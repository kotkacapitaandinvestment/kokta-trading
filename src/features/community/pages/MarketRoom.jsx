import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Info, Landmark, Sparkles } from 'lucide-react';
import { api } from '../../../lib/api';
import { useRealtime, useChannels } from '../realtime';
import { price, signedPct, timeAgo } from '../util';
import { askKotkaLink, aiMarketFor } from '../../../lib/askKotka';
import { FollowButton } from '../components/Buttons';
import PostCard from '../components/PostCard';
import Composer from '../components/Composer';
import PriceChart from '../components/PriceChart';
import { NewsLine, EventLine } from '../components/FeedCards';
import { UserName } from '../components/Identity';
import ConversationChat from '../chat/ConversationChat';

const TABS = [
  ['overview', 'Overview'],
  ['discussion', 'Discussion'],
  ['ideas', 'Ideas'],
  ['news', 'News'],
  ['charts', 'Charts'],
  ['events', 'Events'],
];
const NA = <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">Data not available</span>;
const REASONS = { not_configured: 'Price data is not connected.', rate_limited: 'Loading from the provider; check back in a minute.', fetch_failed: 'The provider did not respond.', not_in_plan: null, insufficient_history: 'Not enough history yet.' };

function Stat({ label, children, note }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      <div className="mt-1 text-sm text-ink-900 dark:text-ink-50">{children}</div>
      {note ? <p className="mt-0.5 text-[11px] text-ink-400">{note}</p> : null}
    </div>
  );
}

function Sentiment({ symbol, sentiment, onChange }) {
  const [busy, setBusy] = useState(false);
  const vote = async (stance) => {
    setBusy(true);
    try {
      const r = await api.post(`/community/markets/${symbol}/sentiment`, { stance: sentiment.mine === stance ? null : stance });
      onChange(r.sentiment);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  };
  const bars = [
    ['bullish', 'Bullish', 'bg-profit-500', sentiment.bullishPct],
    ['neutral', 'Neutral', 'bg-ink-300 dark:bg-ink-600', sentiment.neutralPct],
    ['bearish', 'Bearish', 'bg-loss-500', sentiment.bearishPct],
  ];
  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Community sentiment</h2>
          <p className="text-[11px] text-ink-400">{sentiment.total ? `${sentiment.total} trader${sentiment.total === 1 ? '' : 's'} shared a view in the last ${sentiment.windowDays} days.` : 'No views shared in the last 7 days.'} Community sentiment is not a trading signal.</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {bars.map(([k, label, color, pct]) => (
          <div key={k} className="flex items-center gap-3 text-sm">
            <span className="w-16 text-ink-600 dark:text-ink-300">{label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800"><span className={clsx('block h-full rounded-full', color)} style={{ width: `${pct ?? 0}%` }} /></span>
            <span className="w-10 text-right font-mono text-xs tabular-nums text-ink-500">{pct == null ? 'n/a' : `${pct}%`}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-500">Your view:</span>
        {bars.map(([k, label]) => (
          <button key={k} type="button" disabled={busy} aria-pressed={sentiment.mine === k} onClick={() => vote(k)} className={clsx('rounded-lg border px-3 py-1 text-xs font-medium transition-colors', sentiment.mine === k ? 'border-accent-500 bg-accent-500/10 text-ink-900 dark:text-ink-50' : 'border-ink-200 text-ink-600 hover:border-ink-300 dark:border-ink-700 dark:text-ink-300')}>{label}</button>
        ))}
        {sentiment.mine ? <span className="text-[11px] text-ink-400">Tap again to withdraw. Views expire after 7 days.</span> : null}
      </div>
      {sentiment.history?.length > 1 ? (
        <div className="mt-4 border-t border-ink-100 pt-3 dark:border-ink-800">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Share bullish over time</p>
          <ol className="mt-1.5 space-y-0.5 text-xs text-ink-600 dark:text-ink-300">
            {sentiment.history.slice(-6).map((h) => (
              <li key={h.at} className="flex justify-between"><span className="text-ink-400">{new Date(h.at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span><span className="font-mono tabular-nums">{h.bullishPct}% bullish <span className="text-ink-400">of {h.total}</span></span></li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function Overview({ room, setRoom }) {
  const [ideas, setIdeas] = useState(null);
  const [news, setNews] = useState(null);
  const sym = room.instrument.symbol;
  useEffect(() => {
    api.get(`/community/ideas?instrument=${sym}&status=active`).then((r) => setIdeas(r.ideas.slice(0, 3))).catch(() => setIdeas([]));
    api.get(`/community/news?instrument=${sym}&limit=5`).then((r) => setNews(r.news)).catch(() => setNews([]));
  }, [sym]);
  const d = room.data;
  const dec = room.instrument.decimals;
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <section className="grid grid-cols-2 gap-5 rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900 sm:grid-cols-3">
          <Stat label="Last session range" note={d?.available ? `Session of ${d.closeDate}` : null}>{d?.available ? <span className="font-mono tabular-nums">{price(d.session.low, dec)} - {price(d.session.high, dec)}</span> : NA}</Stat>
          <Stat label="Volatility (14-day ATR)" note={d?.available ? `${d.regime} for this market` : null}>{d?.available ? <span className="font-mono tabular-nums">{d.atrPct}% <span className="text-ink-400">({price(d.atr, dec)})</span></span> : NA}</Stat>
          <Stat label="20-day range" note={d?.available ? `Close in the ${d.technical.rangeThird}` : null}>{d?.available ? <span className="font-mono tabular-nums">{price(d.range.low, dec)} - {price(d.range.high, dec)}</span> : NA}</Stat>
          <Stat label="Technical context" note="From daily closes; not a signal">{d?.available ? <span>{d.technical.vsSma20 ? `${d.technical.vsSma20} 20-day avg` : ''}{d.technical.vsSma50 ? `, ${d.technical.vsSma50} 50-day avg` : ''}</span> : NA}</Stat>
          <Stat label="Fundamental condition" note={room.fundamental.updatedAt ? `Kotka research, ${timeAgo(room.fundamental.updatedAt)} ago` : room.fundamental.reason}>
            {room.fundamental.score != null ? <Link to={`/app/market?instrument=${room.fundamental.subject}`} className="inline-flex items-center gap-1.5 hover:underline"><Landmark className="h-3.5 w-3.5 text-accent-600" /> <span className="font-mono font-semibold">{room.fundamental.score}/100</span> {room.fundamental.condition}</Link> : NA}
          </Stat>
          <Stat label="Market status" note={room.status.note}>{room.status.label}{room.status.session ? <span className="text-ink-400"> · {room.status.session}</span> : null}</Stat>
        </section>
        {d?.available ? (
          <section className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <h2 className="mb-3 text-sm font-semibold text-ink-900 dark:text-ink-50">Daily closes <span className="font-normal text-ink-400">({d.history.length} sessions, Massive)</span></h2>
            <PriceChart history={d.history} decimals={dec} />
          </section>
        ) : null}
        <section className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
          <h2 className="border-b border-ink-100 px-5 py-3 text-sm font-semibold text-ink-900 dark:border-ink-800 dark:text-ink-50">Open trade ideas</h2>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {ideas?.map((p) => <PostCard key={p.id} post={p} />)}
            {ideas && !ideas.length ? <p className="px-5 py-6 text-sm text-ink-400">No open ideas on {room.instrument.display}. Publish one from the Ideas tab.</p> : null}
          </div>
        </section>
      </div>
      <div className="space-y-4">
        <Sentiment symbol={sym} sentiment={room.sentiment} onChange={(s) => setRoom((r) => ({ ...r, sentiment: s }))} />
        <section className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Upcoming events</h2>
          <div className="mt-1 divide-y divide-ink-100 dark:divide-ink-800">
            {room.events.map((e) => <EventLine key={e.id} event={e} compact />)}
            {!room.events.length ? <p className="py-3 text-xs text-ink-400">No covered releases in the next two weeks for {room.instrument.currencies.join(' or ')}.</p> : null}
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
          <h2 className="px-5 pt-4 text-sm font-semibold text-ink-900 dark:text-ink-50">News that matters here</h2>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {news?.slice(0, 4).map((n) => <NewsLine key={n.id} news={n} />)}
            {news && !news.length ? <p className="px-5 py-4 text-xs text-ink-400">No related news stored yet.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function IdeasTab({ symbol }) {
  const [ideas, setIdeas] = useState(null);
  useEffect(() => { api.get(`/community/ideas?instrument=${symbol}`).then((r) => setIdeas(r.ideas)).catch(() => setIdeas([])); }, [symbol]);
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="border-b border-ink-100 dark:border-ink-800"><Composer compact defaultKind="idea" lockKind defaultInstrument={symbol} onCreated={(p) => setIdeas((prev) => [p, ...(prev ?? [])])} /></div>
      <div className="divide-y divide-ink-100 dark:divide-ink-800">
        {ideas?.map((p) => <PostCard key={p.id} post={p} />)}
        {ideas && !ideas.length ? <p className="px-6 py-12 text-center text-sm text-ink-400">No trade ideas yet. Publish the first thesis on this market.</p> : null}
      </div>
    </div>
  );
}

function NewsTab({ symbol }) {
  const [news, setNews] = useState(null);
  useEffect(() => { api.get(`/community/news?instrument=${symbol}&limit=40`).then((r) => setNews(r.news)).catch(() => setNews([])); }, [symbol]);
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
      <p className="border-b border-ink-100 px-5 py-2.5 text-[11px] text-ink-400 dark:border-ink-800">Wire stories and official releases tagged to this market's economies and asset. Unrelated news is filtered out.</p>
      <div className="divide-y divide-ink-100 dark:divide-ink-800">
        {news?.map((n) => <NewsLine key={n.id} news={n} />)}
        {news && !news.length ? <p className="px-6 py-12 text-center text-sm text-ink-400">No related news yet.</p> : null}
      </div>
    </div>
  );
}

function ChartsTab({ symbol }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/community/markets/${symbol}/charts`).then(setData).catch(() => setData({ shots: [] })); }, [symbol]);
  return (
    <div className="space-y-4">
      {data?.price ? (
        <section className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
          <h2 className="mb-3 text-sm font-semibold text-ink-900 dark:text-ink-50">Daily closes</h2>
          <PriceChart history={data.price.history} decimals={data.price.decimals} height={260} />
        </section>
      ) : null}
      <section className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
        <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Charts shared by traders</h2>
        {data && !data.shots.length ? <p className="mt-3 text-sm text-ink-400">No charts shared yet. Attach one in the discussion or a post.</p> : null}
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          {data?.shots.map((s) => (
            <figure key={`${s.sourceId}-${s.url}`} className="overflow-hidden rounded-xl border border-ink-100 dark:border-ink-800">
              <a href={s.url} target="_blank" rel="noreferrer"><img src={s.url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" /></a>
              <figcaption className="p-2 text-[11px]"><UserName user={s.author} showHandle={false} /> <span className="text-ink-400">· {timeAgo(s.createdAt)}</span>{s.caption ? <span className="mt-0.5 line-clamp-2 block text-ink-500">{s.caption}</span> : null}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}

function EventsTab({ symbol }) {
  const [events, setEvents] = useState(null);
  useEffect(() => { api.get(`/community/events?instrument=${symbol}`).then((r) => setEvents(r.events)).catch(() => setEvents([])); }, [symbol]);
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="divide-y divide-ink-100 dark:divide-ink-800">
        {events?.map((e) => <EventLine key={e.id} event={e} />)}
        {events && !events.length ? <p className="px-6 py-12 text-center text-sm text-ink-400">No covered events for this market's economies.</p> : null}
      </div>
    </div>
  );
}

export default function MarketRoom() {
  const { symbol } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([t]) => t === params.get('tab')) ? params.get('tab') : params.get('m') ? 'discussion' : 'overview';
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  useChannels(symbol ? [`market:${symbol.toUpperCase()}`] : []);
  useEffect(() => {
    setRoom(null);
    api.get(`/community/markets/${symbol}`).then(setRoom).catch((err) => setError(err.message));
  }, [symbol]);
  useRealtime('sentiment', (d) => d.symbol === room?.instrument.symbol && setRoom((r) => ({ ...r, sentiment: { ...r.sentiment, ...d.sentiment } })));

  if (error) return <p className="rounded-2xl bg-white p-6 text-sm text-loss-500 dark:bg-ink-900">{error}</p>;
  if (!room) return <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const d = room.data;
  const up = d?.changePct > 0;
  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-ink-100 bg-white p-4 dark:border-ink-800 dark:bg-ink-900 sm:p-5">
        {/* Phones: name and Follow on one row, price below. Wider: one row. */}
        <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide text-ink-400">{room.instrument.market} · {room.counts.followers} following</p>
            <h1 className="mt-0.5 font-mono text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-50 sm:text-2xl">{room.instrument.display}</h1>
            <p className="truncate text-sm text-ink-500 dark:text-ink-400">{room.instrument.name}</p>
          </div>
          <div className={clsx('order-last w-full sm:order-none sm:w-auto sm:text-right', tab !== 'overview' && 'hidden sm:block')}>
            {d?.available ? (
              <>
                <p className="flex items-baseline gap-2 sm:block">
                  <span className="font-mono text-2xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">{price(d.close, room.instrument.decimals)}</span>
                  <span className={clsx('inline-flex items-center gap-0.5 font-mono text-sm tabular-nums sm:flex sm:justify-end', up ? 'text-profit-600 dark:text-profit-400' : d.changePct < 0 ? 'text-loss-500' : 'text-ink-400')}>{up ? <ArrowUpRight className="h-4 w-4" /> : d.changePct < 0 ? <ArrowDownRight className="h-4 w-4" /> : null}{signedPct(d.changePct)}</span>
                </p>
                <p className="text-[11px] text-ink-400">Daily close {d.closeDate}{d.stale ? ' (latest available)' : ''} · end-of-day, not live</p>
              </>
            ) : (
              <div className="sm:max-w-xs">
                {NA}
                <p className="text-[11px] text-ink-400">{d?.note ?? REASONS[d?.reason] ?? ''}</p>
              </div>
            )}
          </div>
          <FollowButton targetType="market" targetId={room.instrument.symbol} following={room.following} size="md" />
        </div>
        <div className={clsx('mt-4 flex-wrap items-center gap-x-6 gap-y-2 border-t border-ink-100 pt-3 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400', tab === 'overview' ? 'flex' : 'hidden sm:flex')}>
          <span><span className={clsx('mr-1.5 inline-block h-2 w-2 rounded-full', room.status.open ? 'bg-profit-500' : 'bg-ink-300')} />{room.status.label}{room.status.session ? ` · ${room.status.session}` : ''}</span>
          <span>{d?.available ? `${d.regime} volatility (${d.atrPct}% ATR)` : 'Volatility: n/a'}</span>
          <span>{room.fundamental.score != null ? `Fundamentals ${room.fundamental.score}/100 ${room.fundamental.condition}` : 'Fundamentals: n/a'}</span>
          <span>{room.sentiment.total ? `Community ${room.sentiment.bullishPct}% bullish · ${room.sentiment.neutralPct}% neutral · ${room.sentiment.bearishPct}% bearish` : 'Community sentiment: no views yet'}</span>
          <span>{room.room.participants24h ? `${room.room.participants24h} trader${room.room.participants24h === 1 ? '' : 's'} discussing today` : 'Room quiet today'}</span>
          <Link to={askKotkaLink(`Give me context on ${room.instrument.display} right now: structure, volatility, fundamentals, sentiment and upcoming events.`, aiMarketFor(room.instrument.market))} className="ml-auto inline-flex items-center gap-1 font-medium text-accent-700 hover:underline dark:text-accent-300"><Sparkles className="h-3.5 w-3.5" /> Ask Kotka</Link>
        </div>
      </header>
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Market room">
        {TABS.map(([t, l]) => (
          <button key={t} type="button" onClick={() => setParams(t === 'overview' ? {} : { tab: t })} aria-current={tab === t ? 'page' : undefined} className={clsx('shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium', tab === t ? 'bg-ink-900 text-white dark:bg-ink-700' : 'text-ink-500 hover:bg-white dark:hover:bg-ink-800')}>
            {l}{t === 'discussion' && room.room.messages24h ? <span className="ml-1.5 text-[11px] opacity-70">{room.room.messages24h}</span> : null}
          </button>
        ))}
      </nav>
      {tab === 'overview' ? <Overview room={room} setRoom={setRoom} /> : null}
      {tab === 'discussion' ? (
        <div className="flex h-[calc(100dvh_-_23rem_-_var(--bottom-nav))] min-h-[20rem] overflow-hidden sm:h-[calc(100dvh_-_19rem_-_var(--bottom-nav))] sm:min-h-[28rem] rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
          <ConversationChat conversationId={room.room.id} variant="room" isPublic focusId={params.get('m')} emptyText={`No messages yet in ${room.instrument.display}. Start the conversation.`} />
        </div>
      ) : null}
      {tab === 'ideas' ? <IdeasTab symbol={room.instrument.symbol} /> : null}
      {tab === 'news' ? <NewsTab symbol={room.instrument.symbol} /> : null}
      {tab === 'charts' ? <ChartsTab symbol={room.instrument.symbol} /> : null}
      {tab === 'events' ? <EventsTab symbol={room.instrument.symbol} /> : null}
      <p className="flex items-center gap-1.5 text-[11px] text-ink-400"><Info className="h-3 w-3" /> Discussion and ideas are traders' opinions. Prices are end-of-day closes, not live quotes.</p>
    </div>
  );
}
