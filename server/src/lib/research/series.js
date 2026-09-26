// Time-series utilities. Every adapter normalizes to
//   { frequency: 'D'|'W'|'M'|'Q'|'A', points: [{ date: 'YYYY-MM-DD' (period start), period, value }] }
// sorted ascending, so scoring code never has to care which API a series came from.

export const DAY = 24 * 60 * 60 * 1000;

export function periodLabel(date, frequency) {
  const [y, m] = date.split('-').map(Number);
  if (frequency === 'M') return `${y}-${String(m).padStart(2, '0')}`;
  if (frequency === 'Q') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  if (frequency === 'A') return String(y);
  return date;
}

// '2026-08' | '2026-Q2' | '2026' | '2026-09-25' -> period start date
export function periodStart(period) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return period;
  if (/^\d{4}-\d{2}$/.test(period)) return `${period}-01`;
  const q = period.match(/^(\d{4})-Q([1-4])$/);
  if (q) return `${q[1]}-${String((Number(q[2]) - 1) * 3 + 1).padStart(2, '0')}-01`;
  if (/^\d{4}$/.test(period)) return `${period}-01-01`;
  return null;
}

export function periodEnd(date, frequency) {
  const d = new Date(`${date}T00:00:00Z`);
  if (frequency === 'M') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  if (frequency === 'Q') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 0));
  if (frequency === 'A') return new Date(Date.UTC(d.getUTCFullYear(), 11, 31));
  if (frequency === 'W') return new Date(d.getTime() + 6 * DAY);
  return d;
}

// Human label for a period, e.g. "Aug 2026", "Q2 2026", "25 Sep 2026".
export function humanPeriod(period) {
  if (!period) return '';
  const q = period.match(/^(\d{4})-Q([1-4])$/);
  if (q) return `Q${q[2]} ${q[1]}`;
  if (/^\d{4}-\d{2}$/.test(period)) {
    const d = new Date(`${period}-01T00:00:00Z`);
    return d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    const d = new Date(`${period}T00:00:00Z`);
    return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  return period;
}

export function normalizePoints(raw, frequency) {
  const byDate = new Map();
  for (const p of raw) {
    if (p.value === null || p.value === undefined || !Number.isFinite(p.value) || !p.date) continue;
    byDate.set(p.date, { date: p.date, period: periodLabel(p.date, frequency), value: p.value });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Year-over-year % change for an index series (monthly or quarterly).
export function yoy(points) {
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  const out = [];
  for (const p of points) {
    const d = new Date(`${p.date}T00:00:00Z`);
    const prevDate = new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const prev = byDate.get(prevDate);
    if (prev) out.push({ date: p.date, period: p.period, value: Math.round((p.value / prev - 1) * 10000) / 100 });
  }
  return out;
}

// Collapse a daily level series (e.g. a policy rate) into change events.
export function changePoints(points) {
  const out = [];
  let prev = null;
  for (const p of points) {
    if (prev === null || Math.abs(p.value - prev) > 1e-9) out.push({ date: p.date, value: p.value, previous: prev });
    prev = p.value;
  }
  return out;
}

// Truncate a series to what would have been published by `asOf` (period end + lag).
export function availableAsOf(series, asOf, lagDays = 0) {
  if (!series?.points) return [];
  const cutoff = asOf.getTime();
  return series.points.filter((p) => periodEnd(p.date, series.frequency).getTime() + lagDays * DAY <= cutoff);
}

export function last(points, n = 1) {
  return points.length >= n ? points[points.length - n] : null;
}

// Most recent point at least `days` older than the latest point.
export function pointBefore(points, latestDate, days) {
  const target = new Date(`${latestDate}T00:00:00Z`).getTime() - days * DAY;
  for (let i = points.length - 1; i >= 0; i--) {
    if (new Date(`${points[i].date}T00:00:00Z`).getTime() <= target) return points[i];
  }
  return null;
}

export const round = (v, dp = 2) => (v === null || v === undefined ? null : Math.round(v * 10 ** dp) / 10 ** dp);
