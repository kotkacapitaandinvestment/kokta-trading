// Relative (pair) analysis. A pair is never "the base currency's score":
// EURUSD's fundamental condition is EUR's fundamentals *relative to* USD's.
// Each factor is compared side by side, and pair-specific evidence (policy
// and yield differentials) is added on top.

import { FACTORS } from './currencies.js';
import { round } from './series.js';

const PAIR_WEIGHTS = {
  monetary_policy: 0.18,
  policy_differential: 0.12,
  growth: 0.15,
  imf_revisions: 0.12,
  inflation: 0.1,
  external: 0.1,
  fiscal: 0.08,
  financial_stability: 0.07,
  valuation: 0.05,
  reserves: 0.03,
};

const fmt = (v, dp = 2) => (v === null || v === undefined ? 'n/a' : Number(v).toFixed(dp));

export function evaluatePair(base, quote, { marketPrice = null } = {}) {
  const b = base.code;
  const q = quote.code;
  const rows = [];

  for (const meta of FACTORS) {
    const fb = base.factors[meta.key];
    const fq = quote.factors[meta.key];
    const available = !!(fb?.available && fq?.available);
    const diff = available ? fb.score - fq.score : null;
    rows.push({
      key: meta.key,
      label: meta.label,
      weight: PAIR_WEIGHTS[meta.key],
      available,
      base: fb?.available ? fb.score : null,
      quote: fq?.available ? fq.score : null,
      baseClassification: fb?.classification ?? null,
      quoteClassification: fq?.classification ?? null,
      diff,
      favors: diff === null ? null : diff > 0 ? b : diff < 0 ? q : 'NEITHER',
      unavailableReason: available ? null : [fb?.available ? null : `${b}: ${fb?.unavailableReason ?? 'not available'}`, fq?.available ? null : `${q}: ${fq?.unavailableReason ?? 'not available'}`].filter(Boolean).join(' · '),
    });
  }

  // ── Policy-rate differential and how it has moved ──
  const differentials = {};
  let policyDiff = { key: 'policy_differential', label: 'Policy Rate Differential', weight: PAIR_WEIGHTS.policy_differential, available: false, diff: null };
  if (base.policy?.current != null && quote.policy?.current != null) {
    const now = round(base.policy.current - quote.policy.current, 3);
    const ago = base.policy.rate6mAgo != null && quote.policy.rate6mAgo != null ? round(base.policy.rate6mAgo - quote.policy.rate6mAgo, 3) : null;
    const change = ago !== null ? round(now - ago, 3) : null;
    const score = change === null ? 0 : change >= 0.5 ? 2 : change >= 0.25 ? 1 : change <= -0.5 ? -2 : change <= -0.25 ? -1 : 0;
    differentials.policyRate = { base: base.policy.current, quote: quote.policy.current, now, sixMonthsAgo: ago, change, baseDisplay: base.policy.display, quoteDisplay: quote.policy.display };
    policyDiff = {
      ...policyDiff,
      available: true,
      score,
      // Scale to the same −4…+4 range as factor differences.
      diff: score * 2,
      favors: score > 0 ? b : score < 0 ? q : 'NEITHER',
      rationale:
        change === null
          ? `${b}–${q} policy differential ${fmt(now)} pts; 6-month change not available.`
          : `${b}–${q} policy-rate differential ${fmt(now)} pts vs ${fmt(ago)} pts six months ago (${change > 0 ? 'widened' : change < 0 ? 'narrowed' : 'unchanged'} by ${fmt(Math.abs(change))} pts${change !== 0 ? ` in favour of ${change > 0 ? b : q}` : ''}).`,
      rules: ['Change in the policy-rate differential over 6 months: ≥ +0.50 pts → +2, ≥ +0.25 → +1, ≤ −0.25 → −1, ≤ −0.50 → −2 (in favour of the base currency).'],
      evidence: [...(base.factors.monetary_policy?.evidence ?? []).slice(0, 2), ...(quote.factors.monetary_policy?.evidence ?? []).slice(0, 2)],
    };
  }
  rows.splice(1, 0, policyDiff);

  const realB = base.policy?.realRate;
  const realQ = quote.policy?.realRate;
  if (realB != null && realQ != null) differentials.realRate = { base: realB, quote: realQ, diff: round(realB - realQ, 2) };
  const infB = base.factors.inflation?.extra?.gap;
  const infQ = quote.factors.inflation?.extra?.gap;
  if (infB != null && infQ != null) differentials.inflationGap = { base: infB, quote: infQ, diff: round(infB - infQ, 2) };
  if (base.imf?.growth?.current != null && quote.imf?.growth?.current != null) {
    differentials.growth = { year: base.imf.growth.year, base: base.imf.growth.current, quote: quote.imf.growth.current, diff: round(base.imf.growth.current - quote.imf.growth.current, 2) };
  }
  if (base.imf?.currentAccount != null && quote.imf?.currentAccount != null) {
    differentials.currentAccount = { base: base.imf.currentAccount, quote: quote.imf.currentAccount, diff: round(base.imf.currentAccount - quote.imf.currentAccount, 2) };
  }
  if (base.imf?.fiscalBalance != null && quote.imf?.fiscalBalance != null) {
    differentials.fiscalBalance = { base: base.imf.fiscalBalance, quote: quote.imf.fiscalBalance, diff: round(base.imf.fiscalBalance - quote.imf.fiscalBalance, 2) };
  }

  // ── Relative score ──
  let wSum = 0;
  let dSum = 0;
  let absSum = 0;
  for (const r of rows) {
    if (!r.available) continue;
    wSum += r.weight;
    dSum += r.weight * r.diff;
    absSum += r.weight * Math.abs(r.diff);
  }
  const relativeScore = wSum ? Math.round(50 + 12.5 * (dSum / wSum)) : null;
  const condition = relativeScore === null ? 'DATA NOT AVAILABLE' : relativeScore >= 58 ? `STRONGER ${b}` : relativeScore <= 42 ? `STRONGER ${q}` : 'BALANCED';
  const pairAgreement = absSum ? Math.abs(dSum) / absSum : 0.5;
  const confidence = relativeScore === null ? 0 : Math.round(0.7 * ((base.confidence + quote.confidence) / 2) + 0.3 * 100 * pairAgreement);

  // ── Market expectations for the pair (separate from fundamentals) ──
  let market = null;
  const yb = base.observations[`${b}.yield2y`];
  const yq = quote.observations[`${q}.yield2y`];
  if (yb && yq) {
    const now = round(yb.value - yq.value, 2);
    const prev = yb.previousValue != null && yq.previousValue != null ? round(yb.previousValue - yq.previousValue, 2) : null;
    const change = prev !== null ? round(now - prev, 2) : null;
    market = {
      available: true,
      spread2y: now,
      spread2yMonthAgo: prev,
      change,
      evidence: [yb.id, yq.id],
      summary:
        change === null
          ? `${b}–${q} 2-year yield spread: ${fmt(now)} pts.`
          : `The ${b}–${q} 2-year yield spread is ${fmt(now)} pts, ${Math.abs(change) < 0.05 ? 'little changed' : change > 0 ? `up ${fmt(change)} pts` : `down ${fmt(Math.abs(change))} pts`} over the past month — rate expectations have ${Math.abs(change) < 0.05 ? 'not shifted materially' : `moved in favour of ${change > 0 ? b : q}`}.`,
    };
  } else {
    market = { available: false, summary: `MARKET EXPECTATION DATA NOT AVAILABLE — 2-year yield data is not configured for ${[yb ? null : b, yq ? null : q].filter(Boolean).join(' and ')}.` };
  }

  const favorsBase = rows.filter((r) => r.available && r.diff > 0).sort((x, y) => y.weight * y.diff - x.weight * x.diff);
  const favorsQuote = rows.filter((r) => r.available && r.diff < 0).sort((x, y) => x.weight * x.diff - y.weight * y.diff);

  return {
    base: b,
    quote: q,
    relativeScore,
    condition,
    confidence,
    pairAgreement: round(pairAgreement, 2),
    factors: rows,
    differentials,
    market,
    marketPrice,
    favorsBase: favorsBase.map((r) => r.key),
    favorsQuote: favorsQuote.map((r) => r.key),
  };
}

