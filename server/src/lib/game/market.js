// Kotka's synthetic market. Every match gets a scenario and a seed; from
// them this generates one price per second of market time, before and
// during the match, deterministically. No outside data is used.
//
// Layout: `historyTicks` of history (visible when the match starts), then
// `matchTicks` of match (revealed second by second). Candles group
// `candleSec` ticks. A scenario is a template (the kind of market) plus a
// variant (its timing, size and character), so KTK-0417 is always the same
// kind of false breakout; the seed adds the noise.
//
// Bump GENERATOR_VERSION whenever the output for a given scenario and seed
// would change: matches store the version and a hash of their path.

import crypto from 'node:crypto';
import { rng, mix } from './rng.js';

export const GENERATOR_VERSION = 1;

export const TEMPLATES = [
  { key: 'bull_trend', name: 'Bullish trend', lesson: 'In an uptrend, pullbacks towards the moving average are usually better entries than chasing a candle that has already run.' },
  { key: 'bear_trend', name: 'Bearish trend', lesson: 'In a downtrend, rallies into resistance are where sellers step back in; buying because price "looks cheap" fights the trend.' },
  { key: 'range', name: 'Range', lesson: 'In a range, the edges matter: buying near support and selling near resistance, with stops just outside, keeps risk small.' },
  { key: 'breakout', name: 'Breakout', lesson: 'A genuine breakout usually closes beyond the level and holds on a retest. Waiting for the close costs a little price and saves many false starts.' },
  { key: 'false_breakout', name: 'False breakout', lesson: 'Breakouts that close back inside the range often fail hard. Waiting for confirmation, and keeping the stop where the idea is wrong, limits the damage.' },
  { key: 'reversal', name: 'Reversal', lesson: 'Trends usually weaken before they turn: smaller pushes, fading momentum, RSI divergence. A reversal is confirmed by structure breaking, not by a guess.' },
  { key: 'high_volatility', name: 'High volatility', lesson: 'When the market is moving hard, the same stop distance means more risk per unit. Smaller size keeps your risk the same.' },
  { key: 'low_volatility', name: 'Low volatility', lesson: 'Quiet markets rarely pay for wide targets. Doing less, or nothing, is a valid decision.' },
  { key: 'momentum_expansion', name: 'Momentum expansion', lesson: 'When movement accelerates, trailing the stop behind structure lets a winner run without giving it all back.' },
  { key: 'mean_reversion', name: 'Mean reversion', lesson: 'When price keeps snapping back to its average, extended moves away from it are poor places to enter in the same direction.' },
  { key: 'volatility_shock', name: 'Volatility shock', lesson: 'After a sudden shock, the first move is often unreliable. Reducing size or waiting for the market to settle protects capital.' },
  { key: 'trend_continuation', name: 'Trend continuation', lesson: 'A pullback inside a trend is not a reversal until structure breaks. Holding, or adding at support, follows the trend.' },
];
export const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key);
export const templateOf = (key) => TEMPLATES.find((t) => t.key === key);

export function scenarioCode(templateKey, seed) {
  const idx = TEMPLATE_KEYS.indexOf(templateKey);
  return `KTK-${String(idx + 1).padStart(2, '0')}${String(seed % 100).padStart(2, '0')}`;
}

const round2 = (v) => Math.round(v * 100) / 100;

// A log-price random walk with volatility clustering, mean reversion to an
// optional target, and jumps.
function walker(noise, startPrice, s0) {
  let x = Math.log(startPrice);
  let volMul = 1;
  let pendingJump = 0;
  const prices = [];
  const regimes = [];
  const shocks = [];
  return {
    prices,
    regimes,
    shocks,
    get price() {
      return Math.exp(x);
    },
    get length() {
      return prices.length;
    },
    jump(pct) {
      pendingJump += Math.log(1 + pct);
    },
    step({ n = 1, mu = 0, sigma = 1, target = null, kappa = 0, regime, jumpProb = 0, jumpSize = 0 }) {
      for (let i = 0; i < n; i++) {
        const z = noise.normal();
        volMul = 0.985 * volMul + 0.015 * (0.55 + 0.9 * Math.min(Math.abs(z), 3));
        let dx = mu + sigma * s0 * volMul * z;
        if (target) dx += kappa * (Math.log(target) - x);
        if (jumpProb && noise.next() < jumpProb) dx += noise.sign() * jumpSize * (0.5 + noise.next());
        dx += pendingJump;
        shocks.push(Math.abs(pendingJump));
        pendingJump = 0;
        x += dx;
        prices.push(Math.exp(x));
        regimes.push(regime);
      }
    },
  };
}

