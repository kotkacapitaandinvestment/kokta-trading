// Decides which Kotka data a question needs and fetches it before the model
// answers. Hosted models don't reliably choose to call tools, and one that
// answers a data question from memory invents figures, so data questions are
// grounded here deterministically. The model can still call more tools.

import { INSTRUMENTS } from './instruments.js';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
const CURRENCY_WORDS = {
  USD: /\b(us ?dollar|greenback|the dollar|dollar|fed|fomc|federal reserve|powell)\b/,
  EUR: /\b(euro|eurozone|euro area|ecb|lagarde)\b/,
  GBP: /\b(pound|sterling|cable|boe|bank of england)\b/,
  JPY: /\b(yen|boj|bank of japan)\b/,
  AUD: /\b(aussie|australian dollar|rba|reserve bank of australia)\b/,
  CAD: /\b(loonie|canadian dollar|boc|bank of canada)\b/,
  CHF: /\b(swiss franc|franc|swissy|snb|swiss national bank)\b/,
  NZD: /\b(kiwi|new zealand dollar|rbnz)\b/,
};
const INSTRUMENT_WORDS = {
  XAUUSD: /\b(gold|xau)\b/,
  XAGUSD: /\b(silver|xag)\b/,
  BTCUSD: /\b(bitcoin|btc)\b/,
  ETHUSD: /\b(ether|ethereum|eth)\b/,
  NAS100: /\b(nasdaq|nas ?100|ndx|tech stocks)\b/,
  SPX500: /\b(s&p|s and p|spx|sp500)\b/,
  US30: /\b(dow|us ?30|djia)\b/,
};

