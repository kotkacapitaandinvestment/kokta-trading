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

// display symbol -> [Massive ticker, market label]
export const MASSIVE_SYMBOLS = {
  'EUR/USD': ['C:EURUSD', 'Forex'],
  'GBP/JPY': ['C:GBPJPY', 'Forex'],
  'XAU/USD': ['C:XAUUSD', 'Metals'],
  'NAS100': ['I:NDX', 'Indices'],
  'BTC/USD': ['X:BTCUSD', 'Crypto'],
};

function computeATR(bars) {
  if (bars.length < 2) return null;
  const trueRanges = [];
  for (let i = 1; i < bars.length; i++) {
    const { h, l } = bars[i];
    const prevClose = bars[i - 1].c;
    trueRanges.push(Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose)));
  }
  return trueRanges.reduce((s, v) => s + v, 0) / trueRanges.length;
}

function regimeFor(atr, avgPrice) {
  const atrPct = (atr / avgPrice) * 100;
  if (atrPct > 1.5) return 'High';
  if (atrPct > 0.7) return 'Elevated';
  return 'Normal';
}

export async function fetchMassiveVolatility(apiKey, days = 14) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const entries = Object.entries(MASSIVE_SYMBOLS);

  const results = await Promise.allSettled(
    entries.map(([, [ticker]]) => massiveGet(apiKey, `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`)),
  );

  const items = [];
  results.forEach((result, i) => {
    const [display] = entries[i];
    const bars = result.status === 'fulfilled' ? result.value?.results : null;
    const atr = bars && bars.length >= 2 ? computeATR(bars) : null;
    if (atr !== null) {
      const avgPrice = bars[bars.length - 1].c;
      items.push({ symbol: display, atr: Math.round(atr * 10000) / 10000, regime: regimeFor(atr, avgPrice), live: true });
    } else {
      items.push({ symbol: display, atr: null, regime: null, live: false });
    }
  });

  return items;
}

// Generic historical bar fetch, used by both volatility (daily) and the
// trading simulator (intraday). Returns raw {t,o,h,l,c,v} bar objects.
export async function fetchHistoricalBars(apiKey, ticker, multiplier, unit, from, to) {
  const data = await massiveGet(apiKey, `/v2/aggs/ticker/${ticker}/range/${multiplier}/${unit}/${from}/${to}`);
  return data?.results ?? [];
}

export async function fetchMassiveQuotes(apiKey) {
  const entries = Object.entries(MASSIVE_SYMBOLS);
  const results = await Promise.allSettled(
    entries.map(([, [ticker]]) => massiveGet(apiKey, `/v2/aggs/ticker/${ticker}/prev`)),
  );

  const items = [];
  results.forEach((result, i) => {
    const [display, [, market]] = entries[i];
    const bar = result.status === 'fulfilled' ? result.value?.results?.[0] : null;
    if (bar && typeof bar.c === 'number' && typeof bar.o === 'number' && bar.o > 0) {
      const change = Math.round(((bar.c - bar.o) / bar.o) * 10000) / 100;
      const price = Math.round(bar.c * 10000) / 10000;
      items.push({ symbol: display, market, price, change, live: true });
    } else {
      items.push({ symbol: display, market, price: null, change: null, live: false });
    }
  });

  return items;
}
