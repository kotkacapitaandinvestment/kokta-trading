// Link that opens Kotka AI in a new conversation and asks straight away.
// market: the Kotka AI market selector (Forex, Gold, Indices, Crypto, Stocks).
export function askKotkaLink(prompt, market) {
  const q = new URLSearchParams({ prompt, send: '1' });
  if (market) q.set('market', market);
  return `/app/ai?${q.toString()}`;
}

// Kotka AI's market selector for an instrument's market group.
export const aiMarketFor = (group) => ({ Forex: 'Forex', Metals: 'Gold', Indices: 'Indices', Crypto: 'Crypto' })[group] ?? 'Forex';
