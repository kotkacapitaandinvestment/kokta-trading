// Upcoming catalysts (official calendars only) and invalidation conditions.
// Scenario and invalidation text is Kotka interpretation built from the
// current evidence and the scoring rules — it describes what would change
// the assessment, never what the outcome will be.

import { CURRENCIES } from './currencies.js';
import { CALENDAR_SOURCES } from './sources/calendars.js';
import { humanPeriod, DAY } from './series.js';

const fmt = (v, dp = 2) => (v === null || v === undefined ? 'n/a' : Number(v).toFixed(dp));

function scenarios(category, ev, event = '') {
  const infl = ev.factors.inflation;
  // Context cites the measure the release actually publishes.
  const inflObs = /Consumer Price Index/i.test(event) ? ev.observations[`${ev.code}.headlineCpi`] ?? ev.observations[`${ev.code}.targetInflation`] : /Producer Price/i.test(event) ? null : ev.observations[`${ev.code}.targetInflation`];
  const stance = ev.policy?.stance;
  const me = ev.marketExpectations;
  switch (category) {
    case 'central_bank': {
      const context = me?.available ? `Markets price ${me.pricing.toLowerCase()} policy: 2-year yield ${me.spread >= 0 ? '+' : ''}${fmt(me.spread)} pts vs the policy rate.` : null;
      if (stance === 'HAWKISH') return { positive: 'A further hike, or guidance that more tightening is needed.', negative: 'A pause framed as the end of tightening, or a shift toward cuts.', context };
      if (stance === 'DOVISH') return { positive: 'A pause in easing, or less dovish guidance.', negative: 'Further cuts, or signals of a longer easing cycle.', context };
      return { positive: 'A shift toward tightening.', negative: 'A shift toward easing.', context };
    }
    case 'inflation': {
      if (!infl?.available) return { positive: 'Inflation moving closer to target.', negative: 'Inflation moving further from target.', context: null };
      const context = inflObs ? `Latest: ${inflObs.label} ${fmt(inflObs.value)}% (${inflObs.periodLabel}).` : null;
      const gap = infl.extra?.gap ?? 0;
      const target = infl.extra.target;
      if (gap > 0.5) return { positive: `Inflation easing back toward the ${target} target, with core contained.`, negative: 'A further rise, widening the overshoot and testing the policy response.', context };
      if (gap < -0.5) return { positive: `A pickup toward the ${target} target.`, negative: 'A further decline, adding to easing pressure.', context };
      return { positive: `Inflation holding near the ${target} target.`, negative: 'A move of more than 0.5 points away from target.', context };
    }
    case 'growth': {
      const g = ev.imf?.growth;
      return {
        positive: g?.current != null ? `Growth at or above the IMF's ${g.year} projection (${fmt(g.current)}%).` : 'Growth at or above recent trend.',
        negative: 'A result well below that path, reinforcing a slowing narrative.',
        context: null,
      };
    }
    case 'labour': {
      const u = ev.observations[`${ev.code}.unemployment`];
      return { positive: 'Stable or lower unemployment.', negative: 'A rise of 0.2 points or more, signalling a loosening labour market.', context: u ? `Latest unemployment: ${fmt(u.value, 1)}% (${u.periodLabel}).` : null };
    }
    case 'external': {
      const ca = ev.imf?.currentAccount;
      return { positive: 'A stronger external balance than recent trend.', negative: 'Further deterioration in the external balance.', context: ca != null ? `IMF ${ev.imf.growth.year} current account: ${fmt(ca, 1)}% of GDP.` : null };
    }
    case 'fiscal': {
      const fb = ev.imf?.fiscalBalance;
      return { positive: 'Deficit and debt outturns better than the IMF path.', negative: 'A wider deficit or higher debt than projected.', context: fb != null ? `IMF ${ev.imf.growth.year} balance: ${fmt(fb, 1)}% of GDP.` : null };
    }
    default:
      return { positive: null, negative: null, context: null };
  }
}

