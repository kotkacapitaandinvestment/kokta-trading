const MASSIVE_BASE_URL = 'https://api.massive.com';

async function massiveGet(apiKey, path) {
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
