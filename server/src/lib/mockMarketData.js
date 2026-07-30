// Illustrative fallback data, shown only when Finnhub isn't configured or a live fetch fails.

export const watchlist = [
  { symbol: 'EUR/USD', market: 'Forex', price: 1.0842, change: 0.12, live: false },
  { symbol: 'XAU/USD', market: 'Metals', price: 2412.3, change: -0.34, live: false },
  { symbol: 'US30', market: 'Indices', price: 39872.5, change: 0.45, live: false },
  { symbol: 'NAS100', market: 'Indices', price: 18342.1, change: 0.78, live: false },
  { symbol: 'BTC/USD', market: 'Crypto', price: 67230, change: 1.92, live: false },
  { symbol: 'GBP/JPY', market: 'Forex', price: 198.44, change: -0.21, live: false },
];

export const economicEvents = [
  { time: '08:30', currency: 'USD', impact: 'high', title: 'Non-Farm Payrolls', forecast: '185K', previous: '175K' },
  { time: '10:00', currency: 'EUR', impact: 'medium', title: 'ECB President Speech', forecast: '—', previous: '—' },
  { time: '12:30', currency: 'GBP', impact: 'high', title: 'CPI y/y', forecast: '3.2%', previous: '3.4%' },
  { time: '14:00', currency: 'USD', impact: 'medium', title: 'ISM Services PMI', forecast: '52.1', previous: '51.4' },
];

export const marketSentiment = {
  overall: 62,
  breakdown: [
    { market: 'EUR/USD', sentiment: 55 },
    { market: 'XAU/USD', sentiment: 71 },
    { market: 'US Indices', sentiment: 64 },
    { market: 'BTC/USD', sentiment: 58 },
  ],
};
