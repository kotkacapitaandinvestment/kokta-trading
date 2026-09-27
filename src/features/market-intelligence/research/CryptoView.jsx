import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Info, Landmark, MessagesSquare } from 'lucide-react';
import { api } from '../../../lib/api';
import { askKotkaLink } from '../../../lib/askKotka';
import { conditionWord } from '../../../lib/plain';
import PriceChart from '../../community/components/PriceChart';

const usd = (v) => {
  if (v == null) return 'n/a';
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};
const pct = (v, signed = true) => (v == null ? 'n/a' : `${signed && v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`);
const count = (v) => (v == null ? 'n/a' : Math.round(v).toLocaleString());
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const tone = (v) => (v > 0 ? 'text-profit-600 dark:text-profit-400' : v < 0 ? 'text-loss-500' : 'text-ink-500');

function Card({ title, source, children, className }) {
  return (
    <section className={clsx('rounded-2xl border border-ink-100 bg-white p-5 text-ink-800 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-100', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{title}</h3>
        {source ? <p className="text-[11px] text-ink-400">{source}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, note, valueClass }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className={clsx('mt-0.5 font-mono text-base font-semibold tabular-nums text-ink-900 dark:text-ink-50', valueClass)}>{value}</dd>
      {note ? <p className="mt-0.5 text-[11px] text-ink-400">{note}</p> : null}
    </div>
  );
}

const Unavailable = ({ what }) => <p className="text-sm text-ink-400">{what} isn’t available right now. Check back soon: we never fill gaps with estimates.</p>;

export default function CryptoView({ symbol, onInstrumentChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setData(null);
    setError(null);
    api.get(`/research/crypto/${symbol}`).then(setData).catch(() => setError('Couldn’t load this page. Refresh to try again.'));
  }, [symbol]);

  if (error) return <p className="rounded-2xl bg-white p-6 text-sm text-loss-500 dark:bg-ink-900">{error}</p>;
  if (!data) return <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const m = data.market;
  const c = data.coin?.ok ? data.coin.data : null;
  const g = data.global?.ok ? data.global.data : null;
  const n = data.network?.ok ? data.network.data : null;
  const up = m?.changePct > 0;
  const issued = c?.maxSupply && c?.circulatingSupply ? (c.circulatingSupply / c.maxSupply) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-accent-500/25 bg-accent-50/50 p-4 text-sm text-ink-700 dark:bg-accent-900/10 dark:text-ink-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400" />
        <p>
          <span className="font-semibold">{data.asset} is not scored.</span> Kotka's fundamental scores come from an economy's official data: growth, inflation, policy, external balance and public finances. {data.asset} has no issuing economy, so below is the verified context that does exist, each with its source.{' '}
          <Link to={askKotkaLink(`What does Kotka's data say about ${data.asset} right now: price structure, market data, network activity and the dollar side?`, 'Crypto')} className="font-medium text-accent-700 underline-offset-2 hover:underline dark:text-accent-300">Ask Kotka about {data.asset}</Link>
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={`${data.display} price structure`} source="Daily closing prices" className="xl:col-span-2">
          {m?.available ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="font-mono text-3xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">{m.close.toLocaleString(undefined, { maximumFractionDigits: m.decimals + 1 })}</p>
                  <p className={clsx('inline-flex items-center gap-0.5 font-mono text-sm tabular-nums', tone(m.changePct))}>
                    {up ? <ArrowUpRight className="h-4 w-4" /> : m.changePct < 0 ? <ArrowDownRight className="h-4 w-4" /> : null}
                    {pct(m.changePct)} <span className="ml-1 font-sans text-[11px] text-ink-400">close on {new Date(`${m.closeDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, not live</span>
                  </p>
                </div>
                <dl className="grid grid-cols-3 gap-5">
                  <Stat label="7 days" value={pct(m.performance.d7)} valueClass={tone(m.performance.d7)} />
                  <Stat label="30 days" value={pct(m.performance.d30)} valueClass={tone(m.performance.d30)} />
                  <Stat label="90 days" value={pct(m.performance.d90)} valueClass={tone(m.performance.d90)} />
                </dl>
              </div>
              <div className="mt-4"><PriceChart history={m.history} decimals={m.decimals} height={220} /></div>
              <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-ink-100 pt-4 dark:border-ink-800 sm:grid-cols-3">
                <Stat label="Avg daily move (14 days)" value={pct(m.atrPct, false)} note={`${m.regime} volatility`} />
                <Stat label="20-day range" value={`${Math.round(m.range.low).toLocaleString()} - ${Math.round(m.range.high).toLocaleString()}`} note={`Close in the ${m.technical.rangeThird}`} />
                <Stat label="Vs average price" value={<span className="font-sans text-sm font-medium">{m.technical.vsSma20} 20-day, {m.technical.vsSma50} 50-day</span>} note="From daily closes; not a signal" />
              </dl>
            </>
          ) : (
            <Unavailable what="Price data" error={m?.note ?? m?.reason} />
          )}
        </Card>

        <Card title="The dollar side" source="Kotka Fundamental Research">
          {data.dollar.score != null ? (
            <>
              <p className="text-xs text-ink-500 dark:text-ink-400">{data.display} is priced in US dollars, so US policy and data move it through the dollar and risk appetite.</p>
              <button type="button" onClick={() => onInstrumentChange('USD')} className="mt-3 flex w-full items-center justify-between rounded-xl border border-ink-100 px-3 py-2.5 text-left text-ink-800 hover:border-accent-300 dark:border-ink-800 dark:text-ink-100 dark:hover:border-accent-700">
                <span className="flex items-center gap-2 text-sm"><Landmark className="h-4 w-4 text-accent-600" /> US dollar fundamentals</span>
                <span className="font-mono text-sm font-semibold">{data.dollar.score}/100 <span className="font-sans text-xs font-normal text-ink-500">{conditionWord(data.dollar.condition)}</span></span>
              </button>
              <p className="mt-1 text-[11px] text-ink-400">Confidence {data.dollar.confidence}/100 · updated {when(data.dollar.updatedAt)}</p>
            </>
          ) : <p className="text-sm text-ink-400">{data.dollar.reason}</p>}
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Next high-importance US releases</p>
          <ul className="mt-2 space-y-2">
            {data.events.map((e) => (
              <li key={e.id}>
                <Link to={`/app/community/events/${e.id}`} className="block text-sm text-ink-800 hover:underline dark:text-ink-100">{e.title}</Link>
                <span className="text-[11px] text-ink-400">{new Date(e.scheduledAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(e.dateOnly ? {} : { hour: '2-digit', minute: '2-digit' }) })}</span>
              </li>
            ))}
            {!data.events.length ? <li className="text-sm text-ink-400">No major US releases coming up.</li> : null}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Market data" source={data.coin?.ok ? `Updated ${when(c.lastUpdated)}` : null}>
          {c ? (
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Stat label="Market cap" value={usd(c.marketCapUsd)} note={c.marketCapRank ? `Rank #${c.marketCapRank}` : null} />
              <Stat label="24h volume" value={usd(c.volume24hUsd)} />
              <Stat label="From all-time high" value={pct(c.athChangePct)} valueClass={tone(c.athChangePct)} note={c.athUsd ? `All-time high ${usd(c.athUsd)}, ${new Date(c.athDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : null} />
              <Stat label="Circulating supply" value={count(c.circulatingSupply)} note={issued != null ? `${issued.toFixed(1)}% of the ${count(c.maxSupply)} cap` : c.maxSupply == null ? 'No fixed supply cap' : null} />
              <Stat label="1-year change" value={pct(c.change1yPct)} valueClass={tone(c.change1yPct)} />
              {g ? <Stat label={data.symbol === 'BTCUSD' ? 'Bitcoin dominance' : 'Ether dominance'} value={pct(data.symbol === 'BTCUSD' ? g.btcDominancePct : g.ethDominancePct, false)} note={`Share of a ${usd(g.totalMarketCapUsd)} crypto market`} /> : null}
            </dl>
          ) : (
            <Unavailable what="Market data" error={data.coin?.error} />
          )}
        </Card>

        <Card title="Network activity" source={n ? `Updated ${when(n.asOf)}` : null}>
          {data.network === null ? (
            <p className="text-sm text-ink-400">Network data for {data.asset} isn't covered yet. Kotka shows only sources it can verify.</p>
          ) : n ? (
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Stat label="Hash rate" value={`${count(n.hashRateEhs)} EH/s`} note="Computing power securing the network (exahashes per second)" />
              <Stat label="Transactions (24h)" value={count(n.transactions24h)} />
              <Stat label="Blocks (24h)" value={count(n.blocks24h)} note="Target is 144" />
              <Stat label="Minutes per block" value={n.minutesBetweenBlocks ?? 'n/a'} note="Target is 10" />
              <Stat label="Mining difficulty" value={n.difficulty ? `${(n.difficulty / 1e12).toFixed(1)}T` : 'Not available'} note="How hard it is to mine a new block" />
            </dl>
          ) : (
            <Unavailable what="Network data" error={data.network?.error} />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Crypto news" source="Latest headlines">
          <ul className="divide-y divide-ink-100 dark:divide-ink-800">
            {data.news.map((x) => (
              <li key={x.id} className="py-2.5 first:pt-0">
                <Link to={`/app/community/news/${x.id}`} className="text-sm font-medium text-ink-800 hover:underline dark:text-ink-100">{x.headline}</Link>
                <p className="text-[11px] text-ink-400">{x.provider} · {when(x.publishedAt)}</p>
              </li>
            ))}
            {!data.news.length ? <li className="text-sm text-ink-400">No tagged news for {data.display} yet.</li> : null}
          </ul>
        </Card>
        <Card title="Community">
          {data.sentiment.total ? (
            <p className="text-sm text-ink-700 dark:text-ink-200">
              <span className="font-mono font-semibold">{data.sentiment.bullishPct}%</span> bullish, <span className="font-mono">{data.sentiment.neutralPct}%</span> neutral, <span className="font-mono">{data.sentiment.bearishPct}%</span> bearish, from {data.sentiment.total} trader{data.sentiment.total === 1 ? '' : 's'} in the last 7 days.
            </p>
          ) : <p className="text-sm text-ink-400">No community views shared in the last 7 days.</p>}
          <p className="mt-1 text-[11px] text-ink-400">Community opinion, not a trading signal.</p>
          <Link to={`/app/community/markets/${data.symbol}?tab=discussion`} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-100 dark:hover:bg-ink-800">
            <MessagesSquare className="h-4 w-4" /> Open the {data.display} room
          </Link>
        </Card>
      </div>
    </div>
  );
}