// Each template writes exactly `total` ticks and returns its events and the
// levels that matter for the lesson (used after the match, never shown live).
const BUILD = {
  bull_trend: (w, ctx) => trend(w, ctx, 1),
  bear_trend: (w, ctx) => trend(w, ctx, -1),

  range(w, { v, H, M }) {
    const mid = w.price;
    const kappa = v.between(0.008, 0.014);
    w.step({ n: H + M, sigma: v.between(1.3, 1.7), target: mid, kappa, regime: 'range' });
    const band = (v.between(1.3, 1.7) * 0.00042) / Math.sqrt(2 * kappa) * 1.6;
    return { events: [], levels: { support: round2(mid * (1 - band)), resistance: round2(mid * (1 + band)), mid: round2(mid) } };
  },

  breakout(w, { v, H, M, mu }) {
    const d = v.sign();
    const mid = w.price;
    const b = H + Math.floor(M * v.between(0.25, 0.5));
    const kappa = v.between(0.01, 0.016);
    w.step({ n: b, sigma: 1.1, target: mid, kappa, regime: 'range' });
    const band = (1.1 * 0.00042) / Math.sqrt(2 * kappa) * 1.6;
    const level = mid * (1 + d * band);
    w.jump(d * v.between(0.004, 0.008));
    const run = Math.floor((H + M - b) * 0.35);
    w.step({ n: run, mu: d * mu * 2.2, sigma: 1.4, regime: 'breakout' });
    const retest = Math.floor((H + M - b) * 0.2);
    w.step({ n: retest, sigma: 1.1, target: level * (1 + d * 0.0015), kappa: 0.02, regime: 'retest' });
    w.step({ n: H + M - w.length, mu: d * mu * 1.6, sigma: 1.2, regime: 'trend' });
    return { direction: d, events: [{ tick: b, type: 'breakout', label: `Price broke ${d > 0 ? 'above resistance' : 'below support'}` }], levels: { breakoutLevel: round2(level), support: round2(mid * (1 - band)), resistance: round2(mid * (1 + band)) } };
  },

  false_breakout(w, { v, H, M, mu, sc }) {
    const d = v.sign();
    const mid = w.price;
    const b = H + Math.floor(M * v.between(0.2, 0.4));
    const kappa = v.between(0.01, 0.016);
    w.step({ n: b, sigma: 1.1, target: mid, kappa, regime: 'range' });
    const band = (1.1 * 0.00042) / Math.sqrt(2 * kappa) * 1.6;
    const level = mid * (1 + d * band);
    w.jump(d * v.between(0.003, 0.006));
    const spike = sc(v.between(30, 60));
    w.step({ n: spike, mu: d * mu * 2.5, sigma: 1.3, regime: 'breakout' });
    const fail = b + spike;
    w.step({ n: Math.floor(M * v.between(0.22, 0.32)), mu: -d * mu * 4, sigma: 1.6, regime: 'failed_breakout' });
    w.step({ n: H + M - w.length, mu: -d * mu * 1.2, sigma: 1.2, regime: 'trend' });
    return {
      direction: d,
      events: [
        { tick: b, type: 'breakout', label: `Price broke ${d > 0 ? 'above resistance' : 'below support'}` },
        { tick: Math.min(fail, H + M - 1), type: 'breakout_failed', label: 'The breakout failed and price fell back into the range' },
      ],
      levels: { breakoutLevel: round2(level), support: round2(mid * (1 - band)), resistance: round2(mid * (1 + band)) },
    };
  },

  reversal(w, { v, H, M, mu }) {
    const d = v.sign();
    w.step({ n: H, mu: d * mu * 1.4, sigma: 1, regime: 'trend' });
    const fade = Math.floor(M * v.between(0.3, 0.45));
    for (let i = 0; i < 4; i++) w.step({ n: Math.floor(fade / 4), mu: d * mu * (1 - i * 0.3), sigma: 0.9, regime: 'weakening' });
    const turn = w.length;
    const top = w.price;
    w.step({ n: H + M - w.length, mu: -d * mu * 1.8, sigma: 1.3, regime: 'reversal' });
    return { direction: -d, events: [{ tick: turn, type: 'reversal', label: `The ${d > 0 ? 'uptrend' : 'downtrend'} turned` }], levels: { turningPoint: round2(top) } };
  },

  high_volatility(w, { v, H, M, mu }) {
    w.step({ n: H, sigma: 1.2, mu: 0, regime: 'normal' });
    w.step({ n: M, sigma: v.between(2.6, 3.4), mu: v.sign() * mu * 0.5, regime: 'high_volatility', jumpProb: 0.004, jumpSize: 0.004 });
    return { events: [{ tick: H, type: 'volatility', label: 'Volatility picked up sharply' }], levels: {} };
  },

  low_volatility(w, { v, H, M }) {
    const mid = w.price;
    w.step({ n: H + M, sigma: v.between(0.35, 0.5), target: mid, kappa: 0.004, regime: 'low_volatility' });
    return { events: [], levels: { mid: round2(mid) } };
  },

  momentum_expansion(w, { v, H, M, mu }) {
    const d = v.sign();
    w.step({ n: H + Math.floor(M * 0.4), sigma: 0.7, mu: d * mu * 0.4, regime: 'quiet_trend' });
    const start = w.length;
    const steps = 6;
    const rest = H + M - w.length;
    for (let i = 0; i < steps; i++) w.step({ n: i === steps - 1 ? rest - Math.floor(rest / steps) * (steps - 1) : Math.floor(rest / steps), mu: d * mu * (0.8 + i * 0.6), sigma: 1 + i * 0.2, regime: 'momentum' });
    return { direction: d, events: [{ tick: start, type: 'momentum', label: 'Movement started to accelerate' }], levels: {} };
  },

  mean_reversion(w, { v, H, M, sc }) {
    let mean = w.price;
    const drift = v.sign() * 0.00001;
    const kappa = v.between(0.02, 0.03);
    const chunk = sc(30);
    while (w.length < H + M) {
      mean *= Math.exp(drift * chunk + 0.0015 * v.normal());
      w.step({ n: Math.min(chunk, H + M - w.length), sigma: v.between(1.6, 2.1), target: mean, kappa, regime: 'mean_reversion' });
    }
    return { events: [], levels: {} };
  },

  volatility_shock(w, { v, H, M, mu, sc }) {
    const s = H + Math.floor(M * v.between(0.3, 0.55));
    w.step({ n: s, sigma: 1, mu: v.sign() * mu * 0.3, regime: 'normal' });
    const d = v.sign();
    w.jump(d * v.between(0.02, 0.035));
    for (let i = 0; i < 6; i++) w.step({ n: sc(20), sigma: 4 - i * 0.4, mu: -d * mu * 0.8, regime: 'shock' });
    w.step({ n: H + M - w.length, sigma: 1.5, mu: -d * mu * 0.4, regime: 'settling' });
    return { direction: d, events: [{ tick: s, type: 'shock', label: `A sudden ${d > 0 ? 'jump' : 'drop'} hit the market` }], levels: {} };
  },

  trend_continuation(w, { v, H, M, mu }) {
    const d = v.sign();
    w.step({ n: H, mu: d * mu * 1.3, sigma: 1, regime: 'trend' });
    w.step({ n: Math.floor(M * v.between(0.2, 0.35)), mu: d * mu * 1.2, sigma: 1, regime: 'trend' });
    const pb = w.length;
    w.step({ n: Math.floor(M * v.between(0.2, 0.3)), mu: -d * mu * 1.4, sigma: 1.1, regime: 'pullback' });
    const resume = w.length;
    w.step({ n: H + M - w.length, mu: d * mu * 1.7, sigma: 1.1, regime: 'trend' });
    return { direction: d, events: [{ tick: pb, type: 'pullback', label: 'A pullback started against the trend' }, { tick: resume, type: 'trend_resumed', label: 'The trend resumed' }], levels: {} };
  },
};

