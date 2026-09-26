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
