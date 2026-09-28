// The instruments Kotka supports, in one place. Market rooms, the market
// pulse, news tagging and event mapping all read from here.
//
// ticker: the Massive symbol for end-of-day bars, or null when the current
// market-data plan doesn't include it (the room still exists for discussion;
// prices show as unavailable). research: the Fundamental Research subject.
// currencies: the economies whose data and events move it.

export const INSTRUMENTS = [
  { symbol: 'EURUSD', display: 'EUR/USD', name: 'Euro / US Dollar', market: 'Forex', ticker: 'C:EURUSD', decimals: 5, research: 'EURUSD', currencies: ['EUR', 'USD'], pulse: true },
  { symbol: 'GBPUSD', display: 'GBP/USD', name: 'British Pound / US Dollar', market: 'Forex', ticker: 'C:GBPUSD', decimals: 5, research: 'GBPUSD', currencies: ['GBP', 'USD'], pulse: true },
  { symbol: 'USDJPY', display: 'USD/JPY', name: 'US Dollar / Japanese Yen', market: 'Forex', ticker: 'C:USDJPY', decimals: 3, research: 'USDJPY', currencies: ['USD', 'JPY'], pulse: true },
  { symbol: 'GBPJPY', display: 'GBP/JPY', name: 'British Pound / Japanese Yen', market: 'Forex', ticker: 'C:GBPJPY', decimals: 3, research: 'GBPJPY', currencies: ['GBP', 'JPY'] },
  { symbol: 'AUDUSD', display: 'AUD/USD', name: 'Australian Dollar / US Dollar', market: 'Forex', ticker: 'C:AUDUSD', decimals: 5, research: 'AUDUSD', currencies: ['AUD', 'USD'] },
  { symbol: 'USDCAD', display: 'USD/CAD', name: 'US Dollar / Canadian Dollar', market: 'Forex', ticker: 'C:USDCAD', decimals: 5, research: 'USDCAD', currencies: ['USD', 'CAD'] },
  { symbol: 'USDCHF', display: 'USD/CHF', name: 'US Dollar / Swiss Franc', market: 'Forex', ticker: 'C:USDCHF', decimals: 5, research: 'USDCHF', currencies: ['USD', 'CHF'] },
  { symbol: 'NZDUSD', display: 'NZD/USD', name: 'New Zealand Dollar / US Dollar', market: 'Forex', ticker: 'C:NZDUSD', decimals: 5, research: 'NZDUSD', currencies: ['NZD', 'USD'] },
  { symbol: 'EURGBP', display: 'EUR/GBP', name: 'Euro / British Pound', market: 'Forex', ticker: 'C:EURGBP', decimals: 5, research: 'EURGBP', currencies: ['EUR', 'GBP'] },
  { symbol: 'EURJPY', display: 'EUR/JPY', name: 'Euro / Japanese Yen', market: 'Forex', ticker: 'C:EURJPY', decimals: 3, research: 'EURJPY', currencies: ['EUR', 'JPY'] },
  { symbol: 'XAUUSD', display: 'XAU/USD', name: 'Gold / US Dollar', market: 'Metals', ticker: 'C:XAUUSD', decimals: 2, currencies: ['USD'], topics: ['gold'], pulse: true },
  { symbol: 'XAGUSD', display: 'XAG/USD', name: 'Silver / US Dollar', market: 'Metals', ticker: 'C:XAGUSD', decimals: 3, currencies: ['USD'], topics: ['silver'] },
  { symbol: 'BTCUSD', display: 'BTC/USD', name: 'Bitcoin / US Dollar', market: 'Crypto', ticker: 'X:BTCUSD', decimals: 0, currencies: ['USD'], topics: ['bitcoin', 'crypto'], pulse: true },
  { symbol: 'ETHUSD', display: 'ETH/USD', name: 'Ether / US Dollar', market: 'Crypto', ticker: 'X:ETHUSD', decimals: 1, currencies: ['USD'], topics: ['ethereum', 'crypto'] },
  { symbol: 'NAS100', display: 'NAS100', name: 'Nasdaq 100', market: 'Indices', ticker: 'I:NDX', decimals: 1, currencies: ['USD'], topics: ['us-stocks'], pulse: true },
  // Not in the current Massive plan (403). Rooms work; prices are unavailable.
  { symbol: 'SPX500', display: 'S&P 500', name: 'S&P 500', market: 'Indices', ticker: null, dataNote: 'We don’t have S&P 500 prices yet. The room and chat work as normal.', decimals: 1, currencies: ['USD'], topics: ['us-stocks'] },
  { symbol: 'US30', display: 'US30', name: 'Dow Jones Industrial Average', market: 'Indices', ticker: null, dataNote: 'We don’t have Dow Jones prices yet. The room and chat work as normal.', decimals: 0, currencies: ['USD'], topics: ['us-stocks'] },
];

