export const difficulties = [
  { id: 'beginner', label: 'Beginner', description: 'Clean trends, obvious structure, low noise.' },
  { id: 'intermediate', label: 'Intermediate', description: 'Ranging conditions, mixed signals.' },
  { id: 'advanced', label: 'Advanced', description: 'Fakeouts, news volatility, thin liquidity.' },
  { id: 'professional', label: 'Professional', description: 'Multi-timeframe conflict, institutional traps.' },
  { id: 'institutional-chaos', label: 'Institutional Chaos', description: 'Flash volatility, conflicting narratives, real-time pressure.' },
];

const bank = {
  beginner: [
    {
      market: 'EUR/USD · 1H',
      narrative:
        'Price has been in a clean uptrend for six sessions, making higher highs and higher lows. It just pulled back to a well-respected trendline with no news events scheduled for the next 4 hours.',
      options: ['Enter long at the trendline', 'Wait for a break of the last high', 'Enter short, expecting reversal', 'Do nothing, structure is unclear'],
      best: 'Enter long at the trendline',
    },
  ],
  intermediate: [
    {
      market: 'XAU/USD · 15m',
      narrative:
        'Gold has been ranging for 3 days between 2400 and 2430. Price just swept the 2430 high on low volume and is now reversing back into the range with a bearish engulfing candle on the 15m.',
      options: ['Short the range top after the sweep', 'Buy the breakout above 2430', 'Wait for confirmation at range midpoint', 'Enter both directions to hedge'],
      best: 'Short the range top after the sweep',
    },
  ],
  advanced: [
    {
      market: 'GBP/USD · 5m',
      narrative:
        'CPI data releases in 3 minutes. Price is coiled tightly below a key resistance with thinning volume. Historically this pair whipsaws 40+ pips in either direction within the first 90 seconds of release.',
      options: ['Enter long now, ahead of the news', 'Stay flat until 5 minutes after release', 'Place pending orders both directions', 'Short now, expecting a fade'],
      best: 'Stay flat until 5 minutes after release',
    },
  ],
  professional: [
    {
      market: 'NAS100 · 1H vs 4H',
      narrative:
        'The 4H chart shows a clear bearish order block rejection. The 1H, however, just printed a bullish break of structure with displacement into a fair value gap. Your bias has been bearish all week.',
      options: ['Trust the 4H bias and short into strength', 'Respect the 1H displacement and go long with reduced size', 'Stay flat until timeframes align', 'Short with full size to average into the 4H thesis'],
      best: 'Respect the 1H displacement and go long with reduced size',
    },
  ],
  'institutional-chaos': [
    {
      market: 'US30 · 1m (Flash Event)',
      narrative:
        'An unscheduled headline just hit the wires. US30 dropped 220 points in 40 seconds, spreads widened to 8x normal, and your existing long position is now 1.4R underwater with no clear structure forming.',
      options: ['Add to the position, expecting a snapback', 'Exit immediately at market, structure is gone', 'Hold and wait for the spread to normalize', 'Flip short to chase the momentum'],
      best: 'Exit immediately at market, structure is gone',
    },
  ],
};

export function getScenario(difficulty) {
  const pool = bank[difficulty] ?? bank.beginner;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function scoreDecision(scenario, choice) {
  const isBest = choice === scenario.best;
  const jitter = () => Math.round((Math.random() - 0.5) * 12);

  const base = isBest ? 82 : 48;
  const dims = ['Timing', 'Risk', 'Execution', 'Discipline', 'Psychology', 'Patience', 'Market Reading'];
  const scores = dims.map((label) => ({
    label,
    value: Math.max(20, Math.min(100, base + jitter())),
  }));

  const overall = Math.round(scores.reduce((sum, s) => sum + s.value, 0) / scores.length);

  const feedback = isBest
    ? "Strong decision. You read the structural context correctly and acted within a defined plan rather than reacting to the noise. This is what repeatable process looks like."
    : `Reconsider this one: "${scenario.best}" better respected the structure and risk on the table. Ask yourself whether this choice was driven by a rule or by a feeling in the moment.`;

  return { overall, scores, feedback, isBest };
}
