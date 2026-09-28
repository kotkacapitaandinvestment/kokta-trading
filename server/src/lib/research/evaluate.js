// Stages 2–4 of the research pipeline for a single currency:
//   normalize evidence → compare (revisions, trends, differentials) → score.
// Every factor score comes from explicit, documented rules applied to
// retrieved data. The language model never produces a score.

import { CURRENCIES, FACTORS, IMF_INDICATORS, RESERVE_CURRENCY_RESERVES_WEIGHT } from './currencies.js';
import { WEO_DATASET_URL, COFER_DATASET_URL, vintageLabel } from './sources/imf.js';
import { availableAsOf, periodEnd, periodStart, humanPeriod, round, DAY } from './series.js';

export const clamp = (v, lo = -2, hi = 2) => Math.max(lo, Math.min(hi, v));
const fmt = (v, dp = 2) => (v === null || v === undefined ? 'n/a' : Number(v).toFixed(dp));
const pct = (v, dp = 2) => (v === null || v === undefined ? 'n/a' : `${fmt(v, dp)}%`);
const pp = (v, dp = 2) => (v === null || v === undefined ? 'n/a' : `${v > 0 ? '+' : ''}${fmt(v, dp)}pp`);
const signed = (s) => (s > 0 ? `+${s}` : `${s}`);

function bandFor(score) {
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Moderately Strong';
  if (score >= 40) return 'Neutral / Mixed';
  if (score >= 20) return 'Moderately Weak';
  return 'Weak';
}

export function conditionFor(score) {
  if (score === null) return 'DATA NOT AVAILABLE';
  if (score >= 60) return 'STRONG';
  if (score >= 40) return 'NEUTRAL';
  return 'WEAK';
}

// Weighted composite over the factors that have evidence. `onlyKeys` lets the
// trend use a fixed factor set so points stay comparable over time.
export function composite(factors, onlyKeys = null) {
  let wSum = 0;
  let sSum = 0;
  for (const f of Object.values(factors)) {
    if (!f.available) continue;
    if (onlyKeys && !onlyKeys.includes(f.key)) continue;
    wSum += f.weight;
    sSum += f.weight * f.score;
  }
  if (!wSum) return null;
  return Math.round(50 + 25 * (sSum / wSum));
}

function freshnessScore(ageDays, expectedDays) {
  if (ageDays <= expectedDays) return 1;
  if (ageDays >= expectedDays * 3) return 0;
  return 1 - (ageDays - expectedDays) / (expectedDays * 2);
}

const EXPECTED_AGE = { D: 7, W: 14, M: 50, Q: 130, A: 200 };

// 1 when two figures agree within 0.5pp, falling linearly to 0 at 2pp apart.
const closeness = (a, b) => {
  const d = Math.abs(a - b);
  return d <= 0.5 ? 1 : Math.max(0, 1 - (d - 0.5) / 1.5);
};
const TIER_QUALITY = { 1: 1, 2: 1, 3: 0.95, 4: 0.8, 5: 0.5, curated: 0.75 };

// Picks the IMF WEO vintages that were public on `asOf`.
function imfAt(imf, asOf) {
  const cur = imf?.current;
  const prev = imf?.previous;
  const pub = (v) => (v?.publicationDate ? new Date(v.publicationDate).getTime() : Infinity);
  if (cur && pub(cur) <= asOf.getTime()) return { current: cur, previous: prev && pub(prev) <= asOf.getTime() ? prev : null };
  if (prev && pub(prev) <= asOf.getTime()) return { current: prev, previous: null };
  return { current: null, previous: null };
}

export function vintageName(v) {
  if (!v) return null;
  return v.vintageDate ? vintageLabel(v.vintageDate) : vintageLabel(v.publicationDate);
}