export function buildCatalysts(codes, evals, evidence, { now = new Date(), horizonDays = 45 } = {}) {
  const until = now.getTime() + horizonDays * DAY;
  const out = [];
  const coverage = {};
  for (const code of codes) {
    const cfg = CURRENCIES[code];
    const ev = evals[code];
    const keys = [cfg.centralBank.meetings, ...cfg.releaseCalendars].filter(Boolean);
    coverage[code] = { configured: keys.length > 0, calendars: keys.map((k) => ({ key: k, name: CALENDAR_SOURCES[k].name, retrieved: Array.isArray(evidence.calendars?.[k]) })) };
    if (cfg.centralBank.meetings) {
      for (const m of evidence.calendars?.[cfg.centralBank.meetings] ?? []) {
        const t = new Date(m.date).getTime();
        if (t < now.getTime() - DAY / 2 || t > until) continue;
        out.push({
          date: m.date,
          dateOnly: !!m.dateOnly,
          currency: code,
          event: m.label + (m.withProjections ? ' — with Summary of Economic Projections' : ''),
          category: 'central_bank',
          importance: 'High',
          referencePeriod: null,
          source: CALENDAR_SOURCES[cfg.centralBank.meetings],
          scenarios: scenarios('central_bank', ev),
        });
      }
    }
    for (const k of cfg.releaseCalendars) {
      for (const e of evidence.calendars?.[k] ?? []) {
        const t = new Date(e.date).getTime();
        if (t < now.getTime() - DAY / 2 || t > until) continue;
        const importance = /Third Estimate|Second Estimate|\(final\)|update/i.test(e.event) ? 'Medium' : e.importance;
        out.push({ ...e, importance, currency: code, dateOnly: false, source: CALENDAR_SOURCES[k], scenarios: scenarios(e.category, ev, e.event) });
      }
    }
  }
  // De-duplicate identical events (e.g. one release listed twice).
  const seen = new Set();
  const unique = out
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((e) => {
      const k = `${e.currency}|${e.date.slice(0, 10)}|${e.event}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  const imfNext = {
    date: null,
    dateOnly: true,
    currency: codes.join('/'),
    event: 'IMF World Economic Outlook — next edition (growth, inflation, fiscal and external projections)',
    category: 'imf',
    importance: 'High',
    dateText: 'DATA NOT AVAILABLE — the exact date is not published in machine-readable form. The IMF states the WEO is released in April and September/October each year.',
    source: { name: 'International Monetary Fund — World Economic Outlook', url: 'https://www.imf.org/en/Publications/WEO', tier: 1 },
    scenarios: {
      positive: 'Upward revisions to growth, or narrower deficits than projected, would strengthen the forecast-revision and fiscal factors.',
      negative: 'Growth downgrades, or wider deficits and higher debt paths, would weaken those factors.',
    },
  };
  return { items: [...unique, imfNext], coverage, horizonDays };
}

const nextOf = (catalysts, code, category) => catalysts.items.find((c) => c.currency === code && c.category === category && c.date);
const on = (c) => (c ? ` — next: ${c.event.split(' (')[0]} on ${humanPeriod(c.date.slice(0, 10))}` : '');

function factorInvalidation(ev, key, catalysts) {
  const f = ev.factors[key];
  if (!f?.available) return null;
  const cb = ev.centralBank.short;
  switch (key) {
    case 'monetary_policy': {
      const meeting = nextOf(catalysts, ev.code, 'central_bank');
      const when = meeting ? ` at its next decision (${humanPeriod(meeting.date.slice(0, 10))})` : '';
      if (f.classification === 'HAWKISH')
        return `If the ${cb} pauses${when} and signals that tightening is over, the policy score (currently ${sign(f.score)}) would fall toward 0 as the 6-month tightening window rolls off; any cut would turn it negative.`;
      if (f.classification === 'DOVISH')
        return `If the ${cb} stops easing${when}, the policy score (currently ${sign(f.score)}) would move toward 0; a hike would turn it positive.`;
      return `A move in either direction by the ${cb}${when} would shift the policy score from 0 to ±1 (a hike positive, a cut negative).`;
    }
    case 'inflation': {
      const x = f.extra ?? {};
      const obs = ev.observations[`${ev.code}.targetInflation`];
      const cur = obs ? `${fmt(obs.value)}% in ${obs.periodLabel}` : 'latest reading';
      const next = on(nextOf(catalysts, ev.code, 'inflation'));
      if (f.score === 1) return `If inflation (${cur}) moves more than 0.5 percentage points away from the ${x.target} target, the inflation score falls from +1 to 0 or below${next}.`;
      if (f.score === 0 && x.gap > 0) return `If inflation (${cur}) rises by more than 0.2 percentage points over three months despite the policy response, the score falls to −1; a return to within 0.5 points of the ${x.target} target would lift it to +1${next}.`;
      if (f.score < 0 && x.gap > 0) return `A restrictive policy response, or inflation (${cur}) easing back toward the ${x.target} target, would lift the inflation score from ${sign(f.score)}${next}.`;
      return `A return of inflation (${cur}) to within 0.5 percentage points of the ${x.target} target would lift the score to +1${next}.`;
    }
    case 'growth': {
      const gdp = ev.observations[`${ev.code}.gdpYoY`];
      const next = on(nextOf(catalysts, ev.code, 'growth'));
      if (gdp) return `If y/y GDP growth (${fmt(gdp.value)}% in ${gdp.periodLabel}) moves 0.5 percentage points or more versus two quarters earlier, the growth score shifts by one notch in that direction${next}.`;
      const g = ev.imf?.growth;
      return g?.current != null ? `An IMF revision that moves the ${g.year} growth projection (${fmt(g.current)}%) by more than 0.25 percentage points relative to its medium-term anchor would change the growth score.` : null;
    }
    case 'imf_revisions':
      return `If the next World Economic Outlook revises combined current- and next-year growth by 0.3 percentage points or more (the last cumulative revision was ${fmt(f.extra?.cumulativeGrowthRevision)} points), this factor moves one notch in that direction.`;
    case 'fiscal':
      return `If updated IMF projections show gross debt rising by 1.5 percentage points of GDP or more over the projection window, or the deficit crossing the next threshold (−4% / −7% of GDP), the fiscal score (currently ${sign(f.score)}) weakens.`;
    case 'external':
      return `A current-account move of 1 percentage point of GDP or more between last year and the next projection year would shift the external score (currently ${sign(f.score)}).`;
    case 'financial_stability': {
      const s = ev.observations[`${ev.code}.stress`];
      return s ? `If systemic stress (CISS ${fmt(s.value, 3)}) rises above 0.05 the score drops to 0; above 0.15 it turns negative — a sharp rise within a month (≥ 0.05) also subtracts a notch.` : null;
    }
    case 'reserves':
      return `A change of 0.5 percentage points or more in ${ev.code}'s share of global reserves (IMF COFER) over a year would move this factor.`;
    default:
      return null;
  }
}

const sign = (s) => (s > 0 ? `+${s}` : `${s}`);

export function buildInvalidation(evals, catalysts, { pair = null } = {}) {
  const items = [];
  const codes = Object.keys(evals);
  const candidates = [];
  for (const code of codes) {
    const ev = evals[code];
    for (const f of Object.values(ev.factors)) {
      if (!f.available) continue;
      const importance = f.weight * (f.score !== 0 ? Math.abs(f.score) : f.tension ? 0.75 : 0.25);
      candidates.push({ code, key: f.key, label: f.label, importance });
    }
  }
  candidates.sort((a, b) => b.importance - a.importance);
  if (pair) {
    const pd = pair.factors.find((r) => r.key === 'policy_differential');
    if (pd?.available) {
      const d = pair.differentials.policyRate;
      items.push({
        currency: `${pair.base}${pair.quote}`,
        factor: 'policy_differential',
        label: 'Policy Rate Differential',
        text: `If the ${pair.base}–${pair.quote} policy differential (${fmt(d.now)} pts) moves by 0.25 pts or more against its 6-month trend — e.g. one central bank tightening while the other pauses — the differential factor (currently ${sign(pd.score)}) shifts toward the other currency.`,
      });
    }
  }
  for (const c of candidates) {
    if (items.length >= 5) break;
    if (items.some((i) => i.factor === c.key && i.currency === c.code)) continue;
    const text = factorInvalidation(evals[c.code], c.key, catalysts);
    if (text) items.push({ currency: c.code, factor: c.key, label: c.label, text });
  }
  return items;
}
