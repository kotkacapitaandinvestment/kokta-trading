// Fundamental trend and "what changed".
// The trend is reconstructed by re-running the same deterministic scoring as
// of past month-ends, using only data that would have been published by then.
// Points are labeled `reconstructed` — later data revisions mean they can
// differ from what a real-time assessment would have shown.

import { evaluateCurrency, composite } from './evaluate.js';
import { evaluatePair } from './pair.js';
import { humanPeriod, round } from './series.js';

export function trendDates(now, months = 6) {
  const dates = [];
  for (let i = months; i >= 1; i--) {
    dates.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0, 23, 59)));
  }
  dates.push(now);
  return dates;
}

export function reconstructTrends(codes, evidence, now, currentEvals, { pair = null } = {}) {
  const dates = trendDates(now);
  const byCode = {};
  for (const code of codes) {
    byCode[code] = dates.map((d, i) => (i === dates.length - 1 ? currentEvals[code] : evaluateCurrency(code, evidence, { asOf: d })));
  }

  const trends = {};
  for (const code of codes) {
    const evs = byCode[code];
    // Only factors that are available at every point, so the line is comparable.
    const common = Object.keys(evs[0].factors).filter((k) => evs.every((e) => e.factors[k]?.available));
    trends[code] = {
      basis: common,
      points: evs.map((e, i) => ({
        date: dates[i].toISOString(),
        label: i === dates.length - 1 ? 'Now' : humanPeriod(dates[i].toISOString().slice(0, 7)),
        score: composite(e.factors, common),
        reconstructed: i !== dates.length - 1,
      })),
    };
    trends[code].direction = directionFor(trends[code].points);
  }

  if (pair) {
    const [b, q] = [pair.base, pair.quote];
    const pairEvals = dates.map((_, i) => evaluatePair(byCode[b][i], byCode[q][i]));
    const common = pairEvals[0].factors.map((f) => f.key).filter((k) => pairEvals.every((pe) => pe.factors.find((f) => f.key === k)?.available));
    const scoreOn = (pe) => {
      let w = 0;
      let d = 0;
      for (const f of pe.factors) {
        if (!common.includes(f.key) || !f.available) continue;
        w += f.weight;
        d += f.weight * f.diff;
      }
      return w ? Math.round(50 + 12.5 * (d / w)) : null;
    };
    trends[`${b}${q}`] = {
      basis: common,
      points: pairEvals.map((pe, i) => ({
        date: dates[i].toISOString(),
        label: i === dates.length - 1 ? 'Now' : humanPeriod(dates[i].toISOString().slice(0, 7)),
        score: scoreOn(pe),
        reconstructed: i !== dates.length - 1,
      })),
    };
    trends[`${b}${q}`].direction = directionFor(trends[`${b}${q}`].points);
  }

  // Month-ago baseline for "what changed" (second-to-last month-end).
  const baseline = Object.fromEntries(codes.map((c) => [c, byCode[c][dates.length - 2]]));
  return { trends, baseline, baselineDate: dates[dates.length - 2].toISOString() };
}

// STRENGTHENING / STABLE / WEAKENING / REVERSING / MIXED from the score path.
export function directionFor(points) {
  const s = points.map((p) => p.score).filter((v) => v !== null && v !== undefined);
  if (s.length < 3) return { label: 'STABLE', basis: 'Insufficient history' };
  const now = s[s.length - 1];
  const m1 = now - s[s.length - 2];
  const m3 = now - s[Math.max(0, s.length - 4)];
  const earlier = s[Math.max(0, s.length - 4)] - s[0];
  let label;
  if (Math.abs(m3) < 3 && Math.abs(m1) < 3) label = 'STABLE';
  else if (m1 * m3 < 0 && Math.abs(m1) >= 3) label = 'REVERSING';
  else if (m3 >= 3 && m1 >= 0) label = earlier <= -3 ? 'REVERSING' : 'STRENGTHENING';
  else if (m3 <= -3 && m1 <= 0) label = earlier >= 3 ? 'REVERSING' : 'WEAKENING';
  else label = 'MIXED';
  return { label, change1m: m1, change3m: m3, basis: 'Change in the fundamental score over 1 and 3 months' };
}