export function evaluateCurrency(code, evidence, { asOf = new Date(), marketPrice = null } = {}) {
  const cfg = CURRENCIES[code];
  const cur = evidence.currencies[code];
  const Y = asOf.getUTCFullYear();
  const observations = {};
  const notes = [];

  // ── Evidence accessors ──────────────────────────────────────────────────
  const seriesPoints = (role) => {
    const def = cfg.series[role];
    const s = cur?.series?.[role];
    if (!def || !s?.points?.length) return [];
    return availableAsOf(s, asOf, def.lagDays ?? 0);
  };
  const valueOn = (points, date) => {
    const t = date.getTime();
    let v = null;
    for (const p of points) {
      if (new Date(`${p.date}T00:00:00Z`).getTime() <= t) v = p;
      else break;
    }
    return v;
  };

  const addSeriesObs = (role, { id = `${code}.${role}`, compareDays = null, dataType = 'ACTUAL' } = {}) => {
    const def = cfg.series[role];
    const pts = seriesPoints(role);
    if (!def || !pts.length) return null;
    const latest = pts[pts.length - 1];
    let previous = pts.length > 1 ? pts[pts.length - 2] : null;
    if (compareDays && pts.length > 1) {
      previous = valueOn(pts.slice(0, -1), new Date(new Date(`${latest.date}T00:00:00Z`).getTime() - compareDays * DAY)) ?? previous;
    }
    const o = {
      id,
      currency: code,
      label: def.label,
      value: round(latest.value, 3),
      unit: def.unit,
      period: latest.period,
      periodLabel: humanPeriod(latest.period),
      previousValue: previous ? round(previous.value, 3) : null,
      previousPeriod: previous?.period ?? null,
      previousPeriodLabel: previous ? humanPeriod(previous.period) : null,
      forecastPeriod: null,
      publicationDate: null,
      retrievedAt: evidence.retrievedAt,
      frequency: def.frequency,
      dataType: def.market && dataType === 'ACTUAL' ? 'ACTUAL' : dataType,
      marketData: !!def.market,
      source: {
        name: cur.series[role]?.sourceRef && def.compiledFrom ? `${def.compiledFrom} (compiled by BIS)` : def.source.name,
        via: def.via ?? null,
        tier: def.source.tier,
        url: def.url,
      },
      spark: pts.slice(-13).map((p) => round(p.value, 3)),
      ageDays: Math.max(0, Math.round((asOf.getTime() - periodEnd(latest.date, def.frequency).getTime()) / DAY)),
    };
    observations[id] = o;
    return o;
  };

  const { current: weo, previous: weoPrev } = imfAt(evidence.imf, asOf);
  const imfSeries = (v, ind) => v?.series?.[cfg.imf]?.[ind] ?? null;
  const imfVal = (v, ind, year) => {
    const s = imfSeries(v, ind);
    const val = s?.values?.[String(year)];
    return val === undefined ? null : val;
  };
  const imfIsActual = (v, ind, year) => {
    const la = imfSeries(v, ind)?.latestActual;
    return la ? year <= la : false;
  };
  const addImfObs = (ind, year, { vintage = weo, tag = 'cur' } = {}) => {
    const value = imfVal(vintage, ind, year);
    if (value === null) return null;
    const id = `${code}.imf.${tag}.${ind}.${year}`;
    const actual = imfIsActual(vintage, ind, year);
    const prevValue = vintage === weo ? imfVal(weoPrev, ind, year) : null;
    observations[id] = {
      id,
      currency: code,
      label: `${IMF_INDICATORS[ind].label}${actual ? '' : ' — IMF projection'}`,
      value,
      unit: IMF_INDICATORS[ind].unit,
      period: String(year),
      periodLabel: String(year),
      previousValue: prevValue,
      previousPeriod: prevValue !== null ? `${vintageName(weoPrev)} WEO` : null,
      previousPeriodLabel: prevValue !== null ? `${vintageName(weoPrev)} WEO` : null,
      forecastPeriod: actual ? null : String(year),
      publicationDate: vintage.publicationDate,
      retrievedAt: evidence.retrievedAt,
      frequency: 'A',
      dataType: actual ? 'ACTUAL' : 'FORECAST',
      source: { name: 'International Monetary Fund', via: `World Economic Outlook, ${vintageName(vintage)}`, tier: 1, url: WEO_DATASET_URL },
      ageDays: Math.round((asOf.getTime() - new Date(vintage.publicationDate).getTime()) / DAY),
    };
    return observations[id];
  };

  const factors = {};
  const weightFor = (key) => (key === 'reserves' && cfg.reserveCurrency ? RESERVE_CURRENCY_RESERVES_WEIGHT : FACTORS.find((f) => f.key === key).weight);
  const setFactor = (key, data) => {
    const meta = FACTORS.find((f) => f.key === key);
    factors[key] = {
      key,
      label: meta.label,
      weight: weightFor(key),
      available: data.available !== false,
      score: data.available === false ? null : clamp(Math.round(data.score)),
      classification: data.classification ?? null,
      rationale: data.rationale ?? '',
      rules: data.rules ?? [],
      evidence: (data.evidence ?? []).filter(Boolean).map((o) => (typeof o === 'string' ? o : o.id)),
      unavailableReason: data.unavailableReason ?? null,
      tension: !!data.tension,
      extra: data.extra ?? null,
    };
  };

  // ── Monetary policy (ACTUAL central-bank policy) ────────────────────────
  const policy = (() => {
    const isRange = !!cfg.series.policyUpper;
    const upperPts = seriesPoints(isRange ? 'policyUpper' : 'policyRate');
    const lowerPts = isRange ? seriesPoints('policyLower') : upperPts;
    if (!upperPts.length) return null;
    const rateAt = (date) => {
      const u = valueOn(upperPts, date);
      const l = valueOn(lowerPts, date);
      return u && l ? (u.value + l.value) / 2 : null;
    };
    const oUpper = addSeriesObs(isRange ? 'policyUpper' : 'policyRate');
    const oLower = isRange ? addSeriesObs('policyLower') : null;
    const current = rateAt(asOf);
    const changes = [];
    for (let i = 1; i < upperPts.length; i++) {
      const prevMid = isRange ? (upperPts[i - 1].value + (valueOn(lowerPts, new Date(`${upperPts[i - 1].date}T00:00:00Z`))?.value ?? upperPts[i - 1].value)) / 2 : upperPts[i - 1].value;
      const mid = isRange ? (upperPts[i].value + (valueOn(lowerPts, new Date(`${upperPts[i].date}T00:00:00Z`))?.value ?? upperPts[i].value)) / 2 : upperPts[i].value;
      if (Math.abs(mid - prevMid) > 1e-9) {
        const d = new Date(`${upperPts[i].date}T00:00:00Z`);
        const toDisplay = isRange ? `${fmt(valueOn(lowerPts, d)?.value)}–${fmt(upperPts[i].value)}%` : pct(mid);
        changes.push({ date: upperPts[i].date, from: round(prevMid, 3), to: round(mid, 3), toDisplay, bp: Math.round((mid - prevMid) * 100) });
      }
    }
    const lastChange = changes[changes.length - 1] ?? null;
    const at = (days) => rateAt(new Date(asOf.getTime() - days * DAY));
    const cum6m = current !== null && at(182) !== null ? Math.round((current - at(182)) * 100) : null;
    const cum12m = current !== null && at(365) !== null ? Math.round((current - at(365)) * 100) : null;
    const display = isRange ? `${fmt(oLower?.value)}–${fmt(oUpper?.value)}%` : pct(oUpper?.value);
    return { current, display, changes, lastChange, cum6m, cum12m, rate6mAgo: at(182), observations: [oUpper, oLower].filter(Boolean), windowStart: cur.series[isRange ? 'policyUpper' : 'policyRate']?.windowStart ?? null };
  })();

  // Inflation evidence (needed by policy real-rate and inflation factor).
  const oTargetInfl = addSeriesObs('targetInflation', { compareDays: 85 });
  const oCoreInfl = addSeriesObs('coreInflation', { compareDays: 85 });
  const oHeadlineCpi = cfg.series.headlineCpi ? addSeriesObs('headlineCpi', { compareDays: 85 }) : null;
  const oCoreCpi = cfg.series.coreCpi ? addSeriesObs('coreCpi', { compareDays: 85 }) : null;
  const inflForReal = oCoreInfl ?? oTargetInfl;
  const realRate = policy?.current !== null && policy?.current !== undefined && inflForReal ? round(policy.current - inflForReal.value, 2) : null;

  let stance = null;
  if (!policy || policy.current === null) {
    setFactor('monetary_policy', { available: false, unavailableReason: 'We don’t have policy rate data for this currency right now.' });
  } else {
    const recentDays = policy.lastChange ? Math.round((asOf.getTime() - new Date(`${policy.lastChange.date}T00:00:00Z`).getTime()) / DAY) : null;
    let score = 0;
    let movement;
    if (policy.cum6m > 0) {
      stance = 'HAWKISH';
      movement = 'tightening';
      score = 1 + (policy.lastChange?.bp > 0 && recentDays <= 120 ? 1 : 0);
      if (realRate !== null && realRate < -1) score = Math.min(score, 1);
    } else if (policy.cum6m < 0) {
      stance = 'DOVISH';
      movement = 'easing';
      score = -1 - (policy.lastChange?.bp < 0 && recentDays <= 120 ? 1 : 0);
      if (realRate !== null && realRate >= 2) score = Math.max(score, -1);
    } else {
      movement = 'on hold';
      if (realRate !== null && realRate >= 1.5) {
        stance = 'HAWKISH';
        score = 1;
      } else if (realRate !== null && realRate <= -0.5) {
        stance = 'DOVISH';
        score = -1;
      } else {
        stance = 'NEUTRAL';
        score = 0;
      }
    }
    const lc = policy.lastChange;
    const lastMove = lc ? `last move: ${lc.bp > 0 ? 'hike' : 'cut'} of ${Math.abs(lc.bp)}bp effective ${humanPeriod(lc.date)}` : `no change since at least ${humanPeriod(policy.windowStart)}`;
    setFactor('monetary_policy', {
      score,
      classification: stance,
      rationale: `${cfg.centralBank.short} policy rate ${policy.display} — ${movement} (${policy.cum6m > 0 ? '+' : ''}${policy.cum6m}bp over 6 months; ${lastMove}). Real policy rate ${realRate !== null ? pp(realRate).replace('pp', ' pts') : 'n/a'} (policy rate minus ${inflForReal ? inflForReal.label : 'inflation'}).`,
      rules: [
        'Tightening over the last 6 months scores +1, or +2 if the latest move was a hike within 120 days (capped at +1 if the real rate is below −1).',
        'Easing scores −1, or −2 if the latest move was a cut within 120 days (floored at −1 if the real rate is ≥ 2).',
        'On hold: +1 if the real rate is ≥ 1.5 (restrictive), −1 if ≤ −0.5 (accommodative), otherwise 0.',
      ],
      evidence: [...policy.observations, inflForReal],
      extra: { stance, realRate, cum6m: policy.cum6m, cum12m: policy.cum12m, lastChange: lc, recentDays },
    });
  }

  // ── Market expectations (separate from actual policy; never scored) ─────
  let marketExpectations = null;
  const oY2 = cfg.series.yield2y ? addSeriesObs('yield2y', { compareDays: 30, dataType: 'ACTUAL' }) : null;
  if (oY2 && policy?.current !== null && policy?.current !== undefined) {
    const spread = round(oY2.value - policy.current, 2);
    const change1m = oY2.previousValue !== null ? round(oY2.value - oY2.previousValue, 2) : null;
    const pricing = spread > 0.25 ? 'TIGHTENING' : spread < -0.25 ? 'EASING' : 'STEADY';
    const divergent = (stance === 'HAWKISH' && pricing === 'EASING') || (stance === 'DOVISH' && pricing === 'TIGHTENING');
    marketExpectations = {
      available: true,
      pricing,
      spread,
      change1m,
      divergent,
      evidence: [oY2.id, ...(policy.observations.map((o) => o.id))],
      summary:
        pricing === 'TIGHTENING'
          ? `The 2-year yield (${pct(oY2.value)}) sits ${fmt(spread)} pts above the policy rate, consistent with markets expecting further tightening.`
          : pricing === 'EASING'
            ? `The 2-year yield (${pct(oY2.value)}) sits ${fmt(Math.abs(spread))} pts below the policy rate, consistent with markets expecting easing.`
            : `The 2-year yield (${pct(oY2.value)}) is within 0.25 pts of the policy rate, consistent with markets expecting broadly steady policy.`,
      caveat: 'Based on 2-year government bond yields compared with the policy rate: a rough guide to where markets expect rates to go, not an exact forecast.',
    };
  } else {
    marketExpectations = { available: false, summary: 'MARKET EXPECTATION DATA NOT AVAILABLE — we don’t have an official source for what markets expect from this central bank yet.' };
  }

  // ── Growth ───────────────────────────────────────────────────────────────
  const gY = addImfObs('NGDP_RPCH', Y);
  const gY1 = addImfObs('NGDP_RPCH', Y + 1);
  const mediumYear = [Y + 5, Y + 4].find((yr) => imfVal(weo, 'NGDP_RPCH', yr) !== null);
  const gMed = mediumYear ? addImfObs('NGDP_RPCH', mediumYear) : null;
  const oGdpYoY = cfg.series.gdpYoY ? addSeriesObs('gdpYoY', { compareDays: 170 }) : null;
  const oGdpQoQ = cfg.series.gdpQoQ ? addSeriesObs('gdpQoQ') : null;
  const oUnemp = cfg.series.unemployment ? addSeriesObs('unemployment', { compareDays: 175 }) : null;
  let growthMomentum = null;
  if (!gY && !oGdpYoY) {
    setFactor('growth', { available: false, unavailableReason: 'No IMF growth projection or official GDP series available.' });
  } else {
    let score = 0;
    const parts = [];
    if (gY && gMed) {
      const gap = round(gY.value - gMed.value, 2);
      score = gap >= 0.75 ? 2 : gap >= 0.25 ? 1 : gap > -0.25 ? 0 : gap > -0.75 ? -1 : -2;
      parts.push(`IMF projects ${Y} growth of ${pct(gY.value)} against ${pct(gMed.value)} for ${mediumYear} (its medium-term anchor), a gap of ${pp(gap)}`);
    }
    if (oGdpYoY && oGdpYoY.previousValue !== null) {
      const d = round(oGdpYoY.value - oGdpYoY.previousValue, 2);
      growthMomentum = d >= 0.5 ? 'ACCELERATING' : d <= -0.5 ? 'SLOWING' : 'STABLE';
      if (growthMomentum === 'ACCELERATING') score += 1;
      if (growthMomentum === 'SLOWING') score -= 1;
      parts.push(`official GDP growth ${pct(oGdpYoY.value)} y/y in ${oGdpYoY.periodLabel} vs ${pct(oGdpYoY.previousValue)} in ${oGdpYoY.previousPeriodLabel} (${growthMomentum.toLowerCase()})`);
    } else if (gY && gY1) {
      const d = round(gY1.value - gY.value, 2);
      growthMomentum = d >= 0.3 ? 'ACCELERATING' : d <= -0.3 ? 'SLOWING' : 'STABLE';
      parts.push(`IMF projects ${pct(gY1.value)} for ${Y + 1} (${growthMomentum.toLowerCase()} vs ${Y})`);
    }
    if (oUnemp && oUnemp.previousValue !== null) {
      const du = round(oUnemp.value - oUnemp.previousValue, 2);
      if (du >= 0.4) {
        score -= 1;
        parts.push(`unemployment up ${pp(du)} to ${pct(oUnemp.value)} since ${oUnemp.previousPeriodLabel}, a loosening labour market`);
      } else {
        parts.push(`unemployment ${pct(oUnemp.value)} (${oUnemp.periodLabel}), ${pp(du)} vs ${oUnemp.previousPeriodLabel}`);
      }
    }
    setFactor('growth', {
      score,
      classification: growthMomentum ?? 'STABLE',
      rationale: `${parts.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()),
      rules: [
        'Base score from the IMF current-year growth projection minus its medium-term (t+5) projection: ≥ +0.75pp → +2, ≥ +0.25 → +1, within ±0.25 → 0, ≤ −0.25 → −1, ≤ −0.75 → −2.',
        'Momentum: official y/y GDP growth vs two quarters earlier, ±0.5pp → ±1 (accelerating/slowing).',
        'Labour market: unemployment up ≥ 0.4pp over ~6 months → −1.',
      ],
      evidence: [gY, gY1, gMed, oGdpYoY, oGdpQoQ, oUnemp],
      extra: { momentum: growthMomentum },
    });
  }

  // ── Inflation (interpreted with growth and the central-bank response) ───
  const target = cfg.centralBank.target;
  const gapToTarget = (v) => {
    if (Array.isArray(target)) return v > target[1] ? v - target[1] : v < target[0] ? v - target[0] : 0;
    return v - target;
  };
  const targetLabel = Array.isArray(target) ? `${target[0]}–${target[1]}%` : `${target}%`;
  if (!oTargetInfl) {
    setFactor('inflation', { available: false, unavailableReason: 'No official inflation series available.' });
  } else {
    const gap = round(gapToTarget(oTargetInfl.value), 2);
    const coreGap = oCoreInfl ? round(gapToTarget(oCoreInfl.value), 2) : null;
    const trend = oTargetInfl.previousValue !== null ? round(oTargetInfl.value - oTargetInfl.previousValue, 2) : 0;
    const trendWord = trend > 0.2 ? 'RISING' : trend < -0.2 ? 'EASING' : 'STABLE';
    const responding = stance === 'HAWKISH' || (realRate !== null && realRate >= 1);
    let score;
    let classification;
    let why;
    const tol = Array.isArray(target) ? 0 : 0.5;
    if (Math.abs(gap) <= tol) {
      classification = `NEAR TARGET · ${trendWord}`;
      if (coreGap !== null && coreGap > 1) {
        score = 0;
        why = `headline is near target but core (${pct(oCoreInfl.value)}) is still ${pp(coreGap)} above it, so price pressure is not fully resolved`;
      } else {
        score = 1;
        why = 'inflation close to target supports policy credibility and stable real returns';
      }
    } else if (gap > 0) {
      classification = `ABOVE TARGET · ${trendWord}`;
      if (responding) {
        score = trend > 0.2 ? -1 : 0;
        why = trend > 0.2 ? 'inflation is still rising despite a restrictive policy response' : 'inflation is above target but the central bank is responding';
      } else {
        score = trend > 0.2 || gap > 2 ? -2 : -1;
        why = 'inflation is above target without a restrictive policy response, eroding real value';
      }
    } else {
      classification = `BELOW TARGET · ${trendWord}`;
      score = gap < -1.5 && trend < 0 ? -2 : -1;
      why = 'an inflation undershoot points to easing pressure on policy';
    }
    setFactor('inflation', {
      score,
      classification,
      rationale: `${oTargetInfl.label} ${pct(oTargetInfl.value)} (${oTargetInfl.periodLabel}) vs the ${targetLabel} target (gap ${pp(gap)}), ${trendWord.toLowerCase()} from ${pct(oTargetInfl.previousValue)} in ${oTargetInfl.previousPeriodLabel}${oCoreInfl ? `; core ${pct(oCoreInfl.value)}` : ''}. Kotka reads this as: ${why}.`,
      rules: [
        `Within ±${tol}pp of target: +1 (0 if core is still > 1pp above target).`,
        'Above target with a restrictive response (tightening stance or real rate ≥ 1): 0, or −1 if still rising (> +0.2pp over ~3 months).',
        'Above target without a restrictive response: −1, or −2 if rising or > 2pp above target.',
        'Below target: −1, or −2 if > 1.5pp below and still falling.',
      ],
      evidence: [oTargetInfl, oCoreInfl, oHeadlineCpi, oCoreCpi, policy?.observations?.[0]],
      tension: score === 0 && Math.abs(gap) > tol,
      extra: { gap, coreGap, trend, responding, target: targetLabel },
    });
  }

  // ── IMF forecast revisions ───────────────────────────────────────────────
  const revisions = [];
  if (weo && weoPrev) {
    const rows = [
      ['NGDP_RPCH', Y - 1],
      ['NGDP_RPCH', Y],
      ['NGDP_RPCH', Y + 1],
      ['PCPIPCH', Y],
      ['PCPIPCH', Y + 1],
      ['BCA_NGDPD', Y],
      ['GGXCNL_NGDP', Y],
      ['GGXWDG_NGDP', Y],
    ];
    for (const [ind, year] of rows) {
      const current = imfVal(weo, ind, year);
      const previous = imfVal(weoPrev, ind, year);
      if (current === null || previous === null) continue;
      const revision = round(current - previous, 2);
      const prevType = imfIsActual(weoPrev, ind, year) ? 'ACTUAL' : 'FORECAST';
      const curType = imfIsActual(weo, ind, year) ? 'ACTUAL' : 'FORECAST';
      const higherIsBetter = ind !== 'PCPIPCH';
      const direction = Math.abs(revision) < 0.05 ? 'UNCHANGED' : revision > 0 ? 'UP' : 'DOWN';
      revisions.push({
        indicator: ind,
        label: IMF_INDICATORS[ind].label,
        unit: IMF_INDICATORS[ind].unit,
        year,
        previous,
        current,
        revision,
        direction,
        kind: prevType === 'FORECAST' && curType === 'ACTUAL' ? 'OUTTURN_VS_FORECAST' : 'FORECAST_REVISION',
        previousVintage: vintageName(weoPrev),
        currentVintage: vintageName(weo),
        previousPublished: weoPrev.publicationDate,
        currentPublished: weo.publicationDate,
        tone: direction === 'UNCHANGED' ? 'neutral' : (revision > 0) === higherIsBetter ? 'positive' : 'negative',
        interpretation: interpretRevision(ind, year, revision, prevType, curType),
      });
    }
    const growthRevs = revisions.filter((r) => r.indicator === 'NGDP_RPCH' && r.kind === 'FORECAST_REVISION');
    const fiscalRev = revisions.find((r) => r.indicator === 'GGXCNL_NGDP' && r.year === Y);
    if (!growthRevs.length) {
      setFactor('imf_revisions', { available: false, unavailableReason: 'No comparable IMF growth forecasts across vintages.' });
    } else {
      const sum = round(growthRevs.reduce((s, r) => s + r.revision, 0), 2);
      let score = sum >= 0.8 ? 2 : sum >= 0.3 ? 1 : sum <= -0.8 ? -2 : sum <= -0.3 ? -1 : 0;
      if (fiscalRev && fiscalRev.revision <= -1) score -= 1;
      if (fiscalRev && fiscalRev.revision >= 1) score += 1;
      setFactor('imf_revisions', {
        score,
        classification: sum > 0.05 ? 'UPGRADED' : sum < -0.05 ? 'DOWNGRADED' : 'UNCHANGED',
        rationale: `Between the ${vintageName(weoPrev)} and ${vintageName(weo)} WEO, the IMF revised growth by ${growthRevs.map((r) => `${pp(r.revision)} for ${r.year}`).join(' and ')} (cumulative ${pp(sum)})${fiscalRev ? `; the ${Y} fiscal balance was revised ${pp(fiscalRev.revision)} of GDP` : ''}.`,
        rules: [
          'Cumulative growth revision for the current and next year: ≥ +0.8pp → +2, ≥ +0.3 → +1, ≤ −0.3 → −1, ≤ −0.8 → −2.',
          'Fiscal balance revised by ≥ 1pp of GDP: ±1.',
        ],
        evidence: growthRevs.map((r) => addImfObs('NGDP_RPCH', r.year)),
        tension: score === 0 && Math.abs(sum) >= 0.15,
        extra: { cumulativeGrowthRevision: sum },
      });
    }
  } else {
    setFactor('imf_revisions', { available: false, unavailableReason: weo ? 'No earlier IMF WEO vintage available for comparison.' : 'IMF World Economic Outlook data not available.' });
  }

  // ── Fiscal position ──────────────────────────────────────────────────────
  const fBal = addImfObs('GGXCNL_NGDP', Y);
  const fPrim = addImfObs('GGXONLB_NGDP', Y);
  const debtPrev = addImfObs('GGXWDG_NGDP', Y - 1);
  const debtNow = addImfObs('GGXWDG_NGDP', Y);
  const debtFwd = addImfObs('GGXWDG_NGDP', Y + 2);
  if (!fBal && !debtNow) {
    setFactor('fiscal', { available: false, unavailableReason: 'IMF fiscal data not available.' });
  } else {
    let score = 0;
    let trajectory = 'STABLE';
    const parts = [];
    if (fBal) {
      score = fBal.value >= -1 ? 1 : fBal.value >= -4 ? 0 : fBal.value >= -7 ? -1 : -2;
      parts.push(`general government balance ${pct(fBal.value, 1)} of GDP in ${Y}${fPrim ? ` (primary ${pct(fPrim.value, 1)})` : ''}`);
    }
    if (debtPrev && debtFwd) {
      const d = round(debtFwd.value - debtPrev.value, 1);
      trajectory = d <= -1.5 ? 'IMPROVING' : d >= 1.5 ? 'DETERIORATING' : 'STABLE';
      if (trajectory === 'IMPROVING') score += 1;
      if (trajectory === 'DETERIORATING') score -= 1;
      parts.push(`gross debt ${pct(debtPrev.value, 1)} of GDP in ${Y - 1} → ${pct(debtFwd.value, 1)} projected for ${Y + 2} (${pp(d, 1)}, ${trajectory.toLowerCase()})`);
    }
    if (code === 'USD') parts.push('reserve-currency status lowers, but does not remove, market sensitivity to these metrics');
    setFactor('fiscal', {
      score,
      classification: trajectory,
      rationale: `${parts.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()),
      rules: [
        'Overall balance (% of GDP): ≥ −1 → +1, ≥ −4 → 0, ≥ −7 → −1, below → −2.',
        'Debt trajectory (IMF, t−1 to t+2): falling ≥ 1.5pp → +1 (improving), rising ≥ 1.5pp → −1 (deteriorating).',
      ],
      evidence: [fBal, fPrim, debtPrev, debtNow, debtFwd],
    });
  }

  // ── External position ────────────────────────────────────────────────────
  const caPrev = addImfObs('BCA_NGDPD', Y - 1);
  const caNow = addImfObs('BCA_NGDPD', Y);
  const caNext = addImfObs('BCA_NGDPD', Y + 1);
  if (!caNow) {
    setFactor('external', { available: false, unavailableReason: 'IMF current account data not available.' });
  } else {
    let score = caNow.value >= 4 ? 2 : caNow.value >= 1.5 ? 1 : caNow.value > -1.5 ? 0 : caNow.value > -4 ? -1 : -2;
    let trend = null;
    if (caPrev && caNext) {
      trend = round(caNext.value - caPrev.value, 1);
      if (trend >= 1) score += 1;
      if (trend <= -1) score -= 1;
    }
    const final = clamp(score);
    setFactor('external', {
      score: final,
      classification: final >= 1 ? 'SUPPORTIVE' : final <= -1 ? 'NEGATIVE' : 'NEUTRAL',
      rationale: `Current account ${pct(caNow.value, 1)} of GDP in ${Y}${caPrev && caNext ? `, moving from ${pct(caPrev.value, 1)} (${Y - 1}) to ${pct(caNext.value, 1)} projected for ${Y + 1}` : ''}.`,
      rules: ['Current account (% of GDP): ≥ 4 → +2, ≥ 1.5 → +1, within ±1.5 → 0, > −4 → −1, below → −2.', 'Trend from t−1 to t+1 of ±1pp or more: ±1.'],
      evidence: [caPrev, caNow, caNext],
      tension: final === 0 && trend !== null && Math.abs(trend) >= 0.5,
      extra: { trend },
    });
  }

  // ── FX reserves ──────────────────────────────────────────────────────────
  const quarterEnd = (period) => periodEnd(periodStart(period), 'Q');
  const coferPts = (cur.cofer ?? []).filter((p) => quarterEnd(p.period).getTime() + 95 * DAY <= asOf.getTime());
  if (cfg.reserveCurrency && coferPts.length >= 2) {
    const latest = coferPts[coferPts.length - 1];
    const yearAgo = coferPts.length >= 5 ? coferPts[coferPts.length - 5] : coferPts[0];
    const d = round(latest.value - yearAgo.value, 2);
    const id = `${code}.cofer`;
    observations[id] = {
      id,
      currency: code,
      label: `${code} share of allocated global FX reserves`,
      value: round(latest.value, 2),
      unit: '%',
      period: latest.period,
      periodLabel: humanPeriod(latest.period),
      previousValue: round(yearAgo.value, 2),
      previousPeriod: yearAgo.period,
      previousPeriodLabel: humanPeriod(yearAgo.period),
      forecastPeriod: null,
      publicationDate: null,
      retrievedAt: evidence.retrievedAt,
      frequency: 'Q',
      dataType: 'ACTUAL',
      source: { name: 'International Monetary Fund', via: 'Currency Composition of Official Foreign Exchange Reserves (COFER)', tier: 1, url: COFER_DATASET_URL },
      spark: coferPts.slice(-8).map((p) => round(p.value, 2)),
      ageDays: Math.round((asOf.getTime() - quarterEnd(latest.period).getTime()) / DAY),
    };
    const score = d >= 0.5 ? 1 : d <= -0.5 ? -1 : 0;
    setFactor('reserves', {
      score,
      classification: score > 0 ? 'RISING RESERVE DEMAND' : score < 0 ? 'DECLINING RESERVE DEMAND' : 'STABLE RESERVE DEMAND',
      rationale: `${code} is a reserve currency, so import-cover style reserve adequacy is of limited relevance; Kotka instead tracks its share of global allocated reserves: ${pct(latest.value)} in ${humanPeriod(latest.period)} vs ${pct(yearAgo.value)} in ${humanPeriod(yearAgo.period)} (${pp(d)}).`,
      rules: ['Reserve currencies: change in share of allocated global reserves over ~1 year, ≥ +0.5pp → +1, ≤ −0.5pp → −1. Weighted lower than for emerging-market currencies.'],
      evidence: [id],
    });
  } else {
    setFactor('reserves', {
      available: false,
      unavailableReason: cfg.cofer ? 'The IMF’s reserve data isn’t available right now.' : `The IMF doesn’t report ${code} reserves separately, and we don’t have another official source for it yet.`,
    });
  }

  // ── Currency valuation (formal assessments only) ─────────────────────────
  const valuation = (cur.assessments ?? []).filter((a) => a.factor === 'valuation' && new Date(a.publishedAt).getTime() <= asOf.getTime()).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))[0];
  const oReer = cfg.series.reer ? addSeriesObs('reer', { compareDays: 360 }) : null;
  let reerContext = null;
  if (oReer) {
    const pts = seriesPoints('reer');
    const avg = pts.reduce((s, p) => s + p.value, 0) / pts.length;
    const dev = round(((oReer.value / avg) - 1) * 100, 1);
    reerContext = {
      observation: oReer.id,
      deviationPct: dev,
      windowFrom: humanPeriod(pts[0].period),
      text: `Real effective exchange rate ${fmt(oReer.value, 1)} (${oReer.periodLabel}) is ${Math.abs(dev)}% ${dev >= 0 ? 'above' : 'below'} its average since ${humanPeriod(pts[0].period)}. This is Kotka context from BIS data — it is not a valuation assessment.`,
    };
  }
  if (valuation) {
    const cls = String(valuation.classification ?? '').toUpperCase();
    const score = /SUBSTANTIALLY UNDER|STRONGLY UNDER/.test(cls) ? 2 : /UNDER/.test(cls) ? 1 : /SUBSTANTIALLY OVER|STRONGLY OVER/.test(cls) ? -2 : /OVER/.test(cls) ? -1 : 0;
    const id = `${code}.assessment.${valuation.id}`;
    observations[id] = {
      id,
      currency: code,
      label: valuation.title,
      value: null,
      text: valuation.statement,
      classification: cls,
      unit: null,
      period: new Date(valuation.publishedAt).toISOString().slice(0, 10),
      periodLabel: humanPeriod(new Date(valuation.publishedAt).toISOString().slice(0, 10)),
      publicationDate: new Date(valuation.publishedAt).toISOString(),
      retrievedAt: evidence.retrievedAt,
      dataType: 'SOURCE ASSESSMENT',
      curated: true,
      source: { name: valuation.institution, via: 'Curated by a Kotka administrator from the original publication', tier: 'curated', url: valuation.url },
      ageDays: Math.round((asOf.getTime() - new Date(valuation.publishedAt).getTime()) / DAY),
    };
    setFactor('valuation', {
      score,
      classification: cls || 'ASSESSED',
      rationale: `${valuation.institution}: "${valuation.statement}"`,
      rules: ['Formal valuation assessment only: substantially undervalued +2, undervalued +1, broadly in line 0, overvalued −1, substantially overvalued −2 (under-valuation implies scope to appreciate).'],
      evidence: [id],
      extra: { reer: reerContext },
    });
  } else {
    setFactor('valuation', {
      available: false,
      classification: 'IMF FORMAL VALUATION: NOT AVAILABLE',
      unavailableReason: 'IMF FORMAL VALUATION: NOT AVAILABLE — no External Sector Report assessment has been recorded for this currency. Kotka does not infer a valuation.',
      extra: { reer: reerContext },
    });
  }

  // ── Financial stability ──────────────────────────────────────────────────
  const oStress = cfg.series.stress ? addSeriesObs('stress', { compareDays: 30 }) : null;
  const oStressAlt = cfg.series.stressAlt ? addSeriesObs('stressAlt', { compareDays: 28 }) : null;
  const oIT = cfg.series.longRateIT ? addSeriesObs('longRateIT') : null;
  const oDE = cfg.series.longRateDE ? addSeriesObs('longRateDE') : null;
  if (!oStress) {
    setFactor('financial_stability', { available: false, unavailableReason: 'We don’t track a financial-stress measure for this economy yet.' });
  } else {
    const v = oStress.value;
    let score = v < 0.05 ? 1 : v < 0.15 ? 0 : v < 0.3 ? -1 : -2;
    const parts = [`Financial stress index ${fmt(v, 3)} (${oStress.periodLabel}; 0 = no stress, 1 = extreme)`];
    const dm = oStress.previousValue !== null ? round(v - oStress.previousValue, 3) : null;
    if (dm !== null && dm >= 0.05) {
      score -= 1;
      parts.push(`up ${fmt(dm, 3)} in a month`);
    }
    if (oStressAlt) parts.push(`St. Louis Fed Financial Stress Index ${fmt(oStressAlt.value)} (${oStressAlt.periodLabel}; 0 = normal)`);
    let spread = null;
    if (oIT && oDE && oIT.period === oDE.period) {
      spread = round(oIT.value - oDE.value, 2);
      const sid = `${code}.sovereignSpread`;
      observations[sid] = {
        ...oIT,
        id: sid,
        label: 'Italy–Germany 10-year sovereign spread',
        value: spread,
        unit: 'pts',
        previousValue: null,
        previousPeriod: null,
        previousPeriodLabel: null,
        dataType: 'KOTKA INTERPRETATION',
        derivedFrom: [oIT.id, oDE.id],
        spark: null,
      };
      if (spread > 2.5) score -= 1;
      parts.push(`Italy–Germany 10-year spread ${fmt(spread)} pts (${oIT.periodLabel})${spread > 2.5 ? ', signalling sovereign fragmentation risk' : ''}`);
    }
    setFactor('financial_stability', {
      score,
      classification: score >= 1 ? 'LOW STRESS' : score === 0 ? 'NORMAL' : score === -1 ? 'ELEVATED STRESS' : 'HIGH STRESS',
      rationale: `${parts.join('; ')}.`,
      rules: ['Stress index level: < 0.05 → +1, < 0.15 → 0, < 0.30 → −1, higher → −2.', 'Stress index up ≥ 0.05 in a month: −1.', 'Euro area: Italy–Germany 10-year spread above 2.5 pts: −1.'],
      evidence: [oStress, oStressAlt, spread !== null ? `${code}.sovereignSpread` : null],
    });
  }

  // ── Composite, confidence, drivers ───────────────────────────────────────
  const score = composite(factors);
  const available = Object.values(factors).filter((f) => f.available);
  const totalW = Object.values(factors).reduce((s, f) => s + f.weight, 0);
  const coverage = available.reduce((s, f) => s + f.weight, 0) / totalW;

  const usedObs = [...new Set(available.flatMap((f) => f.evidence))].map((id) => observations[id]).filter(Boolean);
  const freshness = usedObs.length
    ? usedObs.reduce((s, o) => s + freshnessScore(o.ageDays ?? 0, EXPECTED_AGE[o.frequency] ?? (o.curated ? 400 : 200)), 0) / usedObs.length
    : 0;
  const quality = usedObs.length ? usedObs.reduce((s, o) => s + (TIER_QUALITY[o.source?.tier] ?? 0.7), 0) / usedObs.length : 0;

  const wAvail = available.reduce((s, f) => s + f.weight, 0);
  const mean = wAvail ? available.reduce((s, f) => s + f.weight * f.score, 0) / wAvail : 0;
  const agreement = wAvail ? 1 - available.reduce((s, f) => s + f.weight * Math.abs(f.score - mean), 0) / (wAvail * 2) : 0;

  const consistencyParts = [];
  if (oGdpYoY && gY) consistencyParts.push(closeness(oGdpYoY.value, gY.value));
  const infY = imfVal(weo, 'PCPIPCH', Y);
  if (oTargetInfl && infY !== null) consistencyParts.push(closeness(oTargetInfl.value, infY));
  // Two checks (growth, inflation); a check that can't be made counts as 0.5 (unknown), not as agreement.
  const consistency = (consistencyParts.reduce((a, b) => a + b, 0) + 0.5 * (2 - consistencyParts.length)) / 2;

  const maxRev = revisions.filter((r) => r.indicator === 'NGDP_RPCH' && r.kind === 'FORECAST_REVISION').reduce((m, r) => Math.max(m, Math.abs(r.revision)), 0);
  const stability = revisions.length ? (maxRev <= 0.3 ? 1 : maxRev >= 1.5 ? 0 : 1 - (maxRev - 0.3) / 1.2) : 0.5;

  const marketCheck = !marketExpectations?.available ? 0.4 : marketExpectations.divergent ? 0.2 : 1;
  // Depth: how much independent evidence sits behind the scored factors
  // (a factor resting on one annual IMF number is thinner than one backed by
  // monthly national data, core measures and market data).
  const depth = Math.min(1, usedObs.length / 20);
  const components = [
    { key: 'coverage', label: 'Evidence coverage', weight: 0.25, value: round(coverage, 2), detail: `${available.length} of ${FACTORS.length} factors have verified evidence` },
    { key: 'depth', label: 'Evidence depth', weight: 0.1, value: round(depth, 2), detail: `${usedObs.length} verified data points behind the scored factors` },
    { key: 'freshness', label: 'Data recency', weight: 0.15, value: round(freshness, 2), detail: 'Age of each data point relative to its normal release cycle' },
    { key: 'quality', label: 'Source quality', weight: 0.1, value: round(quality, 2), detail: 'Tier 1–2 (IMF, central banks) score highest; curated entries lowest' },
    { key: 'agreement', label: 'Agreement between factors', weight: 0.2, value: round(agreement, 2), detail: 'Lower when factors point in opposite directions' },
    { key: 'consistency', label: 'Actual data vs IMF projections', weight: 0.1, value: round(consistency, 2), detail: 'Lower when the latest official data diverges from the IMF path, or cannot be checked' },
    { key: 'stability', label: 'Forecast stability', weight: 0.05, value: round(stability, 2), detail: 'Lower after large IMF growth revisions' },
    {
      key: 'market',
      label: 'Market cross-check',
      weight: 0.05,
      value: marketCheck,
      detail: !marketExpectations?.available ? 'No market-expectations source for this currency' : marketExpectations.divergent ? 'Market pricing contradicts the actual policy direction' : 'Market pricing is consistent with the policy direction',
    },
  ];
  const confidence = score === null ? 0 : Math.max(0, Math.min(100, Math.round(components.reduce((s, c) => s + c.weight * c.value, 0) * 100)));

  // Data freshness disclosure (IMF vintage vs latest official data).
  if (weo) {
    const latestOfficial = [oGdpYoY, oTargetInfl].filter(Boolean).sort((a, b) => b.period.localeCompare(a.period))[0];
    if (latestOfficial && new Date(weo.publicationDate).getTime() < periodEnd(periodStart(latestOfficial.period), latestOfficial.frequency).getTime()) {
      notes.push({
        kind: 'freshness',
        text: `IMF projections are from the ${vintageName(weo)} World Economic Outlook (published ${humanPeriod(weo.publicationDate.slice(0, 10))}); the latest official data (${latestOfficial.label}, ${latestOfficial.periodLabel}) is more recent than those projections.`,
      });
    }
  }

  const importance = (f) => f.weight * (f.score !== 0 ? Math.abs(f.score) : f.tension ? 0.75 : 0);
  const ranked = available.filter((f) => importance(f) >= 0.04).sort((a, b) => importance(b) - importance(a));
  const drivers = ranked.slice(0, 5).map((f) => ({
    factor: f.key,
    label: f.label,
    score: f.score,
    effect: f.score > 0 ? 'POSITIVE' : f.score < 0 ? 'NEGATIVE' : 'MIXED',
    evidence: f.evidence,
    rationale: f.rationale,
    contribution: round(f.weight * f.score, 3),
  }));
  const positives = available.filter((f) => f.score > 0).sort((a, b) => b.weight * b.score - a.weight * a.score);
  const negatives = available.filter((f) => f.score < 0).sort((a, b) => a.weight * a.score - b.weight * b.score);

  return {
    code,
    name: cfg.name,
    economy: cfg.economy,
    asOf: asOf.toISOString(),
    centralBank: { name: cfg.centralBank.name, short: cfg.centralBank.short, targetText: cfg.centralBank.targetText, targetUrl: cfg.centralBank.targetUrl },
    reserveCurrency: cfg.reserveCurrency,
    score,
    band: score === null ? null : bandFor(score),
    condition: conditionFor(score),
    confidence,
    confidenceComponents: components,
    factors,
    observations,
    policy: policy
      ? { stance, display: policy.display, current: round(policy.current, 3), rate6mAgo: round(policy.rate6mAgo, 3), realRate, cum6m: policy.cum6m, cum12m: policy.cum12m, lastChange: policy.lastChange, recentChanges: policy.changes.slice(-4), windowStart: policy.windowStart }
      : null,
    marketExpectations,
    marketPrice,
    revisions,
    imf: weo
      ? {
          currentVintage: vintageName(weo),
          currentPublished: weo.publicationDate,
          previousVintage: vintageName(weoPrev),
          previousPublished: weoPrev?.publicationDate ?? null,
          growth: { current: gY?.value ?? null, next: gY1?.value ?? null, year: Y },
          inflation: { current: imfVal(weo, 'PCPIPCH', Y), next: imfVal(weo, 'PCPIPCH', Y + 1) },
          currentAccount: caNow?.value ?? null,
          fiscalBalance: fBal?.value ?? null,
          debt: debtNow?.value ?? null,
        }
      : null,
    drivers,
    strongestPositive: positives[0] ? { factor: positives[0].key, label: positives[0].label, score: positives[0].score, rationale: positives[0].rationale, evidence: positives[0].evidence } : null,
    strongestNegative: negatives[0] ? { factor: negatives[0].key, label: negatives[0].label, score: negatives[0].score, rationale: negatives[0].rationale, evidence: negatives[0].evidence } : null,
    notes,
  };
}