// Spot performance from the existing Massive market-data integration. This is
// what price has done — reported beside, never mixed into, the fundamentals.
export async function fetchPairPricePerformance(pair, { getMassiveKey, fetchHistoricalBars }) {
  const apiKey = await getMassiveKey();
  if (!apiKey) return { available: false, reason: 'Massive market-data integration is not configured.' };
  const to = new Date();
  const from = new Date(to.getTime() - 100 * 24 * 60 * 60 * 1000);
  const bars = await fetchHistoricalBars(apiKey, `C:${pair}`, 1, 'day', from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
  if (!bars?.length) return { available: false, reason: 'No price history returned.' };
  const last = bars[bars.length - 1];
  const byAge = (days) => {
    const cutoff = last.t - days * 24 * 60 * 60 * 1000;
    let pick = null;
    for (const bar of bars) if (bar.t <= cutoff) pick = bar;
    return pick;
  };
  const m1 = byAge(30);
  const m3 = byAge(90);
  const change = (ref) => (ref ? round((last.c / ref.c - 1) * 100, 2) : null);
  return {
    available: true,
    pair,
    last: last.c,
    lastDate: new Date(last.t).toISOString().slice(0, 10),
    change1m: change(m1),
    change3m: change(m3),
    source: { name: 'Massive (formerly Polygon.io) market data', url: 'https://massive.com' },
  };
}
