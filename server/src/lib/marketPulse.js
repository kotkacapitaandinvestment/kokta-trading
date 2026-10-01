// Real market context for Market Intelligence, the dashboard and Kotka AI:
// end-of-day prices and volatility from Massive, and upcoming releases from
// official calendars. Nothing here is sampled or simulated; anything that
// can't be fetched is reported as unavailable.

import { prisma } from './prisma.js';
import { decryptSecret } from './crypto.js';
import { getDailyBarsCached, peekDailyBars, MassiveRateLimited } from './massive.js';
import { cachedSource, peekSource, HOUR } from './research/cache.js';
import { CALENDAR_SOURCES, fetchFomcMeetings, fetchEcbMeetings, fetchBlsReleases, fetchBeaReleases, fetchEurostatReleases } from './research/sources/calendars.js';
import { INSTRUMENTS, instrument as findInstrument } from './instruments.js';

// The market-pulse subset, from the shared instrument registry.
export const PULSE_INSTRUMENTS = INSTRUMENTS.filter((i) => i.pulse);

const ATR_DAYS = 14;
const round = (v, d) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;

export async function massiveKey() {
  const row = await prisma.integration.findUnique({ where: { provider: 'massive' } }).catch(() => null);
  if (!row?.enabled || !row.secretCipher) return null;
  try {
    return decryptSecret(row.secretCipher).trim() || null;
  } catch {
    return null;
  }
}

// Everything derived from daily bars. All values are computed from the bars;
// nothing is estimated.
export function summarizeBars(inst, bars) {
  if (!bars || bars.length < ATR_DAYS + 1) return null;
  const d = inst.decimals + 1;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const window = bars.slice(-(ATR_DAYS + 1));
  const trs = window.slice(1).map((b, i) => Math.max(b.h - b.l, Math.abs(b.h - window[i].c), Math.abs(b.l - window[i].c)));
  const atr = mean(trs);
  const atrPct = (atr / last.c) * 100;
  const month = bars.slice(-21);
  const high = Math.max(...month.map((b) => b.h));
  const low = Math.min(...month.map((b) => b.l));
  const changePct = (last.c / prev.c - 1) * 100;
  const sma20 = bars.length >= 20 ? mean(bars.slice(-20).map((b) => b.c)) : null;
  const sma50 = bars.length >= 50 ? mean(bars.slice(-50).map((b) => b.c)) : null;
  const position = high > low ? (last.c - low) / (high - low) : null;
  const third = position == null ? null : position >= 2 / 3 ? 'upper third' : position <= 1 / 3 ? 'lower third' : 'middle third';
  return {
    close: round(last.c, d),
    closeDate: new Date(last.t).toISOString().slice(0, 10),
    changePct: round(changePct, 2),
    // A move bigger than the 14-day average true range is unusual for it.
    unusualMove: Math.abs(last.c - prev.c) >= atr,
    session: { open: round(last.o, d), high: round(last.h, d), low: round(last.l, d) },
    atr: round(atr, d),
    atrPct: round(atrPct, 2),
    regime: atrPct > 1.5 ? 'High' : atrPct > 0.7 ? 'Elevated' : 'Normal',
    range: { high: round(high, d), low: round(low, d), position: round(position, 2) },
    technical: {
      sma20: round(sma20, d),
      sma50: round(sma50, d),
      vsSma20: sma20 == null ? null : last.c >= sma20 ? 'above' : 'below',
      vsSma50: sma50 == null ? null : last.c >= sma50 ? 'above' : 'below',
      rangeThird: third,
    },
    closes: bars.slice(-30).map((b) => round(b.c, d)),
    history: bars.map((b) => ({ t: new Date(b.t).toISOString().slice(0, 10), o: round(b.o, d), h: round(b.h, d), l: round(b.l, d), c: round(b.c, d) })),
  };
}

// One instrument's market data. fetch=false never calls Massive (feeds and
// lists); fetch=true may, within the rate limit, falling back to the most
// recent cached day.
export async function instrumentMarketData(symbol, { fetch = true, apiKey } = {}) {
  const inst = findInstrument(symbol);
  if (!inst) return null;
  const base = { symbol: inst.symbol, display: inst.display, market: inst.market, decimals: inst.decimals };
  if (!inst.ticker) return { ...base, available: false, reason: 'not_in_plan', note: inst.dataNote };
  let result = null;
  if (fetch) {
    const key = apiKey === undefined ? await massiveKey() : apiKey;
    if (!key) return { ...base, available: false, reason: 'not_configured' };
    try {
      result = await getDailyBarsCached(key, inst.ticker, { cachedSource });
    } catch (err) {
      result = await peekDailyBars(inst.ticker, { peekSource });
      if (!result) return { ...base, available: false, reason: err instanceof MassiveRateLimited ? 'rate_limited' : 'fetch_failed' };
    }
  } else {
    result = await peekDailyBars(inst.ticker, { peekSource });
    if (!result) return { ...base, available: false, reason: 'not_loaded' };
  }
  const summary = summarizeBars(inst, result.bars);
  if (!summary) return { ...base, available: false, reason: 'insufficient_history' };
  return { ...base, available: true, fetchedAt: result.fetchedAt, stale: !!result.stale, ...summary };
}

const slim = ({ history, ...rest }) => rest; // eslint-disable-line no-unused-vars

export async function getMarketPulse() {
  const apiKey = await massiveKey();
  if (!apiKey) {
    return { configured: false, instruments: PULSE_INSTRUMENTS.map(({ symbol, display, market, research }) => ({ symbol: display, key: symbol, market, research: research ?? null, available: false, reason: 'not_configured' })) };
  }
  // Sequential on purpose: the per-instance call gate in massive.js then
  // stops cleanly at the provider's limit instead of firing a burst.
  const instruments = [];
  for (const inst of PULSE_INSTRUMENTS) {
    const data = await instrumentMarketData(inst.symbol, { apiKey });
    instruments.push({ ...slim(data), symbol: inst.display, key: inst.symbol, research: inst.research ?? null });
  }
  return {
    configured: true,
    source: { name: 'Daily closing prices', url: 'https://massive.com' },
    instruments,
  };
}

// Warms the daily-bar cache for instruments that don't have today's bars
// yet, a few per call (the scheduled job calls it hourly).
export async function warmInstrumentBars({ max = 4 } = {}) {
  const apiKey = await massiveKey();
  if (!apiKey) return { warmed: 0 };
  let warmed = 0;
  for (const inst of INSTRUMENTS) {
    if (!inst.ticker || warmed >= max) continue;
    const today = await peekSource(`massive:daily100:${inst.ticker}:${new Date().toISOString().slice(0, 10)}`);
    if (today && !today.expired) continue;
    try {
      await getDailyBarsCached(apiKey, inst.ticker, { cachedSource });
      warmed += 1;
    } catch {
      break; // rate limited or failing: try again next run
    }
  }
  return { warmed };
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
