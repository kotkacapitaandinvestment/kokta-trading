// Plain-language versions of values the research engine stores as codes.

// "STRONGER EUR" -> "EUR looks stronger", "BALANCED" -> "Evenly matched".
export function conditionWord(c) {
  if (!c) return 'Not enough data';
  const s = String(c).toUpperCase();
  if (s.startsWith('STRONGER ')) return `${s.split(' ')[1]} looks stronger`;
  return (
    {
      STRONG: 'Strong',
      NEUTRAL: 'Neutral',
      WEAK: 'Weak',
      BALANCED: 'Evenly matched',
      'DATA NOT AVAILABLE': 'Not enough data',
    }[s] ?? s.charAt(0) + s.slice(1).toLowerCase()
  );
}

export const directionWord = (label) =>
  ({ STRENGTHENING: 'Strengthening', STABLE: 'Stable', WEAKENING: 'Weakening', REVERSING: 'Turning', MIXED: 'Mixed' })[label] ?? 'Not enough history';

export const stanceWord = (s) => ({ HAWKISH: 'Hawkish', DOVISH: 'Dovish', NEUTRAL: 'Neutral', 'ON HOLD': 'On hold' })[String(s ?? '').toUpperCase()] ?? (s ? String(s).charAt(0) + String(s).slice(1).toLowerCase() : 'Not known');

// "ABOVE TARGET · STABLE" -> "Above target · stable", keeping acronyms.
const ACRONYMS = new Set(['IMF', 'ECB', 'BIS', 'GDP', 'CPI', 'PCE', 'FX', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'US', 'UK', 'OECD', 'REER']);
export function plainCaps(s) {
  const t = String(s ?? '');
  if (!t || t !== t.toUpperCase() || !/[A-Z]{3}/.test(t)) return t;
  const lower = t.toLowerCase().replace(/\b[a-z]+\b/g, (w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w));
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