function interpretRevision(ind, year, revision, prevType, curType) {
  if (Math.abs(revision) < 0.05) return 'No material change between vintages.';
  const up = revision > 0;
  if (prevType === 'FORECAST' && curType === 'ACTUAL') {
    return `The ${year} outturn came in ${up ? 'above' : 'below'} what the IMF had projected.`;
  }
  switch (ind) {
    case 'NGDP_RPCH':
      return up ? `The IMF has raised its ${year} growth outlook, indicating stronger expected momentum.` : `The IMF has cut its ${year} growth outlook, indicating weaker expected momentum.`;
    case 'PCPIPCH':
      return up ? `The IMF now expects more inflation in ${year}, implying more persistent price pressure.` : `The IMF now expects less inflation in ${year}, implying easing price pressure.`;
    case 'BCA_NGDPD':
      return up ? `The projected ${year} current account balance has improved.` : `The projected ${year} current account balance has weakened.`;
    case 'GGXCNL_NGDP':
      return up ? `The projected ${year} fiscal balance has improved.` : `The projected ${year} fiscal balance has deteriorated.`;
    case 'GGXWDG_NGDP':
      return up ? `The projected ${year} debt ratio is higher than previously expected.` : `The projected ${year} debt ratio is lower than previously expected.`;
    default:
      return up ? 'Revised up.' : 'Revised down.';
  }
}
