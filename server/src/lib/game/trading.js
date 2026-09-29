// The trading engine: replays one player's decisions against the market.
// The server stores only the decisions (GameAction rows, stamped with the
// server's tick). Fills from stops, targets, the capital floor and the end
// of the match are derived here from the market path, so the client never
// decides a price, a fill or a result.
//
// Rules (from the match's rules snapshot):
//   - One net position at a time, long or short; it can be increased or
//     reduced. Size is a share of current equity (notional), capped at
//     maxLeverage × equity in total.
//   - Every fill pays half the spread (spreadBps) on each side.
//   - Stops and targets are checked on every tick from the tick after they
//     were set, and fill at that tick's price.
//   - Equity falling to stopOutPct of starting capital closes the position.
//   - Anything open at the end closes at the last price.

const EPS = 1e-9;

export function defaultTradingRules() {
  return { spreadBps: 2, maxLeverage: 5, stopOutPct: 10, maxStopDistancePct: 20 };
}

function fillPrice(price, side, opening, spreadBps) {
  const half = spreadBps / 20000;
  const buying = (side === 'long') === opening;
  return price * (buying ? 1 + half : 1 - half);
}

const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const fmtAt = (p, dp) => Number(p).toLocaleString('en-NG', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/**
 * simulate({ market, actions, capital, rules, upTo, final })
 *   market  from generateMarket()
 *   actions [{ seq, tick, type, payload }] for one player, in seq order
 *   upTo    last match tick to process (inclusive)
 *   final   true once the match is over: closes what is open at the last tick
 */
export function simulate({ market, actions, capital, rules = defaultTradingRules(), upTo, final = false }) {
  const H = market.historyTicks;
  const M = market.matchTicks;
  // Prices round to the pair's precision; money (P&L) to kobo.
  const dp = market.decimals ?? 2;
  const rp = (v) => round(v, dp);
  const fmt = (v) => fmtAt(v, dp);
  const last = Math.min(upTo ?? M - 1, M - 1);
  const byTick = new Map();
  for (const a of actions) {
    if (a.tick < 0 || a.tick > last) continue;
    if (!byTick.has(a.tick)) byTick.set(a.tick, []);
    byTick.get(a.tick).push(a);
  }

  let cash = capital; // realised equity
  let pos = null; // { side, qty, avg, stop, target, trade }
  const trades = [];
  const log = [];
  const equityCurve = new Array(last + 1);
  let peak = capital;
  let maxDrawdownPct = 0;
  let stoppedOut = false;

  const priceAt = (t) => market.prices[H + t];
  const unrealised = (p) => (pos ? (pos.side === 'long' ? 1 : -1) * pos.qty * (p - pos.avg) : 0);
  const equityAt = (p) => cash + unrealised(p);

  function exit(t, qty, reason) {
    const p = priceAt(t);
    const px = fillPrice(p, pos.side, false, rules.spreadBps);
    const q = Math.min(qty, pos.qty);
    const pnl = (pos.side === 'long' ? 1 : -1) * q * (px - pos.avg);
    cash += pnl;
    pos.qty -= q;
    const tr = pos.trade;
    tr.exits.push({ tick: t, price: rp(px), qty: q, reason, pnl: round(pnl) });
    tr.pnl += pnl;
    if (pos.qty <= EPS) {
      tr.closeTick = t;
      tr.exitReason = reason;
      const exitQty = tr.exits.reduce((s, e) => s + e.qty, 0);
      tr.exitPrice = rp(tr.exits.reduce((s, e) => s + e.price * e.qty, 0) / exitQty);
      tr.pnl = round(tr.pnl);
      tr.returnPct = round((tr.pnl / tr.equityAtOpen) * 100, 3);
      pos = null;
    }
    return { px, pnl, q };
  }

  for (let t = 0; t <= last; t++) {
    const p = priceAt(t);

    // 1. Stops and targets on an existing position (set on an earlier tick).
    if (pos) {
      const tr = pos.trade;
      tr.mfe = Math.max(tr.mfe, (pos.side === 'long' ? 1 : -1) * (p - pos.avg));
      tr.mae = Math.min(tr.mae, (pos.side === 'long' ? 1 : -1) * (p - pos.avg));
      const hitStop = pos.stop != null && pos.stopSetAt < t && (pos.side === 'long' ? p <= pos.stop : p >= pos.stop);
      const hitTarget = pos.target != null && pos.targetSetAt < t && (pos.side === 'long' ? p >= pos.target : p <= pos.target);
      if (hitStop || hitTarget) {
        const reason = hitStop ? 'stop' : 'target';
        const { px } = exit(t, pos.qty, reason);
        log.push({ tick: t, kind: reason, price: rp(px), text: hitStop ? `Stop loss hit at ${fmt(px)}` : `Take profit hit at ${fmt(px)}` });
      }
    }

    // 2. This tick's decisions, in the order they arrived.
    for (const a of byTick.get(t) ?? []) {
      const pl = a.payload ?? {};
      const eq = equityAt(p);
      if (a.type === 'open' && !pos && !stoppedOut) {
        const side = pl.side === 'short' ? 'short' : 'long';
        const pct = Math.min(Math.max(Number(pl.sizePct) || 0, 0), rules.maxLeverage * 100);
        const px = fillPrice(p, side, true, rules.spreadBps);
        const qty = ((pct / 100) * eq) / px;
        if (qty <= EPS) continue;
        const stop = pl.stop ?? null;
        const target = pl.target ?? null;
        const trade = {
          n: trades.length + 1,
          side,
          openTick: t,
          openPrice: rp(px),
          equityAtOpen: eq,
          entries: [{ tick: t, price: rp(px), qty, sizePct: pct }],
          exits: [],
          stopAtOpen: stop,
          targetAtOpen: target,
          stops: [{ tick: t, stop }],
          targets: [{ tick: t, target }],
          riskPctAtOpen: stop != null ? round((qty * Math.abs(px - stop) / eq) * 100, 3) : null,
          maxSizePct: pct,
          thesis: pl.thesis ?? null,
          increases: 0,
          reductions: 0,
          addedWhileLosing: 0,
          pnl: 0,
          mfe: 0,
          mae: 0,
          closeTick: null,
          exitPrice: null,
          exitReason: null,
          returnPct: null,
        };
        trades.push(trade);
        pos = { side, qty, avg: px, stop, target, stopSetAt: t, targetSetAt: t, trade };
        log.push({ tick: t, kind: 'open', price: rp(px), seq: a.seq, text: `${side === 'long' ? 'Long' : 'Short'} opened at ${fmt(px)} (${round(pct, 1)}% of capital)${stop != null ? `, stop ${fmt(stop)}` : ', no stop'}${target != null ? `, target ${fmt(target)}` : ''}` });
      } else if (a.type === 'increase' && pos) {
        const pct = Math.max(Number(pl.sizePct) || 0, 0);
        const px = fillPrice(p, pos.side, true, rules.spreadBps);
        const room = Math.max(0, rules.maxLeverage * eq - pos.qty * px);
        const addNotional = Math.min((pct / 100) * eq, room);
        const q = addNotional / px;
        if (q <= EPS) continue;
        if (unrealised(p) < 0) pos.trade.addedWhileLosing += 1;
        pos.avg = (pos.avg * pos.qty + px * q) / (pos.qty + q);
        pos.qty += q;
        pos.trade.increases += 1;
        pos.trade.entries.push({ tick: t, price: rp(px), qty: q, sizePct: pct });
        pos.trade.maxSizePct = Math.max(pos.trade.maxSizePct, ((pos.qty * px) / eq) * 100);
        log.push({ tick: t, kind: 'increase', price: rp(px), seq: a.seq, text: `Position increased at ${fmt(px)}${unrealised(p) < 0 ? ' while losing' : ''}` });
      } else if (a.type === 'reduce' && pos) {
        const f = Math.min(Math.max(Number(pl.fraction) || 0, 0), 1);
        if (f <= 0) continue;
        pos.trade.reductions += 1;
        const { px } = exit(t, pos.qty * f, 'manual');
        log.push({ tick: t, kind: 'reduce', price: rp(px), seq: a.seq, text: `Position reduced by ${Math.round(f * 100)}% at ${fmt(px)}` });
      } else if (a.type === 'close' && pos) {
        const { px } = exit(t, pos.qty, 'manual');
        log.push({ tick: t, kind: 'close', price: rp(px), seq: a.seq, text: `Position closed at ${fmt(px)}` });
      } else if (a.type === 'modify' && pos) {
        if ('stop' in pl) {
          pos.stop = pl.stop ?? null;
          pos.stopSetAt = t;
          pos.trade.stops.push({ tick: t, stop: pos.stop });
          log.push({ tick: t, kind: 'stop', price: rp(p), seq: a.seq, text: pos.stop == null ? 'Stop loss removed' : `Stop loss moved to ${fmt(pos.stop)}` });
        }
        if ('target' in pl) {
          pos.target = pl.target ?? null;
          pos.targetSetAt = t;
          pos.trade.targets.push({ tick: t, target: pos.target });
          log.push({ tick: t, kind: 'target', price: rp(p), seq: a.seq, text: pos.target == null ? 'Take profit removed' : `Take profit moved to ${fmt(pos.target)}` });
        }
      }
    }

    // 3. Capital floor.
    let eq = equityAt(p);
    if (pos && eq <= (rules.stopOutPct / 100) * capital) {
      const { px } = exit(t, pos.qty, 'stop_out');
      stoppedOut = true;
      log.push({ tick: t, kind: 'stop_out', price: rp(px), text: `Closed automatically: equity fell to ${rules.stopOutPct}% of starting capital` });
      eq = equityAt(p);
    }

    equityCurve[t] = eq;
    peak = Math.max(peak, eq);
    maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - eq) / peak) * 100);
  }

  // 4. End of the match: anything still open closes at the last price.
  if (final && pos) {
    const { px } = exit(last, pos.qty, 'end');
    log.push({ tick: last, kind: 'end', price: rp(px), text: `Closed at the end of the match at ${fmt(px)}` });
    equityCurve[last] = cash;
  }

  const p = priceAt(last);
  const equity = final ? cash : equityAt(p);
  return {
    tick: last,
    price: p,
    cash: round(cash),
    equity: round(equity),
    returnPct: round(((equity - capital) / capital) * 100, 3),
    maxDrawdownPct: round(maxDrawdownPct, 3),
    stoppedOut,
    position: pos
      ? {
          side: pos.side,
          qty: pos.qty,
          avgPrice: rp(pos.avg),
          stop: pos.stop,
          target: pos.target,
          notional: round(pos.qty * p),
          sizePct: round(((pos.qty * p) / Math.max(equity, EPS)) * 100, 1),
          unrealised: round(unrealised(p)),
          riskPct: pos.stop != null ? round(((pos.qty * Math.max(0, (pos.side === 'long' ? 1 : -1) * (p - pos.stop))) / Math.max(equity, EPS)) * 100, 2) : null,
          openedTick: pos.trade.openTick,
        }
      : null,
    trades,
    log,
    equityCurve,
  };
}

