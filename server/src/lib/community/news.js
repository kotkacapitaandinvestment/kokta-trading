// Market news: wire stories from Finnhub plus official press releases from
// the Federal Reserve and the ECB. Only items that match a supported market
// are stored ("what news matters to this market?"), tagged with the
// currencies, instruments and topics they touch.

import { prisma } from '../prisma.js';
import { decryptSecret } from '../crypto.js';
import { fetchText, fetchJson, decodeEntities } from '../research/http.js';
import { cachedSource } from '../research/cache.js';
import { INSTRUMENTS } from '../instruments.js';

// Currency / asset keywords. Word-boundary matched, case-insensitive.
const CURRENCY_TERMS = {
  USD: ['federal reserve', 'the fed', 'fed chair', 'fomc', 'powell', 'treasury yields?', 'u\\.s\\. economy', 'us economy', 'nonfarm', 'payrolls', 'u\\.s\\. inflation', 'us inflation', 'u\\.s\\. cpi', 'us cpi', 'dollar index', 'the dollar', 'greenback', 'u\\.s\\. jobs', 'us jobs', 'u\\.s\\. gdp', 'us gdp', 'white house', 'u\\.s\\. tariffs?', 'us tariffs?', 'jobless claims'],
  EUR: ['ecb', 'european central bank', 'lagarde', 'euro zone', 'eurozone', 'euro area', 'the euro', 'bund yields?', 'german economy', 'germany', 'france', 'italy', 'eurostat'],
  GBP: ['bank of england', 'boe', 'bailey', 'sterling', 'the pound', 'uk economy', 'u\\.k\\. economy', 'britain', 'british economy', 'gilts?', 'uk inflation'],
  JPY: ['bank of japan', 'boj', 'ueda', 'the yen', 'japanese yen', 'japan', 'jgbs?'],
  CHF: ['swiss national bank', 'snb', 'swiss franc', 'switzerland'],
  CAD: ['bank of canada', 'canadian dollar', 'loonie', 'canada'],
  AUD: ['reserve bank of australia', 'rba', 'australian dollar', 'aussie dollar', 'australia'],
  NZD: ['reserve bank of new zealand', 'rbnz', 'new zealand dollar', 'kiwi dollar', 'new zealand'],
};
const ASSET_TERMS = {
  XAUUSD: ['gold', 'bullion'],
  XAGUSD: ['silver'],
  BTCUSD: ['bitcoin', 'btc'],
  ETHUSD: ['ether', 'ethereum'],
  NAS100: ['nasdaq', 'tech stocks'],
  SPX500: ['s&p 500', 's&p500', 'wall street', 'u\\.s\\. stocks', 'us stocks'],
  US30: ['dow jones', 'the dow', 'blue-chip'],
};
const TOPIC_TERMS = {
  inflation: ['inflation', 'cpi', 'pce', 'prices rose', 'price pressures'],
  employment: ['jobs', 'payrolls', 'unemployment', 'labor market', 'labour market', 'jobless'],
  growth: ['gdp', 'growth', 'recession', 'pmi', 'economic output'],
  'central-banks': ['rate cut', 'rate hike', 'interest rates?', 'monetary policy', 'central bank', 'policy rate'],
  fiscal: ['budget', 'deficit', 'fiscal', 'debt ceiling', 'spending bill', 'tax'],
  geopolitics: ['war', 'sanctions', 'missile', 'ceasefire', 'military', 'iran', 'russia', 'ukraine', 'israel', 'taiwan', 'north korea'],
  trade: ['tariffs?', 'trade war', 'trade deal', 'exports', 'imports'],
  energy: ['oil', 'opec', 'crude', 'natural gas'],
};

const rx = (terms) => new RegExp(`\\b(${terms.join('|')})\\b`, 'i');
const CUR_RX = Object.fromEntries(Object.entries(CURRENCY_TERMS).map(([k, v]) => [k, rx(v)]));
const ASSET_RX = Object.fromEntries(Object.entries(ASSET_TERMS).map(([k, v]) => [k, rx(v)]));
const TOPIC_RX = Object.fromEntries(Object.entries(TOPIC_TERMS).map(([k, v]) => [k, rx(v)]));

export function tagNews(text, { defaultCurrencies = [] } = {}) {
  const t = String(text ?? '');
  const currencies = new Set(defaultCurrencies);
  for (const [c, r] of Object.entries(CUR_RX)) if (r.test(t)) currencies.add(c);
  const assets = Object.entries(ASSET_RX).filter(([, r]) => r.test(t)).map(([s]) => s);
  const topics = Object.entries(TOPIC_RX).filter(([, r]) => r.test(t)).map(([k]) => k);
  // A currency pair is relevant when either of its currencies is mentioned.
  const instruments = new Set(assets);
  for (const i of INSTRUMENTS) if (i.market === 'Forex' && i.currencies.some((c) => currencies.has(c))) instruments.add(i.symbol);
  return { currencies: [...currencies], instruments: [...instruments], topics };
}

async function finnhubKey() {
  const row = await prisma.integration.findUnique({ where: { provider: 'finnhub' } }).catch(() => null);
  if (!row?.enabled || !row.secretCipher) return null;
  try {
    return decryptSecret(row.secretCipher).trim() || null;
  } catch {
    return null;
  }
}

