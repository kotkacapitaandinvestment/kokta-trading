// Money and time for the Trading Game. Wallet amounts are kobo from the
// server (1 Kotka Credit = ₦1); virtual capital is plain naira and is never
// shown as wallet money.

export const naira = (kobo, { sign = false } = {}) => {
  const v = Number(kobo ?? 0) / 100;
  const s = `₦${Math.abs(v).toLocaleString('en-NG', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  return v < 0 ? `−${s}` : sign && v > 0 ? `+${s}` : s;
};

// Virtual capital: labelled so it's never mistaken for wallet money.
export const virtual = (amount) => `₦${Number(amount ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
export const price = (p, dp = 2) => (p == null ? '—' : Number(p).toLocaleString('en-NG', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
export const pct = (v, d = 2) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(d)}%`);
export const mmss = (seconds) => {
  const neg = seconds < 0;
  const s = Math.abs(Math.round(seconds));
  return `${neg ? '−' : ''}${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export const minutes = (sec) => `${Math.round(sec / 60)} min`;

// What entering a competition means, shown before anyone commits money.
export function stakeWords({ stakeKobo, startingCapital, feeBps }) {
  return [
    `You are staking ${naira(stakeKobo)} of your available balance.`,
    `You will receive ${virtual(startingCapital)} in virtual trading capital for this match.`,
    'Virtual trading capital has no cash value.',
    `Kotka charges a ${feeBps / 100}% competition platform fee.`,
  ];
}

// Stakes to offer: the usual amounts that the current rules allow.
export function stakeOptions(rules) {
  return [50_000, 100_000, 250_000, 500_000].filter((k) => k >= rules.minStakeKobo && k <= rules.maxStakeKobo && (k - rules.minStakeKobo) % rules.stakeStepKobo === 0);
}
export function stakeProblem(kobo, rules) {
  if (!Number.isFinite(kobo) || kobo <= 0) return 'Enter an amount.';
  if (kobo < rules.minStakeKobo) return `The smallest stake is ${naira(rules.minStakeKobo)}.`;
  if (kobo > rules.maxStakeKobo) return `The largest stake is ${naira(rules.maxStakeKobo)}.`;
  if ((kobo - rules.minStakeKobo) % rules.stakeStepKobo !== 0) return `Stakes go up in steps of ${naira(rules.stakeStepKobo)}.`;
  return null;
}

export const STATUS_LABEL = {
  WAITING_FOR_OPPONENT: 'Waiting for an opponent',
  READY: 'In the lobby',
  LOCKED: 'Starting',
  COUNTDOWN: 'Starting',
  ACTIVE: 'Live',
  COMPLETED: 'Scoring',
  SCORING: 'Scoring',
  SETTLEMENT: 'Settling',
  SETTLED: 'Finished',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  ABANDONED: 'Abandoned',
  DISPUTED: 'Under review',
  REFUNDED: 'Refunded',
};

export const OUTCOME_LABEL = { win: 'Won', loss: 'Lost', draw: 'Draw', refund: 'Refunded', practice: 'Practice' };

export const REASONS = [
  ['trend', 'Trend'],
  ['breakout', 'Breakout'],
  ['support', 'Support'],
  ['resistance', 'Resistance'],
  ['momentum', 'Momentum'],
  ['reversal', 'Reversal'],
  ['indicator', 'Indicator'],
  ['multiple', 'Several confirmations'],
];

export const SUBSCORES = [
  ['outcome', 'Trading outcome'],
  ['risk', 'Risk management'],
  ['decision', 'Decision quality'],
  ['execution', 'Execution'],
  ['consistency', 'Consistency'],
];

export function requestKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