function trend(w, { v, H, M, mu, sc }, d) {
  w.step({ n: H, mu: d * mu * 0.6, sigma: 1, regime: 'trend' });
  while (w.length < H + M) {
    const left = H + M - w.length;
    w.step({ n: Math.min(left, sc(v.int(60, 180))), mu: d * mu * 2.8, sigma: 1, regime: 'impulse' });
    if (w.length < H + M) w.step({ n: Math.min(H + M - w.length, sc(v.int(30, 90))), mu: -d * mu * 0.9, sigma: 0.9, regime: 'pullback' });
  }
  return { direction: d, events: [], levels: {} };
}

/**
 * The full market for a match: prices and volumes per tick, events and
 * the scenario's levels. Pure and deterministic.
 */
export function generateMarket({ scenario, seed, durationSec, candleSec, historyCandles, version = GENERATOR_VERSION }) {
  if (version !== GENERATOR_VERSION) throw new Error(`Market generator version ${version} is not available.`);
  if (!BUILD[scenario]) throw new Error(`Unknown market scenario: ${scenario}`);
  const H = historyCandles * candleSec;
  const M = durationSec;
  const v = rng(mix('variant', scenario, seed % 100));
  const noise = rng(mix('noise', scenario, seed));
  const s0 = v.between(0.0003, 0.00048);
  const mu = v.between(1.6, 2.6) * 1e-5 * (1 + s0 * 1000);
  const startPrice = round2(v.between(500, 5000));
  const w = walker(noise, startPrice, s0);
  // Fixed durations in the templates are written for a 15-minute match; scale them to this one.
  const k = M / 900;
  const sc = (n) => Math.max(1, Math.round(n * k));
  const built = BUILD[scenario](w, { v, H, M, mu, s0, sc });
  // Always exactly H + M ticks, whatever the match length.
  if (w.length < H + M) w.step({ n: H + M - w.length, sigma: 1, regime: w.regimes.at(-1) ?? 'normal' });
  if (w.length > H + M) {
    w.prices.length = H + M;
    w.regimes.length = H + M;
    w.shocks.length = H + M;
  }
  built.events = built.events.filter((e) => e.tick < H + M);

  const prices = w.prices.map(round2);
  // Synthetic volume: busier when price moves, spikes around events.
  const base = v.between(800, 2000);
  const eventTicks = new Set();
  for (const e of built.events) for (let t = e.tick; t < e.tick + 20; t++) eventTicks.add(t);
  const volumes = prices.map((p, i) => {
    const r = i ? Math.abs(Math.log(p / prices[i - 1])) : 0;
    const surge = 1 + Math.min(6, (2.5 * r) / s0) + (w.shocks[i] ? 8 : 0) + (eventTicks.has(i) ? 2 : 0);
    return Math.round(base * (0.6 + 0.8 * noise.next()) * surge);
  });

  const hash = crypto.createHash('sha256').update(JSON.stringify({ version, scenario, seed, durationSec, candleSec, historyCandles, prices })).digest('hex');
  return {
    version,
    scenario,
    seed,
    code: scenarioCode(scenario, seed),
    candleSec,
    historyTicks: H,
    matchTicks: M,
    startPrice,
    prices,
    volumes,
    regimes: w.regimes,
    events: built.events,
    levels: built.levels,
    direction: built.direction ?? 0,
    hash,
  };
}