const BY_SYMBOL = new Map(INSTRUMENTS.map((i) => [i.symbol, i]));

export function instrument(symbol) {
  if (!symbol) return null;
  const key = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return BY_SYMBOL.get(key) ?? null;
}

export const MARKETS = ['Forex', 'Metals', 'Crypto', 'Indices'];

export function instrumentsForCurrency(code) {
  return INSTRUMENTS.filter((i) => i.currencies.includes(code)).map((i) => i.symbol);
}

// Public shape for API responses.
export function instrumentView(i) {
  return { symbol: i.symbol, display: i.display, name: i.name, market: i.market, decimals: i.decimals, research: i.research ?? null, currencies: i.currencies, hasData: !!i.ticker, dataNote: i.dataNote ?? null };
}

// Market hours, from the clock. Weekends and the standard sessions only:
// public holidays are not accounted for, and the UI says so.
const DAY_MS = 24 * 60 * 60 * 1000;

function nyOffsetHours(d) {
  const y = d.getUTCFullYear();
  const nthSunday = (month, n) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  };
  const start = Date.UTC(y, 2, nthSunday(2, 2), 7);
  const end = Date.UTC(y, 10, nthSunday(10, 1), 6);
  return d.getTime() >= start && d.getTime() < end ? -4 : -5;
}

export function marketStatus(inst, now = new Date()) {
  if (!inst) return null;
  if (inst.market === 'Crypto') return { open: true, label: 'Open 24/7', session: null };
  const ny = new Date(now.getTime() + nyOffsetHours(now) * 3600000);
  const day = ny.getUTCDay();
  const minutes = ny.getUTCHours() * 60 + ny.getUTCMinutes();
  if (inst.market === 'Indices') {
    const open = day >= 1 && day <= 5 && minutes >= 570 && minutes < 960;
    return { open, label: open ? 'Main session open' : 'Main session closed', session: open ? 'New York' : null, note: 'Regular New York trading hours. Holidays aren’t shown.' };
  }
  // FX and metals: Sunday 17:00 to Friday 17:00 New York time.
  const closed = day === 6 || (day === 5 && minutes >= 1020) || (day === 0 && minutes < 1020);
  if (closed) return { open: false, label: 'Closed for the weekend', session: null, note: 'Reopens Sunday at 5pm New York time.' };
  const utcH = now.getUTCHours();
  const sessions = [];
  if (utcH >= 22 || utcH < 7) sessions.push('Sydney');
  if (utcH >= 0 && utcH < 9) sessions.push('Tokyo');
  if (utcH >= 7 && utcH < 16) sessions.push('London');
  const nyH = ny.getUTCHours();
  if (nyH >= 8 && nyH < 17) sessions.push('New York');
  return { open: true, label: 'Open', session: sessions.join(' + ') || null, note: 'Session times are approximate. Holidays aren’t shown.' };
}

export { DAY_MS };