function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const get = (tag) => {
      const v = m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? '';
      return decodeEntities(v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    };
    return { title: get('title'), link: get('link'), date: get('pubDate') || get('dc:date'), description: get('description'), guid: get('guid') };
  });
}

// Wire summaries sometimes arrive as HTML or just repeat the headline.
export function cleanSummary(summary, headline) {
  const text = decodeEntities(String(summary ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const h = String(headline ?? '').toLowerCase().replace(/\s*-\s*[^-]+$/, '').trim();
  if (h && text.toLowerCase().startsWith(h.slice(0, Math.min(60, h.length)))) return text.length > h.length + 40 ? text.slice(0, 1200) : null;
  return text.slice(0, 1200);
}

const isWebUrl = (u) => {
  try {
    return ['http:', 'https:'].includes(new URL(String(u)).protocol);
  } catch {
    return false;
  }
};

async function fetchFinnhub(key) {
  const out = [];
  for (const category of ['forex', 'general', 'crypto']) {
    // Key in a header, not the URL, so it never lands in request logs.
    const list = await fetchJson(`https://finnhub.io/api/v1/news?category=${category}`, { timeoutMs: 15000, headers: { 'X-Finnhub-Token': key } }).catch(() => []);
    for (const n of Array.isArray(list) ? list : []) {
      if (!n.headline || !n.url || !n.datetime) continue;
      out.push({ source: 'finnhub', provider: n.source || 'News wire', externalId: `finnhub:${n.id}`, headline: n.headline.slice(0, 300), summary: cleanSummary(n.summary, n.headline), url: n.url, imageUrl: n.image && /^https:\/\//.test(n.image) ? n.image : null, publishedAt: new Date(n.datetime * 1000), official: false, category });
    }
  }
  return out;
}

async function fetchOfficial() {
  // Only policy and economy releases; routine supervisory notices (bank
  // mergers, enforcement actions) are not market news.
  const feeds = [
    { source: 'fed', provider: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml', currencies: ['USD'], keep: /\b(fomc|federal open market|monetary policy|policy statement|minutes|discount rate|interest on reserve|economic projections|beige book|balance sheet|financial stability report|chair(man)? powell|testimony|stress test results)\b/i },
    { source: 'ecb', provider: 'European Central Bank', url: 'https://www.ecb.europa.eu/rss/press.html', currencies: ['EUR'], keep: /\b(monetary policy|interest rates?|policy decisions?|press conference|account of the|lagarde|economic bulletin|financial stability review|inflation|staff projections|asset purchase)\b/i },
  ];
  const out = [];
  for (const f of feeds) {
    const xml = await fetchText(f.url, { timeoutMs: 15000 }).catch(() => null);
    if (!xml) continue;
    for (const it of parseRss(xml).slice(0, 25)) {
      const at = new Date(it.date);
      if (!it.title || !it.link || Number.isNaN(at.getTime())) continue;
      if (!f.keep.test(`${it.title} ${it.description ?? ''}`)) continue;
      out.push({ source: f.source, provider: f.provider, externalId: `${f.source}:${it.guid || it.link}`, headline: it.title.slice(0, 300), summary: it.description?.slice(0, 1200) || null, url: it.link, imageUrl: null, publishedAt: at, official: true, defaultCurrencies: f.currencies });
    }
  }
  return out;
}

// Fetch, tag and store. Idempotent (externalId is unique).
export async function ingestNews() {
  const key = await finnhubKey();
  const items = [...(key ? await fetchFinnhub(key) : []), ...(await fetchOfficial())];
  const rows = [];
  let crypto = 0;
  for (const it of items.sort((a, b) => b.publishedAt - a.publishedAt)) {
    // Links from outside feeds are shown to traders: web links only (never javascript: or data:).
    if (!isWebUrl(it.url)) continue;
    if (it.imageUrl && !/^https:\/\//i.test(it.imageUrl)) it.imageUrl = null;
    const tags = tagNews(`${it.headline} ${it.summary ?? ''}`, { defaultCurrencies: it.defaultCurrencies ?? [] });
    const headlineAssets = Object.entries(ASSET_RX).filter(([, r]) => r.test(it.headline)).map(([s]) => s);
    if (!it.official) {
      if (it.category === 'crypto') {
        // Crypto wires are high-volume: keep a few that name BTC/ETH up front.
        if (!headlineAssets.some((s) => s === 'BTCUSD' || s === 'ETHUSD') || crypto >= 6) continue;
        crypto += 1;
      } else if (!(tags.currencies.length && tags.topics.length) && !headlineAssets.length) continue;
    }
    rows.push({ source: it.source, provider: it.provider, externalId: it.externalId, headline: it.headline, summary: it.summary, url: it.url, imageUrl: it.imageUrl, publishedAt: it.publishedAt, currencies: tags.currencies, instruments: tags.instruments, topics: tags.topics, official: it.official });
  }
  const { count } = rows.length ? await prisma.newsItem.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
  return { fetched: items.length, stored: count, finnhub: !!key };
}

// At most one ingest per 20 minutes, shared across instances.
export async function ensureFreshNews() {
  const { data } = await cachedSource('community:news:ingest', 20 * 60 * 1000, async () => ({ at: new Date().toISOString(), ...(await ingestNews()) }));
  return data;
}
