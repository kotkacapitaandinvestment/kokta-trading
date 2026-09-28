// Technical indicators on candles ({ o, h, l, c, v }). The app has the same
// functions (src/features/game/indicators.js) for the chart; the server uses
// these to judge decisions after the match. Values are null until there's
// enough history.

export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(values, n) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (n + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i === n - 1) prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
    else if (i >= n) prev = values[i] * k + prev * (1 - k);
    if (i >= n - 1) out[i] = prev;
  }
  return out;
}

// Wilder's RSI.
export function rsi(closes, n = 14) {
  const out = new Array(closes.length).fill(null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = Math.max(ch, 0);
    const l = Math.max(-ch, 0);
    if (i <= n) {
      gain += g;
      loss += l;
      if (i === n) {
        gain /= n;
        loss /= n;
        out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
      }
    } else {
      gain = (gain * (n - 1) + g) / n;
      loss = (loss * (n - 1) + l) / n;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
  }
  return out;
}

export function macd(closes, fast = 12, slow = 26, signal = 9) {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line = closes.map((_, i) => (f[i] !== null && s[i] !== null ? f[i] - s[i] : null));
  const start = line.findIndex((x) => x !== null);
  const sig = new Array(closes.length).fill(null);
  if (start >= 0) {
    const e = ema(line.slice(start), signal);
    e.forEach((x, j) => (sig[start + j] = x));
  }
  return { line, signal: sig, hist: line.map((x, i) => (x !== null && sig[i] !== null ? x - sig[i] : null)) };
}

export function atr(candles, n = 14) {
  const tr = candles.map((c, i) => (i ? Math.max(c.h - c.l, Math.abs(c.h - candles[i - 1].c), Math.abs(c.l - candles[i - 1].c)) : c.h - c.l));
  const out = new Array(candles.length).fill(null);
  let prev = null;
  for (let i = 0; i < tr.length; i++) {
    if (i === n - 1) prev = tr.slice(0, n).reduce((a, b) => a + b, 0) / n;
    else if (i >= n) prev = (prev * (n - 1) + tr[i]) / n;
    if (i >= n - 1) out[i] = prev;
  }
  return out;
}

// Support and resistance from swing points: a candle whose high (low) is the
// highest (lowest) of `k` candles either side. Nearby levels merge.
export function levels(candles, { k = 3, max = 3 } = {}) {
  if (candles.length < 2 * k + 1) return { support: [], resistance: [] };
  const a = atr(candles).filter((x) => x !== null).at(-1) ?? 0;
  const highs = [];
  const lows = [];
  for (let i = k; i < candles.length - k; i++) {
    const win = candles.slice(i - k, i + k + 1);
    if (candles[i].h === Math.max(...win.map((c) => c.h))) highs.push(candles[i].h);
    if (candles[i].l === Math.min(...win.map((c) => c.l))) lows.push(candles[i].l);
  }
  const merge = (list) => {
    const groups = [];
    for (const p of list.sort((x, y) => x - y)) {
      const g = groups.find((x) => Math.abs(x.p - p) <= a * 0.6);
      if (g) {
        g.p = (g.p * g.n + p) / (g.n + 1);
        g.n += 1;
      } else groups.push({ p, n: 1 });
    }
    return groups;
  };
  const last = candles.at(-1).c;
  const res = merge(highs).filter((g) => g.p >= last).sort((x, y) => x.p - y.p).slice(0, max).map((g) => ({ price: g.p, touches: g.n }));
  const sup = merge(lows).filter((g) => g.p <= last).sort((x, y) => y.p - x.p).slice(0, max).map((g) => ({ price: g.p, touches: g.n }));
  return { support: sup, resistance: res };
}