const fmt = (v, dp = 2) => (v === null || v === undefined ? 'n/a' : Number(v).toFixed(dp));
const MATERIAL_MARKET_MOVE = 0.1;

export function formatValue(v, unit) {
  if (v === null || v === undefined) return 'n/a';
  if (unit === '%') return `${fmt(v)}%`;
  if (unit === 'index (0–1)') return fmt(v, 3);
  if (unit === 'pts') return `${fmt(v)} pts`;
  if (unit === '% of GDP') return `${fmt(v, 1)}% of GDP`;
  return fmt(v);
}

export function whatChanged(current, baseline, baselineDate) {
  const items = [];
  const since = humanPeriod(baselineDate.slice(0, 10));

  // Policy decisions inside the window.
  for (const ch of current.policy?.recentChanges ?? []) {
    if (new Date(`${ch.date}T00:00:00Z`) > new Date(baselineDate)) {
      items.push({
        kind: 'FACT',
        currency: current.code,
        text: `${current.centralBank.name} ${ch.bp > 0 ? 'raised' : 'cut'} its policy rate by ${Math.abs(ch.bp)}bp to ${ch.toDisplay ?? `${fmt(ch.to)}%`} (effective ${humanPeriod(ch.date)}).`,
        evidence: current.factors.monetary_policy?.evidence?.slice(0, 1) ?? [],
      });
    }
  }

  // New official data releases.
  for (const o of Object.values(current.observations)) {
    if (o.value === null || o.value === undefined || o.id.includes('.imf.') || o.id.includes('.policy')) continue;
    const prev = baseline?.observations?.[o.id];
    if (!prev || prev.value === null) continue;
    const newPeriod = prev.period !== o.period;
    const delta = o.value - prev.value;
    if (o.frequency === 'D' || o.frequency === 'W') {
      if (Math.abs(delta) < (o.unit === 'index (0–1)' ? 0.02 : MATERIAL_MARKET_MOVE)) continue;
    } else if (!newPeriod) continue;
    const text =
      Math.abs(delta) < 1e-9
        ? `${o.label}: unchanged at ${formatValue(o.value, o.unit)} in ${o.periodLabel} (as in ${prev.periodLabel}).`
        : `${o.label}: ${formatValue(prev.value, o.unit)} (${prev.periodLabel}) → ${formatValue(o.value, o.unit)} (${o.periodLabel}).`;
    items.push({ kind: 'FACT', currency: current.code, text, evidence: [o.id] });
  }

  // New IMF vintage.
  if (current.imf?.currentVintage && baseline?.imf?.currentVintage && current.imf.currentVintage !== baseline.imf.currentVintage) {
    items.push({ kind: 'SOURCE ASSESSMENT', currency: current.code, text: `The IMF published its ${current.imf.currentVintage} World Economic Outlook, replacing the ${baseline.imf.currentVintage} projections.`, evidence: [] });
  }

  // Factor score changes (interpretation layer).
  for (const f of Object.values(current.factors)) {
    const b = baseline?.factors?.[f.key];
    if (!b || !f.available || !b.available || b.score === f.score) continue;
    items.push({ kind: 'KOTKA INTERPRETATION', currency: current.code, text: `${f.label} score moved from ${sign(b.score)} to ${sign(f.score)} (${f.classification ?? ''}).`, evidence: f.evidence.slice(0, 2) });
  }

  if (!items.length) items.push({ kind: 'FACT', currency: current.code, text: `No material change in ${current.code} evidence since ${since}.`, evidence: [] });
  return { since, items };
}

const sign = (s) => (s > 0 ? `+${s}` : `${s}`);

export function scoreChange(prevReport, score) {
  if (!prevReport || prevReport.score === null || score === null) return null;
  return { previous: prevReport.score, current: score, change: round(score - prevReport.score, 0), previousAt: prevReport.createdAt };
}
