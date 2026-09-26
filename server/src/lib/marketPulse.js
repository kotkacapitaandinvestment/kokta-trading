// Real market context for Market Intelligence, the dashboard and Kotka AI:
// end-of-day prices and volatility from Massive, and upcoming releases from
// official calendars. Nothing here is sampled or simulated; anything that
// can't be fetched is reported as unavailable.

import { prisma } from './prisma.js';
import { decryptSecret } from './crypto.js';
import { getDailyBarsCached, MassiveRateLimited } from './massive.js';
import { cachedSource, HOUR } from './research/cache.js';
import { CALENDAR_SOURCES, fetchFomcMeetings, fetchEcbMeetings, fetchBlsReleases, fetchBeaReleases, fetchEurostatReleases } from './research/sources/calendars.js';

export const PULSE_INSTRUMENTS = [
  { symbol: 'EUR/USD', ticker: 'C:EURUSD', market: 'Forex', research: 'EURUSD', decimals: 4 },
  { symbol: 'GBP/USD', ticker: 'C:GBPUSD', market: 'Forex', research: 'GBPUSD', decimals: 4 },
  { symbol: 'USD/JPY', ticker: 'C:USDJPY', market: 'Forex', research: 'USDJPY', decimals: 2 },
  { symbol: 'XAU/USD', ticker: 'C:XAUUSD', market: 'Metals', decimals: 2 },
  { symbol: 'NAS100', ticker: 'I:NDX', market: 'Indices', decimals: 1 },
  { symbol: 'BTC/USD', ticker: 'X:BTCUSD', market: 'Crypto', decimals: 0 },
];

const ATR_DAYS = 14;
const round = (v, d) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

async function massiveKey() {
  const row = await prisma.integration.findUnique({ where: { provider: 'massive' } }).catch(() => null);
  if (!row?.enabled || !row.secretCipher) return null;
  try {
    return decryptSecret(row.secretCipher).trim() || null;
  } catch {
    return null;
  }
}

function summarize(inst, bars) {
  if (bars.length < ATR_DAYS + 1) return null;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const window = bars.slice(-(ATR_DAYS + 1));
  const trs = window.slice(1).map((b, i) => Math.max(b.h - b.l, Math.abs(b.h - window[i].c), Math.abs(b.l - window[i].c)));
  const atr = trs.reduce((s, v) => s + v, 0) / trs.length;
  const atrPct = (atr / last.c) * 100;
  const month = bars.slice(-21);
  const high = Math.max(...month.map((b) => b.h));
  const low = Math.min(...month.map((b) => b.l));
  return {
    close: round(last.c, inst.decimals + 1),
    closeDate: new Date(last.t).toISOString().slice(0, 10),
    changePct: round((last.c / prev.c - 1) * 100, 2),
    atr: round(atr, inst.decimals + 1),
    atrPct: round(atrPct, 2),
    // Same thresholds as before: ATR as a share of price.
    regime: atrPct > 1.5 ? 'High' : atrPct > 0.7 ? 'Elevated' : 'Normal',
    range: { high: round(high, inst.decimals + 1), low: round(low, inst.decimals + 1), position: high > low ? round((last.c - low) / (high - low), 2) : null },
    closes: bars.slice(-30).map((b) => round(b.c, inst.decimals + 1)),
  };
}

export async function getMarketPulse() {
  const apiKey = await massiveKey();
  if (!apiKey) {
    return { configured: false, instruments: PULSE_INSTRUMENTS.map(({ symbol, market, research }) => ({ symbol, market, research: research ?? null, available: false, reason: 'not_configured' })) };
  }
  // Sequential on purpose: the per-instance call gate in massive.js then
  // stops cleanly at the provider's limit instead of firing a burst.
  const instruments = [];
  for (const inst of PULSE_INSTRUMENTS) {
    const base = { symbol: inst.symbol, market: inst.market, research: inst.research ?? null, decimals: inst.decimals };
    try {
      const { bars, fetchedAt } = await getDailyBarsCached(apiKey, inst.ticker, { cachedSource });
      const summary = summarize(inst, bars);
      instruments.push(summary ? { ...base, available: true, fetchedAt, ...summary } : { ...base, available: false, reason: 'insufficient_history' });
    } catch (err) {
      instruments.push({ ...base, available: false, reason: err instanceof MassiveRateLimited ? 'rate_limited' : 'fetch_failed' });
    }
  }
  return {
    configured: true,
    source: { name: 'Massive (formerly Polygon.io), end-of-day bars', url: 'https://massive.com' },
    instruments,
  };
}

// ── Official release calendar ──────────────────────────────────────────────
// Same fetchers and cache keys as the research engine, so a research run and
// this view share one download per source per day.
const CALENDARS = [
  { key: 'fomc', currency: 'USD', kind: 'policy', fetch: fetchFomcMeetings },
  { key: 'bls', currency: 'USD', kind: 'release', fetch: fetchBlsReleases },
  { key: 'bea', currency: 'USD', kind: 'release', fetch: fetchBeaReleases },
  { key: 'ecb', currency: 'EUR', kind: 'policy', fetch: fetchEcbMeetings },
  { key: 'eurostat', currency: 'EUR', kind: 'release', fetch: (from, to) => fetchEurostatReleases(from, to) },
];

export async function getOfficialCalendar({ days = 14 } = {}) {
  const now = new Date();
  const horizonEnd = new Date(now.getTime() + 45 * 24 * HOUR);
  const until = new Date(now.getTime() + days * 24 * HOUR);
  const today = now.toISOString().slice(0, 10);

  const results = await Promise.all(
    CALENDARS.map(async (c) => {
      try {
        const fetcher = c.key === 'eurostat' ? () => c.fetch(new Date(now.getTime() - 24 * HOUR), horizonEnd) : c.fetch;
        const { data, fetchedAt } = await cachedSource(`calendar:${c.key}:${today}`, 12 * HOUR, fetcher);
        return { c, events: data ?? [], fetchedAt, ok: true };
      } catch (err) {
        return { c, events: [], ok: false, error: String(err.message).slice(0, 120) };
      }
    }),
  );

  const events = results
    .flatMap(({ c, events }) =>
      events.map((e) => ({
        date: e.date,
        dateOnly: !!e.dateOnly,
        currency: c.currency,
        title: e.event ?? e.label,
        kind: c.kind,
        category: e.category ?? 'policy',
        importance: e.importance ?? 'High',
        referencePeriod: e.referencePeriod ?? null,
        withProjections: !!e.withProjections,
        source: { key: c.key, name: CALENDAR_SOURCES[c.key].name, url: CALENDAR_SOURCES[c.key].url },
      })),
    )
    .filter((e) => {
      const t = new Date(e.date).getTime();
      // Date-only entries stay listed for the whole of their day.
      return t <= until.getTime() && (e.dateOnly ? t >= now.getTime() - 12 * HOUR : t >= now.getTime() - 2 * HOUR);
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    days,
    events,
    sources: results.map(({ c, ok, fetchedAt, error }) => ({ key: c.key, currency: c.currency, name: CALENDAR_SOURCES[c.key].name, url: CALENDAR_SOURCES[c.key].url, ok, fetchedAt: fetchedAt ?? null, error: error ?? null })),
    coverage: ['USD', 'EUR'],
  };
}
