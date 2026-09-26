// Crypto context for Market Intelligence.
//
// Kotka's fundamental scores are built from an economy's official data (IMF,
// central banks, statistics offices). Bitcoin and Ether have no issuing
// economy, so they are not scored. Instead this assembles the verified data
// that does exist, each part labelled with its source and time:
//   - price structure from Massive end-of-day bars
//   - market data from CoinGecko (cap, volume, supply, dominance, ATH)
//   - Bitcoin network activity from blockchain.info
//   - the US dollar side of the pair from Kotka's USD research
//   - upcoming US releases, tagged crypto news and community sentiment

import { prisma } from '../prisma.js';
import { fetchJson } from './http.js';
import { cachedSource } from './cache.js';
import { latestReportSummaries } from './engine.js';
import { instrument } from '../instruments.js';
import { instrumentMarketData } from '../marketPulse.js';
import { sentimentFor } from '../community/sentiment.js';

export const CRYPTO = {
  BTCUSD: { coingecko: 'bitcoin', asset: 'Bitcoin', network: 'bitcoin' },
  ETHUSD: { coingecko: 'ethereum', asset: 'Ether', network: null },
};

const MIN = 60 * 1000;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function source(name, key, ttl, fn) {
  try {
    const { data, fetchedAt } = await cachedSource(key, ttl, fn);
    return { ok: true, data, fetchedAt, name };
  } catch (err) {
    return { ok: false, error: String(err.message).slice(0, 160), name };
  }
}

function performance(history) {
  if (!history?.length) return {};
  const last = history.at(-1);
  const back = (days) => {
    const cutoff = new Date(new Date(last.t).getTime() - days * 86400e3).toISOString().slice(0, 10);
    let pick = null;
    for (const h of history) if (h.t <= cutoff) pick = h;
    return pick;
  };
  const pct = (ref) => (ref ? Math.round((last.c / ref.c - 1) * 10000) / 100 : null);
  return { d7: pct(back(7)), d30: pct(back(30)), d90: pct(back(90)) };
}

export async function cryptoContext(symbol) {
  const inst = instrument(symbol);
  const meta = CRYPTO[inst?.symbol];
  if (!meta) return null;

  const [market, coin, global, network, research, events, news, sentiment] = await Promise.all([
    instrumentMarketData(inst.symbol, { fetch: true }),
    source('CoinGecko', `crypto:cg:coin:${meta.coingecko}`, 15 * MIN, async () => {
      const c = await fetchJson(`https://api.coingecko.com/api/v3/coins/${meta.coingecko}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`, { timeoutMs: 15000 });
      const m = c.market_data ?? {};
      return {
        marketCapUsd: num(m.market_cap?.usd),
        marketCapRank: num(c.market_cap_rank),
        volume24hUsd: num(m.total_volume?.usd),
        circulatingSupply: num(m.circulating_supply),
        totalSupply: num(m.total_supply),
        maxSupply: num(m.max_supply),
        athUsd: num(m.ath?.usd),
        athDate: m.ath_date?.usd ?? null,
        athChangePct: num(m.ath_change_percentage?.usd),
        change1yPct: num(m.price_change_percentage_1y),
        lastUpdated: c.last_updated ?? null,
      };
    }),
    source('CoinGecko', 'crypto:cg:global', 15 * MIN, async () => {
      const g = (await fetchJson('https://api.coingecko.com/api/v3/global', { timeoutMs: 15000 })).data ?? {};
      return {
        totalMarketCapUsd: num(g.total_market_cap?.usd),
        change24hPct: num(g.market_cap_change_percentage_24h_usd),
        btcDominancePct: num(g.market_cap_percentage?.btc),
        ethDominancePct: num(g.market_cap_percentage?.eth),
        updatedAt: g.updated_at ? new Date(g.updated_at * 1000).toISOString() : null,
      };
    }),
    meta.network === 'bitcoin'
      ? source('blockchain.info', 'crypto:btc:network', 30 * MIN, async () => {
          const s = await fetchJson('https://api.blockchain.info/stats', { timeoutMs: 15000 });
          return {
            hashRateEhs: num(s.hash_rate) != null ? Math.round((s.hash_rate / 1e9) * 10) / 10 : null, // GH/s -> EH/s
            difficulty: num(s.difficulty),
            transactions24h: num(s.n_tx),
            blocks24h: num(s.n_blocks_mined),
            minutesBetweenBlocks: num(s.minutes_between_blocks) != null ? Math.round(s.minutes_between_blocks * 10) / 10 : null,
            asOf: num(s.timestamp) ? new Date(s.timestamp).toISOString() : null,
          };
        })
      : null,
    latestReportSummaries().then((m) => m.get('currency:USD') ?? null).catch(() => null),
    prisma.marketEvent.findMany({ where: { cancelled: false, currency: 'USD', importance: 'High', scheduledAt: { gte: new Date() } }, orderBy: { scheduledAt: 'asc' }, take: 5 }),
    prisma.newsItem.findMany({ where: { instruments: { has: inst.symbol } }, orderBy: { publishedAt: 'desc' }, take: 8 }),
    sentimentFor(inst.symbol),
  ]);

  return {
    symbol: inst.symbol,
    display: inst.display,
    name: inst.name,
    asset: meta.asset,
    market: market?.available ? { ...market, performance: performance(market.history) } : market,
    coin,
    global,
    network,
    dollar: research
      ? { score: research.score, confidence: research.confidence, condition: research.condition, direction: research.direction, updatedAt: research.createdAt }
      : { available: false, reason: 'Kotka has not researched the US dollar yet.' },
    events: events.map((e) => ({ id: e.id, title: e.title, scheduledAt: e.scheduledAt, dateOnly: e.dateOnly, importance: e.importance })),
    news: news.map((n) => ({ id: n.id, headline: n.headline, provider: n.provider, publishedAt: n.publishedAt, official: n.official, url: n.url })),
    sentiment,
  };
}
