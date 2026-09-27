// Calendar-day helpers for Goal Room (YYYY-MM-DD in the trader's time zone).
export function addDaysLocal(d, n) {
  const [y, m, day] = d.split('-').map(Number);
  const t = new Date(y, m - 1, day + n, 12);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export const dayLetter = (d) => 'SMTWTFS'[new Date(`${d}T12:00:00`).getDay()];

export const daysUntil = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400e3);
