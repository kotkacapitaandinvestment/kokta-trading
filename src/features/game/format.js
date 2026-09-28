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
export const price = (p) => (p == null ? '—' : Number(p).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const pct = (v, d = 2) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(d)}%`);
export const mmss = (seconds) => {
  const neg = seconds < 0;
  const s = Math.abs(Math.round(seconds));
  return `${neg ? '−' : ''}${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export const minutes = (sec) => `${Math.round(sec / 60)} min`;

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