// Candles from tick 0 up to and including absolute tick `upTo` (the last
// candle may still be forming). i is the candle index; t is seconds from the
// match start (negative for history).
export function candlesUpTo(market, upTo) {
  const { prices, volumes, candleSec, historyTicks } = market;
  const last = Math.min(upTo, prices.length - 1);
  const out = [];
  for (let start = 0; start <= last; start += candleSec) {
    const end = Math.min(start + candleSec - 1, last);
    let h = -Infinity;
    let l = Infinity;
    let vol = 0;
    for (let i = start; i <= end; i++) {
      if (prices[i] > h) h = prices[i];
      if (prices[i] < l) l = prices[i];
      vol += volumes[i];
    }
    out.push({ i: start / candleSec, t: start - historyTicks, o: start ? prices[start - 1] : prices[0], h: Math.max(h, start ? prices[start - 1] : h), l: Math.min(l, start ? prices[start - 1] : l), c: prices[end], v: vol, forming: end < start + candleSec - 1 });
  }
  return out;
}

// A fresh scenario and seed for a new match (server-side randomness only).
export function drawScenario(allowed = TEMPLATE_KEYS) {
  const list = allowed.filter((k) => TEMPLATE_KEYS.includes(k));
  const scenario = list[crypto.randomInt(list.length)];
  return { scenario, seed: crypto.randomInt(1, 2 ** 31 - 1) };
}