const INTENT = {
  calendar: /\b(calendar|events?|releases?|data (?:this|next) week|cpi|nfp|payrolls?|fomc|pce|gdp|jolts|jobless|claims|hicp|pmi|retail sales|rate decision|meeting|scheduled|this week|next week|tomorrow|upcoming|coming up)\b/,
  ranking: /\b(strongest|weakest|rank(?:ing)?|best|worst|compare|comparison|which currenc(?:y|ies)|all currencies|overview of (?:the )?research|coverage)\b/,
  research: /\b(fundamental|research|report|verdict|score|central bank|policy|rates?|interest|inflation|growth|hawkish|dovish|stance|imf|differential|outlook|macro|economy|why is|driv(?:e|es|ing)|changed|what could change|bias)\b/,
  price: /\b(price|close|closed|volatil\w*|atr|range|mov(?:e|ed|ing)|trend\w*|technical|moving average|sma|levels?|structure|perform\w*|rall\w*|drop\w*|fell|up|down|high|low|market)\b/,
  news: /\b(news|headlines?|happening|stor(?:y|ies)|announc\w*)\b/,
  community: /\b(sentiment|community|traders think|people think|crowd|ideas?|bullish|bearish|positioning)\b/,
  crypto: /\b(crypto|bitcoin|btc|ether|ethereum|hash ?rate|dominance|market cap|supply|halving)\b/,
  today: /\b(my day|checklist|risk (?:rules|limit|used)|daily (?:loss )?limit|can i (?:still )?trade|should i stop|(?:am i|my|i)\b[^.?!]{0,30}\btoday)\b/,
  stats: /\b(my (?:stats|performance|win rate|discipline|scores?|results|edge|expectancy)|how am i doing|how (?:have|did) i (?:done|do)|am i improving|analytics)\b/,
  trades: /\b(my\b[^.?!]{0,25}\b(?:trades?|journal|entries|losses|wins|mistakes)|i (?:took|lost|won)|journal)\b/,
  positions: /\b(open positions?|my positions?|currently in|running trades?)\b/,
  snapshot: /\b(markets? (?:today|now|overview)|all markets|every market|what'?s moving|biggest move\w*|most volatile|market pulse)\b/,
};

function mentions(text) {
  const t = ` ${text.toLowerCase()} `;
  const upper = text.toUpperCase();
  const instruments = new Set();
  const currencies = new Set();
  for (const inst of INSTRUMENTS) {
    const compact = inst.symbol;
    const slash = inst.display.toUpperCase();
    if (new RegExp(`\\b${compact}\\b`).test(upper.replace(/[^A-Z0-9 ]/g, ' ')) || upper.includes(slash)) instruments.add(inst.symbol);
  }
  for (const [sym, re] of Object.entries(INSTRUMENT_WORDS)) if (re.test(t)) instruments.add(sym);
  // "Australian dollar" etc. must not also read as the US dollar.
  const forUsd = t.replace(/australian dollar|canadian dollar|new zealand dollar/g, ' ');
  for (const code of CURRENCIES) {
    if (new RegExp(`\\b${code}\\b`).test(upper)) currencies.add(code);
    if (CURRENCY_WORDS[code].test(code === 'USD' ? forUsd : t)) currencies.add(code);
  }
  // Currencies inside a named pair are covered by the pair.
  for (const s of instruments) {
    const inst = INSTRUMENTS.find((i) => i.symbol === s);
    if (inst?.research) inst.currencies.forEach((c) => currencies.delete(c));
  }
  return { instruments: [...instruments], currencies: [...currencies] };
}

// Returns [{ name, args }] to run before the model answers (max 4).
export function groundingCalls(text) {
  const q = String(text ?? '').slice(0, 2000);
  if (!q.trim()) return [];
  const t = q.toLowerCase();
  const has = (k) => INTENT[k].test(t);
  const { instruments, currencies } = mentions(q);
  const calls = [];
  const add = (name, args = {}) => {
    if (!calls.some((c) => c.name === name && JSON.stringify(c.args) === JSON.stringify(args))) calls.push({ name, args });
  };

  // The trader's own records.
  if (has('today')) add('get_today_status');
  if (has('stats')) add('get_trader_stats');
  if (has('trades')) add('get_recent_trades', instruments[0] ? { market: instruments[0], limit: 10 } : { limit: 10 });
  if (has('positions')) add('get_open_positions');

  // Market Intelligence.
  if (has('ranking') && (has('research') || /currenc/.test(t) || !instruments.length)) add('list_research_coverage');
  if (has('calendar')) {
    const days = /\b(when is|next (?:fomc|fed|ecb|meeting|rate decision|policy))\b/.test(t) ? 45 : /\bnext week\b/.test(t) ? 14 : /\bmonth\b/.test(t) ? 30 : 7;
    const currency = currencies.length === 1 && ['USD', 'EUR'].includes(currencies[0]) ? currencies[0] : undefined;
    add('get_economic_calendar', { days, ...(currency ? { currency } : {}), ...(/\bhigh[- ]?(?:impact|importance)\b/.test(t) ? { highOnly: true } : {}), ...(/\b(last week|recent|yesterday|result|actual|came in|printed)\b/.test(t) ? { includePast: true } : {}) });
  }
  for (const s of instruments.slice(0, 2)) {
    const inst = INSTRUMENTS.find((i) => i.symbol === s);
    if (inst.market === 'Crypto') add('get_crypto_context', { symbol: s });
    else if (has('research') && inst.research) add('get_fundamental_research', { instrument: inst.research });
    else add('get_instrument_context', { symbol: s });
    if (has('community') && inst.market !== 'Crypto') add('get_community_view', { symbol: s });
  }
  for (const c of currencies.slice(0, 2)) {
    if (has('research') || has('ranking') || !has('calendar')) add('get_fundamental_research', { instrument: c });
  }
  if (has('news')) add('get_market_news', { ...(instruments[0] ? { market: instruments[0] } : currencies[0] ? { market: currencies[0] } : {}) });
  if ((has('snapshot') || (has('price') && !instruments.length && !currencies.length && !calls.length)) && !has('trades')) add('get_market_snapshot');
  if (has('crypto') && !instruments.some((s) => s === 'BTCUSD' || s === 'ETHUSD')) add('get_crypto_context', { symbol: 'BTCUSD' });

  return calls.slice(0, 4);
}
