// Rule-of-thumb mock response engine for the Kotka AI prototype.
// A real deployment would route this to an LLM with an institutional-mentor system prompt,
// tools for chart/OHLC retrieval, and the user's journal/analytics as grounding context.

const socraticProbes = [
  "What's your invalidation level, and what would have to happen for you to admit this idea is wrong?",
  'Is this a structural edge, or are you pattern-matching a shape you want to see?',
  "Where's the liquidity resting above and below current price, and which side is more likely to be engineered first?",
  'What did higher timeframe order flow do before this level formed? Context first, entry second.',
  "If this trade goes to breakeven and stalls, will you manage it with a plan or with emotion?",
  'What is your position size telling me about your actual conviction versus your stated conviction?',
];

const riskProbes = [
  'How much of your daily loss limit have you already used, and does this trade still fit inside it?',
  'What is the reward-to-risk on this specific setup, not on your best-case exit?',
  'Would you take this exact trade with twice the size? If not, your size right now might already be wrong.',
];

const structureNotes = {
  Forex: 'In FX, watch for session-open liquidity sweeps around London and New York opens — displacement after the sweep is the tell, not the sweep itself.',
  Gold: 'Gold tends to respect daily order blocks more cleanly than intraday ones — weight the higher timeframe structure heavier here.',
  Indices: 'Index futures often front-run cash open liquidity — check overnight range before trusting an intraday break.',
  Crypto: 'Crypto liquidity is thinner outside US hours — the same setup carries more slippage risk on a weekend.',
  Stocks: 'Earnings and macro catalysts can invalidate clean technical structure overnight — check the calendar before holding size.',
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateAssistantReply(userText, market = 'Forex') {
  const lower = userText.toLowerCase();
  const mentionsRisk = /risk|size|lot|position|stop/.test(lower);
  const mentionsBias = /long|short|buy|sell|bullish|bearish/.test(lower);

  const parts = [];

  if (mentionsBias) {
    parts.push(pick(socraticProbes));
  }
  if (mentionsRisk) {
    parts.push(pick(riskProbes));
  }
  if (!mentionsBias && !mentionsRisk) {
    parts.push(pick(socraticProbes));
  }

  if (structureNotes[market] && Math.random() > 0.4) {
    parts.push(structureNotes[market]);
  }

  return parts.join(' ');
}

export const markets = ['Forex', 'Gold', 'Indices', 'Crypto', 'Stocks'];
export const timeframes = ['1m', '5m', '15m', '1H', '4H', 'Daily', 'Weekly'];
