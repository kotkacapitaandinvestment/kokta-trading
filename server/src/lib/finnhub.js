const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

async function finnhubGet(apiKey, path, params = {}) {
  const url = new URL(`${FINNHUB_BASE_URL}${path}`);
  url.searchParams.set('token', apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Finnhub API error (${res.status})`);
  }
  return data;
}

export async function finnhubTestConnection(apiKey) {
  const data = await finnhubGet(apiKey, '/quote', { symbol: 'AAPL' });
  if (typeof data?.c !== 'number') throw new Error('Unexpected response from Finnhub.');
  return `Connected — AAPL quote: $${data.c}`;
}

// display symbol -> [Finnhub symbol, market label]
export const WATCHLIST_SYMBOLS = {
  'EUR/USD': ['OANDA:EUR_USD', 'Forex'],
  'GBP/JPY': ['OANDA:GBP_JPY', 'Forex'],
  'XAU/USD': ['OANDA:XAU_USD', 'Metals'],
  'US30': ['^DJI', 'Indices'],
  'NAS100': ['^NDX', 'Indices'],
  'BTC/USD': ['BINANCE:BTCUSDT', 'Crypto'],
};

export async function fetchWatchlistQuotes(apiKey) {
  const entries = Object.entries(WATCHLIST_SYMBOLS);
  const results = await Promise.allSettled(
    entries.map(([display, [finnhubSymbol]]) => finnhubGet(apiKey, '/quote', { symbol: finnhubSymbol })),
  );

  const items = [];
  let anySucceeded = false;
  results.forEach((result, i) => {
    const [display, [, market]] = entries[i];
    if (result.status === 'fulfilled' && typeof result.value?.c === 'number' && result.value.c > 0) {
      anySucceeded = true;
      const { c: price, dp: changePct } = result.value;
      items.push({ symbol: display, market, price, change: Math.round((changePct ?? 0) * 100) / 100, live: true });
    } else {
      items.push({ symbol: display, market, price: null, change: null, live: false });
    }
  });

  return { items, anySucceeded };
}

export async function fetchEconomicCalendar(apiKey) {
  const today = new Date().toISOString().slice(0, 10);
  const data = await finnhubGet(apiKey, '/calendar/economic', { from: today, to: today });
  const events = (data?.economicCalendar ?? data?.events ?? [])
    .filter((e) => e.impact === 'high' || e.impact === 'medium')
    .slice(0, 6)
    .map((e) => ({
      time: e.time ? e.time.slice(11, 16) : '—',
      currency: e.country ?? e.currency ?? '—',
      title: e.event ?? 'Economic event',
      forecast: e.estimate ?? '—',
      previous: e.prev ?? '—',
      impact: e.impact ?? 'medium',
    }));
  return events;
}
