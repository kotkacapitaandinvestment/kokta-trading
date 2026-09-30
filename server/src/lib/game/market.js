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
import { rng, mix, secureRng } from './rng.js';
import { pairOf } from './pairs.js';

// 1: one unnamed market, 2-decimal prices, only the scenario's own history.
// 2: a Kotka pair (its level, precision and volatility) and a long
//    background history before the scenario. Old matches keep version 1.
// 3: the same markets, but every random number comes from a keyed
//    cryptographic stream (a secret per match) instead of the 32-bit seed,
//    so nobody can rebuild a match's future from the history on the chart.
export const GENERATOR_VERSION = 3;

export const TEMPLATES = [
  { key: 'bull_trend', name: 'Bullish trend', lesson: 'In an uptrend, pullbacks towards the moving average are usually better entries than chasing a candle that has already run.', watch: 'Higher highs and higher lows, price holding above a rising average, pullbacks that stop short of the last low.', mistake: 'Buying the candle that has already run, with no stop under the last swing low.' },
  { key: 'bear_trend', name: 'Bearish trend', lesson: 'In a downtrend, rallies into resistance are where sellers step back in; buying because price "looks cheap" fights the trend.', watch: 'Lower highs and lower lows, rallies that fail below a falling average.', mistake: 'Buying because price “looks cheap” in a falling market, or shorting a bounce with no stop above the last high.' },
  { key: 'range', name: 'Range', lesson: 'In a range, the edges matter: buying near support and selling near resistance, with stops just outside, keeps risk small.', watch: 'Clear edges that price keeps turning at, a flat average, fading momentum at each edge.', mistake: 'Treating every push to an edge as a breakout, or trading the middle of the range where there’s no edge.' },
  { key: 'breakout', name: 'Breakout', lesson: 'A genuine breakout usually closes beyond the level and holds on a retest. Waiting for the close costs a little price and saves many false starts.', watch: 'A candle that closes beyond the level (not just a spike), rising volume, and a retest that holds.', mistake: 'Entering before the close confirms the break, then holding when price falls back inside.' },
  { key: 'false_breakout', name: 'False breakout', lesson: 'Breakouts that close back inside the range often fail hard. Waiting for confirmation, and keeping the stop where the idea is wrong, limits the damage.', watch: 'A break that closes back inside the range, weak follow-through, volume that fades.', mistake: 'Staying in a breakout trade after price is back inside the range, hoping it goes again.' },
  { key: 'reversal', name: 'Reversal', lesson: 'Trends usually weaken before they turn: smaller pushes, fading momentum, RSI divergence. A reversal is confirmed by structure breaking, not by a guess.', watch: 'Smaller pushes in the trend, momentum divergence, then structure breaking the other way.', mistake: 'Calling the top or bottom early, before structure has actually turned, and adding as it goes against you.' },
  { key: 'high_volatility', name: 'High volatility', lesson: 'When the market is moving hard, the same stop distance means more risk per unit. Smaller size keeps your risk the same.', watch: 'Wide candles and fast swings: the same stop distance now means more risk per unit.', mistake: 'Keeping your usual size when every move is twice as big, so one swing takes out a large share of capital.' },
  { key: 'low_volatility', name: 'Low volatility', lesson: 'Quiet markets rarely pay for wide targets. Doing less, or nothing, is a valid decision.', watch: 'Small candles and a tight range, with targets that price rarely reaches.', mistake: 'Overtrading a quiet market, or setting targets the market isn’t moving enough to reach.' },
  { key: 'momentum_expansion', name: 'Momentum expansion', lesson: 'When movement accelerates, trailing the stop behind structure lets a winner run without giving it all back.', watch: 'Candles getting bigger in one direction, momentum indicators accelerating.', mistake: 'Taking profit on the first small gain, or not trailing the stop, and giving the move back.' },
  { key: 'mean_reversion', name: 'Mean reversion', lesson: 'When price keeps snapping back to its average, extended moves away from it are poor places to enter in the same direction.', watch: 'Price repeatedly snapping back to its average after stretching away from it.', mistake: 'Chasing an extended move away from the average in the same direction.' },
  { key: 'volatility_shock', name: 'Volatility shock', lesson: 'After a sudden shock, the first move is often unreliable. Reducing size or waiting for the market to settle protects capital.', watch: 'A sudden jump on an event, then a noisy period while the market finds its level.', mistake: 'Reacting to the first spike at full size, or widening your stop to survive it.' },
  { key: 'trend_continuation', name: 'Trend continuation', lesson: 'A pullback inside a trend is not a reversal until structure breaks. Holding, or adding at support, follows the trend.', watch: 'A pullback that holds support in an established trend, then the trend resuming.', mistake: 'Mistaking a normal pullback for a reversal and flipping against the trend.' },
];
export const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key);
export const templateOf = (key) => TEMPLATES.find((t) => t.key === key);

