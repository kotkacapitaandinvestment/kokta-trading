// Usage periods, all in UTC so every server and every trader agree:
//   day   00:00 UTC to 00:00 UTC
//   week  Monday 00:00 UTC to the next Monday (ISO weeks)
//   month the 1st 00:00 UTC to the 1st of the next month
// The browser never decides when usage resets.

export const PERIODS = ['day', 'week', 'month'];
export const LIMIT_FIELD = { day: 'daily', week: 'weekly', month: 'monthly' };
export const REASON = { day: 'DAILY_LIMIT_REACHED', week: 'WEEKLY_LIMIT_REACHED', month: 'MONTHLY_LIMIT_REACHED' };

// An admin reset of a longer period also resets the shorter ones inside it.
export const RESETS_THAT_APPLY = { day: ['day', 'week', 'month'], week: ['week', 'month'], month: ['month'] };

export function periodStart(period, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  if (period === 'day') return new Date(Date.UTC(y, m, d));
  if (period === 'week') return new Date(Date.UTC(y, m, d - ((now.getUTCDay() + 6) % 7)));
  return new Date(Date.UTC(y, m, 1));
}

export function periodEnd(period, now = new Date()) {
  const start = periodStart(period, now);
  if (period === 'day') return new Date(start.getTime() + 86400e3);
  if (period === 'week') return new Date(start.getTime() + 7 * 86400e3);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

export function periodBounds(now = new Date()) {
  return Object.fromEntries(PERIODS.map((p) => [p, { start: periodStart(p, now), resetAt: periodEnd(p, now) }]));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// When a period resets, in words (UTC), for server messages. The app shows
// the same moment in the trader's own time.
export function resetPhrase(period, now = new Date()) {
  if (period === 'day') return 'at midnight UTC';
  if (period === 'week') return 'on Monday at 00:00 UTC';
  const end = periodEnd('month', now);
  return `on ${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]} at 00:00 UTC`;
}
