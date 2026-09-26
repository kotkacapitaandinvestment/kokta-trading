const MASSIVE_BASE_URL = 'https://api.massive.com';

export async function massiveGet(apiKey, path) {
  const res = await fetch(`${MASSIVE_BASE_URL}${path}${path.includes('?') ? '&' : '?'}apiKey=${apiKey}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.status === 'NOT_AUTHORIZED' || data?.status === 'ERROR') {
    throw new Error(data?.message || `Massive API error (${res.status})`);
  }
  return data;
}

export async function massiveTestConnection(apiKey) {
  const data = await massiveGet(apiKey, '/v2/aggs/ticker/C:EURUSD/prev');
  const bar = data?.results?.[0];
  if (!bar) throw new Error('Unexpected response from Massive.');
  return `Connected — EUR/USD previous close: ${bar.c}`;
}

// Generic historical bar fetch. Returns raw {t,o,h,l,c,v} bar objects.
export async function fetchHistoricalBars(apiKey, ticker, multiplier, unit, from, to) {
  const data = await massiveGet(apiKey, `/v2/aggs/ticker/${ticker}/range/${multiplier}/${unit}/${from}/${to}`);
  return data?.results ?? [];
}

// Massive's free tier allows 5 requests a minute and serves end-of-day bars.
// Everything that needs daily history (market pulse, research spot
// performance) goes through this one cached fetch: ~100 days of daily bars
// per ticker, cached for the day in the shared source cache, with a
// per-instance gate so a burst doesn't trip the provider's limit.
const recentCalls = [];
const CALLS_PER_MINUTE = 5;

export class MassiveRateLimited extends Error {}

function takeCallSlot() {
  const now = Date.now();
  while (recentCalls.length && now - recentCalls[0] > 60000) recentCalls.shift();
  if (recentCalls.length >= CALLS_PER_MINUTE) throw new MassiveRateLimited('Massive rate limit reached; try again in a minute.');
  recentCalls.push(now);
}

export async function getDailyBarsCached(apiKey, ticker, { cachedSource, ttlMs = 6 * 60 * 60 * 1000 } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, fetchedAt } = await cachedSource(dailyBarsKey(ticker), ttlMs, async () => {
    takeCallSlot();
    const from = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const bars = await fetchHistoricalBars(apiKey, ticker, 1, 'day', from, today);
    if (!bars.length) throw new Error(`No daily bars returned for ${ticker}.`);
    return bars.map(({ t, o, h, l, c }) => ({ t, o, h, l, c }));
  });
  return { bars: data, fetchedAt };
}

export const dailyBarsKey = (ticker, day = new Date()) => `massive:daily100:${ticker}:${day.toISOString().slice(0, 10)}`;

// Today's bars if cached, else the most recent earlier day's (within 4 days),
// without calling Massive. For feeds and lists that must not spend quota.
export async function peekDailyBars(ticker, { peekSource }) {
  for (let back = 0; back < 4; back++) {
    const hit = await peekSource(dailyBarsKey(ticker, new Date(Date.now() - back * 86400000)));
    if (hit?.data?.length) return { bars: hit.data, fetchedAt: hit.fetchedAt, stale: back > 0 };
  }
  return null;
}
