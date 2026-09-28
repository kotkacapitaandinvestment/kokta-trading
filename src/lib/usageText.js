// Wording for usage limits, in the reader's own time. No imports, so the API
// client can use it too. Periods reset at fixed moments in UTC.

const PERIOD_WORD = { day: 'today', week: 'this week', month: 'this month' };
export const PERIOD_ADJ = { day: 'daily', week: 'weekly', month: 'monthly' };

const time = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// "at 1:00 AM", "tomorrow at 1:00 AM", "on Monday at 1:00 AM", "on 1 Oct at 1:00 AM"
export function whenItResets(resetAt, now = new Date()) {
  const d = new Date(resetAt);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return `at ${time(d)}`;
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time(d)}`;
  if (d - now < 6 * 86400e3) return `on ${d.toLocaleDateString([], { weekday: 'long' })} at ${time(d)}`;
  return `on ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${time(d)}`;
}

export const unitWord = (usage, n) => (usage?.unit ? usage.unit[n === 1 ? 0 : 1] : n === 1 ? 'use' : 'uses');
export const periodWord = (period) => PERIOD_WORD[period];

// What the app says for a refused request, from the server's reply. Limits,
// pauses and "too fast" are different things and are worded differently.
export function refusalText(data) {
  if (data?.code === 'usage_limit' && data.resetAt) {
    return `You’ve reached your ${PERIOD_ADJ[data.period]} ${data.limitName ?? 'usage'} limit. It resets ${whenItResets(data.resetAt)}.`;
  }
  return data?.error ?? null;
}

export const isRefusal = (data) => ['usage_limit', 'feature_paused', 'rate_limited'].includes(data?.code);
