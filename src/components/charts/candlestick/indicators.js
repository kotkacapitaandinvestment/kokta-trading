// Real technical indicators computed from actual candle closes — no
// fabricated smoothing shortcuts. Each function returns a same-length array
// (null where there isn't yet enough history for a value) and must be
// computed over the FULL bar history (not a visible-window slice), since
// EMA/RSI are path-dependent and would visibly "restart" at the left edge
// every time the window changes if computed on a slice.

export function computeSMA(bars, period) {
  const out = new Array(bars.length).fill(null);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].c;
    if (i >= period) sum -= bars[i - period].c;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function computeEMA(bars, period) {
  const out = new Array(bars.length).fill(null);
  if (bars.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += bars[i].c;
  let ema = sum / period;
  out[period - 1] = ema;
  for (let i = period; i < bars.length; i++) {
    ema = bars[i].c * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

// Wilder's RSI.
export function computeRSI(bars, period = 14) {
  const out = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = bars[i].c - bars[i - 1].c;
    gainSum += Math.max(change, 0);
    lossSum += Math.max(-change, 0);
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < bars.length; i++) {
    const change = bars[i].c - bars[i - 1].c;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}