/**
 * Checks a decision against the player's current state before it's stored.
 * Returns an error message for people, or null.
 */
export function validateAction(type, payload, state, { rules, price }) {
  const pl = payload ?? {};
  const finite = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const checkStop = (side, stop) => {
    if (stop == null) return null;
    if (!finite(stop)) return 'Enter the stop loss as a price.';
    if (side === 'long' ? stop >= price : stop <= price) return side === 'long' ? 'For a long position, the stop loss goes below the current price.' : 'For a short position, the stop loss goes above the current price.';
    if (Math.abs(stop - price) / price > rules.maxStopDistancePct / 100) return `Keep the stop loss within ${rules.maxStopDistancePct}% of the price.`;
    return null;
  };
  const checkTarget = (side, target) => {
    if (target == null) return null;
    if (!finite(target)) return 'Enter the take profit as a price.';
    if (side === 'long' ? target <= price : target >= price) return side === 'long' ? 'For a long position, the take profit goes above the current price.' : 'For a short position, the take profit goes below the current price.';
    return null;
  };
  switch (type) {
    case 'open': {
      if (state.position) return 'You already have a position. Add to it, reduce it or close it first.';
      if (state.stoppedOut) return 'Your capital fell to the floor, so you can’t open new positions in this match.';
      if (!['long', 'short'].includes(pl.side)) return 'Choose long or short.';
      if (!finite(pl.sizePct) || pl.sizePct < 1 || pl.sizePct > rules.maxLeverage * 100) return `Choose a size from 1% to ${rules.maxLeverage * 100}% of your capital.`;
      const t = pl.thesis;
      if (!t || !['bullish', 'bearish', 'range'].includes(t.view) || !Array.isArray(t.reasons) || !t.reasons.length || !['low', 'medium', 'high'].includes(t.confidence)) return 'Say what you expect, why, and how confident you are before opening a position.';
      return checkStop(pl.side, pl.stop) ?? checkTarget(pl.side, pl.target);
    }
    case 'increase': {
      if (!state.position) return 'There’s no position to add to.';
      if (!finite(pl.sizePct) || pl.sizePct > rules.maxLeverage * 100) return 'Choose how much to add.';
      const room = rules.maxLeverage * 100 - state.position.sizePct;
      if (room < 1) return `Your position is already at the ${rules.maxLeverage}× limit.`;
      return null;
    }
    case 'reduce':
      if (!state.position) return 'There’s no position to reduce.';
      if (![0.25, 0.5, 0.75].includes(pl.fraction)) return 'Choose how much to reduce.';
      return null;
    case 'close':
      return state.position ? null : 'There’s no position to close.';
    case 'modify': {
      if (!state.position) return 'There’s no position to change.';
      if (!('stop' in pl) && !('target' in pl)) return 'Nothing to change.';
      if ('stop' in pl) {
        const e = checkStop(state.position.side, pl.stop);
        if (e) return e;
      }
      if ('target' in pl) {
        const e = checkTarget(state.position.side, pl.target);
        if (e) return e;
      }
      return null;
    }
    default:
      return 'That isn’t something you can do in a match.';
  }
}
