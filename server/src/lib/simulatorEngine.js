// Real practice-trading simulator engine.
//
// SIMPLIFIED P&L MODEL — not broker-exact. pnl = (exitPrice - entryPrice) * size
// * (direction === 'long' ? 1 : -1). `size` is an abstract position-size unit
// the user chooses; there's no lot/pip-value/quote-currency conversion, no
// leverage or margin. Same formula for forex, metals, crypto, and index
// symbols. This is disclosed in the UI rather than faked as broker-accurate.

export const SIMULATOR_TIMEFRAME = { multiplier: 5, unit: 'minute' };

// How many real bars to reveal in a single practice session.
const SESSION_BAR_COUNT = 200;
// How many bars are visible to the user immediately when a session starts.
export const WARMUP_BAR_COUNT = 30;

export function computePnl({ direction, entryPrice, exitPrice, size }) {
  const sign = direction === 'long' ? 1 : -1;
  return (exitPrice - entryPrice) * size * sign;
}

export function computeResult(pnl) {
  if (pnl > 0) return 'win';
  if (pnl < 0) return 'loss';
  return 'breakeven';
}

// Picks a random ~10-day calendar window somewhere in the last ~90 days,
// wide enough (confirmed via live testing: ~864 5-min bars over 3 days) to
// comfortably contain SESSION_BAR_COUNT real bars plus room for
// pickSessionSlice to choose a random contiguous run within it.
const FETCH_WINDOW_DAYS = 10;
const LOOKBACK_DAYS = 90;

export function pickFetchWindow() {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const earliestStart = now - LOOKBACK_DAYS * dayMs;
  const latestStart = now - FETCH_WINDOW_DAYS * dayMs;
  const start = earliestStart + Math.random() * (latestStart - earliestStart);
  const from = new Date(start);
  const to = new Date(start + FETCH_WINDOW_DAYS * dayMs);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// How many real earlier bars to return per "scroll back" page.
export const EXTEND_BATCH_BARS = 150;

// Calendar-day lookback per timeframe unit, staged so weekend/holiday gaps
// in the real data don't false-positive as "exhausted" — same idea as the
// TIMEFRAME_FALLBACKS ladder in simulator.js.
export const EXTEND_LOOKBACK_STAGES_DAYS = {
  minute: [6, 20, 60],
  hour: [60, 180, 400],
  day: [720, 1800],
};

export function pickExtendHistoryWindow(beforeDate, lookbackDays) {
  const to = new Date(beforeDate.getTime() - 1); // strictly exclusive of the boundary
  const from = new Date(to.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// Picks a random contiguous slice of SESSION_BAR_COUNT bars from a larger
// fetched array of real historical bars.
export function pickSessionSlice(bars) {
  if (bars.length <= SESSION_BAR_COUNT) return bars;
  const maxStart = bars.length - SESSION_BAR_COUNT;
  const start = Math.floor(Math.random() * maxStart);
  return bars.slice(start, start + SESSION_BAR_COUNT);
}

// long: SL hit if bar low <= stopLoss, TP hit if bar high >= takeProfit.
// short: SL hit if bar high >= stopLoss, TP hit if bar low <= takeProfit.
// If both land within the same bar, SL resolves first (conservative — OHLC
// alone can't tell us the true intrabar order of price movement).
export function checkStopTakeProfit({ direction, stopLoss, takeProfit, bar }) {
  if (direction === 'long') {
    if (stopLoss != null && bar.l <= stopLoss) return { hit: 'sl', exitPrice: stopLoss };
    if (takeProfit != null && bar.h >= takeProfit) return { hit: 'tp', exitPrice: takeProfit };
  } else {
    if (stopLoss != null && bar.h >= stopLoss) return { hit: 'sl', exitPrice: stopLoss };
    if (takeProfit != null && bar.l <= takeProfit) return { hit: 'tp', exitPrice: takeProfit };
  }
  return { hit: null, exitPrice: null };
}

function closeTradeAt(trade, { exitPrice, exitBarIndex, exitAt, closeReason }) {
  const pnl = computePnl({ direction: trade.direction, entryPrice: trade.entryPrice, exitPrice, size: trade.size });
  return {
    ...trade,
    exitPrice,
    exitBarIndex,
    exitAt,
    pnl,
    result: computeResult(pnl),
    closeReason,
    status: 'closed',
  };
}

// Walks bars (cursor, toIndex], checking any open trade against each bar in
// order. Returns the new cursor, updated trade list, and running balance.
export function advanceSession({ bars, cursor, balance, openTrade }, toIndex) {
  let currentTrade = openTrade;
  let currentBalance = balance;
  const closedTrades = [];
  const clampedTo = Math.min(toIndex, bars.length - 1);

  for (let i = cursor + 1; i <= clampedTo; i++) {
    const bar = bars[i];
    if (currentTrade && currentTrade.status === 'open') {
      const { hit, exitPrice } = checkStopTakeProfit({
        direction: currentTrade.direction,
        stopLoss: currentTrade.stopLoss,
        takeProfit: currentTrade.takeProfit,
        bar,
      });
      if (hit) {
        const closed = closeTradeAt(currentTrade, {
          exitPrice,
          exitBarIndex: i,
          exitAt: new Date(bar.t),
          closeReason: hit === 'sl' ? 'sl_hit' : 'tp_hit',
        });
        currentBalance += closed.pnl;
        closedTrades.push(closed);
        currentTrade = null;
      }
    }
  }

  return { cursor: clampedTo, balance: currentBalance, openTrade: currentTrade, closedTrades };
}

export function closeTradeManual(trade, currentBar, currentBarIndex) {
  return closeTradeAt(trade, {
    exitPrice: currentBar.c,
    exitBarIndex: currentBarIndex,
    exitAt: new Date(currentBar.t),
    closeReason: 'manual',
  });
}

export function endSession(trade, currentBar, currentBarIndex) {
  if (!trade || trade.status !== 'open') return null;
  return closeTradeAt(trade, {
    exitPrice: currentBar.c,
    exitBarIndex: currentBarIndex,
    exitAt: new Date(currentBar.t),
    closeReason: 'session_end',
  });
}