export function scenarioCode(templateKey, seed) {
  const idx = TEMPLATE_KEYS.indexOf(templateKey);
  return `KTK-${String(idx + 1).padStart(2, '0')}${String(seed % 100).padStart(2, '0')}`;
}

const round2 = (v) => Math.round(v * 100) / 100;
const roundTo = (dp) => (v) => Math.round(v * 10 ** dp) / 10 ** dp;

// History before the scenario, built backwards from the scenario's opening
// price so the two join exactly: stretches of trend, range, quiet and busy
// markets, 15 to 90 minutes each.
function background(noise, endPrice, n, s0) {
  const prices = new Array(n);
  const regimes = new Array(n);
  let x = Math.log(endPrice);
  let volMul = 1;
  let i = n - 1;
  while (i >= 0) {
    const len = Math.min(i + 1, Math.round(noise.between(900, 5400)));
    const kind = ['trend', 'trend', 'range', 'quiet', 'busy'][Math.floor(noise.next() * 5)];
    const mu = kind === 'trend' ? noise.sign() * s0 * noise.between(0.004, 0.018) : 0;
    const sigma = kind === 'quiet' ? 0.55 : kind === 'busy' ? 1.7 : 1;
    const anchor = x;
    for (let k = 0; k < len; k++, i--) {
      prices[i] = Math.exp(x);
      regimes[i] = kind;
      const z = noise.normal();
      volMul = 0.985 * volMul + 0.015 * (0.55 + 0.9 * Math.min(Math.abs(z), 3));
      // Stepping back in time: undo one step of the forward process.
      x -= mu + sigma * s0 * volMul * z;
      if (kind === 'range') x += 0.004 * (anchor - x);
    }
  }
  return { prices, regimes };
}

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
export function generateMarket({ scenario, seed, durationSec, candleSec, historyCandles, symbol = null, backgroundTicks = 0, version = GENERATOR_VERSION, secret = null }) {
  if (![1, 2, 3].includes(version)) throw new Error(`Market generator version ${version} is not available.`);
  if (version >= 3 && !secret) throw new Error('Version 3 markets need their secret.');
  if (!BUILD[scenario]) throw new Error(`Unknown market scenario: ${scenario}`);
  const pair = version >= 2 ? pairOf(symbol) : null;
  if (version >= 2 && !pair) throw new Error(`Unknown Kotka pair: ${symbol}`);
  const B = version >= 2 ? Math.max(0, Math.floor(backgroundTicks)) : 0;
  const decimals = pair?.decimals ?? 2;
  const roundP = version >= 2 ? roundTo(decimals) : round2;
  const H = historyCandles * candleSec;
  const M = durationSec;
  const v = version >= 3 ? secureRng(secret, `variant:${scenario}`) : rng(mix('variant', scenario, seed % 100));
  const noise = version >= 3 ? secureRng(secret, `noise:${scenario}:${symbol}`) : rng(version >= 2 ? mix('noise', scenario, symbol, seed) : mix('noise', scenario, seed));
  const s0 = v.between(0.0003, 0.00048) * (pair?.vol ?? 1);
  const mu = v.between(1.6, 2.6) * 1e-5 * (1 + s0 * 1000);
  const startPrice = pair ? roundP(pair.level * v.between(0.85, 1.15)) : round2(v.between(500, 5000));
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

  // Version 2: the long history before the scenario.
  if (B) {
    const bg = background(version >= 3 ? secureRng(secret, `background:${symbol}`) : rng(mix('background', symbol, seed)), startPrice, B, s0);
    w.prices.unshift(...bg.prices);
    w.regimes.unshift(...bg.regimes);
    w.shocks.unshift(...new Array(B).fill(0));
    for (const e of built.events) e.tick += B;
  }
  const prices = w.prices.map(roundP);
  // Synthetic volume: busier when price moves, spikes around events.
  const base = pair ? pair.volume * v.between(0.7, 1.3) : v.between(800, 2000);
  const eventTicks = new Set();
  for (const e of built.events) for (let t = e.tick; t < e.tick + 20; t++) eventTicks.add(t);
  const volumes = prices.map((p, i) => {
    const r = i ? Math.abs(Math.log(p / prices[i - 1])) : 0;
    const surge = 1 + Math.min(6, (2.5 * r) / s0) + (w.shocks[i] ? 8 : 0) + (eventTicks.has(i) ? 2 : 0);
    return Math.round(base * (0.6 + 0.8 * noise.next()) * surge);
  });

  const hashed = version >= 2 ? { version, scenario, seed, symbol, backgroundTicks: B, durationSec, candleSec, historyCandles, prices } : { version, scenario, seed, durationSec, candleSec, historyCandles, prices };
  const hash = crypto.createHash('sha256').update(JSON.stringify(hashed)).digest('hex');
  return {
    version,
    scenario,
    seed,
    symbol,
    decimals,
    code: scenarioCode(scenario, seed),
    candleSec,
    historyTicks: B + H,
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

/**
 * Candles of any length (tf seconds), aligned to match time (t = 0 at the
 * start; history is negative), never beyond absolute tick `upToAbs`.
 * Returns the `limit` candles before `beforeT` (a candle start, exclusive),
 * or the latest ones, and whether older ones exist.
 */
export function candleRange(market, tf, { beforeT = null, limit = 300, upToAbs }) {
  const { prices, volumes, historyTicks: Hh } = market;
  const lastAbs = Math.min(upToAbs, prices.length - 1);
  const firstT = -Hh;
  const lastT = lastAbs - Hh;
  const firstBucket = Math.floor(firstT / tf);
  let endBucket = Math.floor(lastT / tf);
  if (beforeT != null) endBucket = Math.min(endBucket, Math.floor(beforeT / tf) - 1);
  const startBucket = Math.max(firstBucket, endBucket - limit + 1);
  const out = [];
  for (let b = startBucket; b <= endBucket; b++) {
    const t0 = Math.max(b * tf, firstT);
    const t1 = Math.min(b * tf + tf - 1, lastT);
    if (t1 < t0) continue;
    const a0 = t0 + Hh;
    const a1 = t1 + Hh;
    const open = a0 > 0 ? prices[a0 - 1] : prices[a0];
    let h = open;
    let l = open;
    let v = 0;
    for (let i = a0; i <= a1; i++) {
      if (prices[i] > h) h = prices[i];
      if (prices[i] < l) l = prices[i];
      v += volumes[i];
    }
    out.push({ t: b * tf, o: open, h, l, c: prices[a1], v });
  }
  return { candles: out, more: startBucket > firstBucket };
}

// A fresh scenario and seed for a new match (server-side randomness only).
export function drawScenario(allowed = TEMPLATE_KEYS) {
  const list = allowed.filter((k) => TEMPLATE_KEYS.includes(k));
  const scenario = list[crypto.randomInt(list.length)];
  return { scenario, seed: crypto.randomInt(1, 2 ** 31 - 1) };
}
