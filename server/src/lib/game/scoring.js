// The Kotka Performance Score: how good the decisions were, not only how
// much was made. Everything here is computed from the player's recorded
// decisions and the market as it stood at each decision (completed candles
// only, so no hindsight), and every finding describes observable trading
// behaviour, never a diagnosis.
//
// Categories (weights are configurable; defaults below):
//   outcome      the return
//   risk         stops, risk per trade, drawdown, leverage
//   decision     thesis coherence, confirmation, chasing, drift, planned R:R
//   execution    exits against plan, giving back profit, being stopped out
//   consistency  sizing, sizing up after losses, overtrading

import { candlesUpTo, templateOf } from './market.js';
import { sma, rsi, macd, atr, levels as swingLevels } from './indicators.js';

export const DEFAULT_WEIGHTS = { outcome: 30, risk: 25, decision: 20, execution: 15, consistency: 10 };
export const DEFAULT_SCORING = { goodRiskPct: 2, maxRiskPct: 5, highLeveragePct: 300, overtradesPer15Min: 8, revengeTicks: 30, driftGraceTicks: 30 };

const clamp = (v) => Math.max(0, Math.min(100, v));
const r1 = (v) => Math.round(v * 10) / 10;
const fmtAt = (p, dp) => Number(p).toLocaleString('en-NG', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const mmss = (tick) => `${String(Math.floor(tick / 60)).padStart(2, '0')}:${String(tick % 60).padStart(2, '0')}`;

// Indicators on completed candles, indexed by candle.
function context(market) {
  const all = candlesUpTo(market, market.prices.length - 1);
  const closes = all.map((c) => c.c);
  return { all, ma20: sma(closes, 20), ma50: sma(closes, 50), rsi: rsi(closes), macd: macd(closes), atr: atr(all) };
}

// The market at a match tick, from the last completed candle before it.
function marketAt(market, ctx, tick) {
  const abs = market.historyTicks + tick;
  const i = Math.max(0, Math.floor(abs / market.candleSec) - 1);
  const window = ctx.all.slice(Math.max(0, i - 40), i + 1);
  return {
    i,
    close: ctx.all[i].c,
    ma20: ctx.ma20[i],
    ma50: ctx.ma50[i],
    rsi: ctx.rsi[i],
    hist: ctx.macd.hist[i],
    atr: ctx.atr[i] ?? ctx.all[i].h - ctx.all[i].l,
    recentHigh: Math.max(...ctx.all.slice(Math.max(0, i - 20), i).map((c) => c.h)),
    recentLow: Math.min(...ctx.all.slice(Math.max(0, i - 20), i).map((c) => c.l)),
    move3: ctx.all[i].c - ctx.all[Math.max(0, i - 3)].c,
    levels: swingLevels(window),
  };
}

// Does the market at entry support each reason given? true / false / null (can't tell).
function reasonHolds(reason, side, m, price) {
  const long = side === 'long';
  const near = (lvl) => lvl != null && Math.abs(price - lvl) <= m.atr * 1.2;
  switch (reason) {
    case 'trend':
      if (m.ma20 == null || m.ma50 == null) return null;
      return long ? m.close > m.ma20 && m.ma20 > m.ma50 : m.close < m.ma20 && m.ma20 < m.ma50;
    case 'breakout':
      return long ? price > m.recentHigh : price < m.recentLow;
    case 'support':
      return long && near(m.levels.support[0]?.price ?? m.recentLow);
    case 'resistance':
      return !long && near(m.levels.resistance[0]?.price ?? m.recentHigh);
    case 'momentum':
      if (m.hist == null || m.rsi == null) return null;
      return long ? m.hist > 0 && m.rsi > 50 : m.hist < 0 && m.rsi < 50;
    case 'reversal':
      if (m.rsi == null) return null;
      return long ? m.rsi < 40 : m.rsi > 60;
    case 'indicator':
      if (m.rsi == null || m.hist == null) return null;
      return long ? m.hist > 0 || m.rsi < 35 : m.hist < 0 || m.rsi > 65;
    default:
      return null;
  }
}

function assessTrade(tr, market, ctx, cfg, rules) {
  const m = marketAt(market, ctx, tr.openTick);
  const long = tr.side === 'long';
  const f = { tick: tr.openTick };
  const thesis = tr.thesis ?? {};
  // A range view can be traded from either side; a directional view can't.
  f.coherent = thesis.view === 'range' || (thesis.view === 'bullish') === long;
  const reasons = (thesis.reasons ?? []).filter((r) => r !== 'multiple');
  const checks = reasons.map((r) => reasonHolds(r, tr.side, m, tr.openPrice)).filter((x) => x !== null);
  f.confirmed = checks.length ? checks.filter(Boolean).length / checks.length : null;
  if (thesis.reasons?.includes('multiple') && checks.filter(Boolean).length < 2) f.confirmed = Math.min(f.confirmed ?? 0, 0.5);
  f.chasing = (long ? m.move3 : -m.move3) > 2.5 * m.atr;
  f.rr = tr.stopAtOpen != null && tr.targetAtOpen != null ? Math.abs(tr.targetAtOpen - tr.openPrice) / Math.max(Math.abs(tr.openPrice - tr.stopAtOpen), 1e-9) : null;
  f.risk = tr.riskPctAtOpen;
  f.size = tr.maxSizePct;

  // Stop behaviour while the position was open.
  let widened = 0;
  let removed = 0;
  let lastStop = tr.stopAtOpen;
  for (const s of tr.stops.slice(1)) {
    if (s.stop == null && lastStop != null) removed += 1;
    else if (s.stop != null && lastStop != null && (long ? s.stop < lastStop : s.stop > lastStop)) widened += 1;
    lastStop = s.stop;
  }
  f.stopWidened = widened;
  f.stopRemoved = removed;
  f.addedWhileLosing = tr.addedWhileLosing;

  // Thesis drift: a candle closed through the point where the idea was wrong,
  // and the position stayed open well after.
  const invalidation = tr.stopAtOpen ?? (long ? tr.openPrice - 1.5 * m.atr : tr.openPrice + 1.5 * m.atr);
  f.invalidation = invalidation;
  const closeTick = tr.closeTick ?? market.matchTicks - 1;
  for (let t = tr.openTick + market.candleSec; t <= closeTick; t += market.candleSec) {
    const c = ctx.all[Math.floor((market.historyTicks + t) / market.candleSec) - 1];
    if (!c) break;
    if (long ? c.c < invalidation : c.c > invalidation) {
      if (closeTick - t > cfg.driftGraceTicks) f.drift = { tick: t, level: invalidation };
      break;
    }
  }

  // Execution: how the exit compares with the plan and with what was on offer.
  const perUnit = long ? tr.exitPrice - tr.openPrice : tr.openPrice - tr.exitPrice;
  f.captured = tr.mfe > 0 && perUnit > 0 ? perUnit / tr.mfe : null;
  f.lossVsPlan = perUnit < 0 && tr.stopAtOpen != null ? -perUnit / Math.max(Math.abs(tr.openPrice - tr.stopAtOpen), 1e-9) : null;
  f.exitReason = tr.exitReason;
  f.won = tr.pnl > 0;
  return f;
}

/**
 * score({ market, sim, rules, weights, scoring }) → { score, subscores, metrics, findings, decisionPoints, report }
 * sim must be the final simulation (final: true).
 */
export function scorePlayer({ market, sim, rules, weights = DEFAULT_WEIGHTS, scoring = DEFAULT_SCORING }) {
  const cfg = { ...DEFAULT_SCORING, ...scoring };
  const fmt = (v) => fmtAt(v, market.decimals ?? 2);
  const ctx = context(market);
  const trades = sim.trades;
  const assess = trades.map((tr) => assessTrade(tr, market, ctx, cfg, rules));
  const findings = [];
  const points = [];
  const good = (key, text, tick) => findings.push({ key, tone: 'good', text, tick });
  const bad = (key, text, tick) => findings.push({ key, tone: 'bad', text, tick });

  // Time in the market without a stop.
  let inPos = 0;
  let unprotected = 0;
  for (const tr of trades) {
    const end = tr.closeTick ?? market.matchTicks - 1;
    for (let t = tr.openTick; t <= end; t++) {
      inPos += 1;
      const s = [...tr.stops].reverse().find((x) => x.tick <= t);
      if (!s || s.stop == null) unprotected += 1;
    }
  }
  const noStopShare = inPos ? unprotected / inPos : 0;
  const risks = assess.map((a) => a.risk).filter((x) => x != null);
  const avgRisk = risks.length ? risks.reduce((s, x) => s + x, 0) / risks.length : null;
  const maxRisk = risks.length ? Math.max(...risks) : null;
  const maxSize = trades.length ? Math.max(...trades.map((t) => t.maxSizePct)) : 0;
  const widened = assess.reduce((s, a) => s + a.stopWidened, 0);
  const removed = assess.reduce((s, a) => s + a.stopRemoved, 0);
  const drifts = assess.filter((a) => a.drift);
  const chases = assess.filter((a) => a.chasing);
  const addLosing = assess.reduce((s, a) => s + a.addedWhileLosing, 0);

  // Sizing up after a loss, and trading again straight after one.
  let sizeUpAfterLoss = 0;
  let revenge = 0;
  for (let i = 1; i < trades.length; i++) {
    const prev = trades[i - 1];
    if (prev.pnl < 0) {
      if (trades[i].maxSizePct > prev.maxSizePct * 1.5) {
        sizeUpAfterLoss += 1;
        points.push({ tick: trades[i].openTick, text: `After a losing trade, the next position was ${r1(trades[i].maxSizePct / prev.maxSizePct)}× larger.` });
      }
      if (prev.closeTick != null && trades[i].openTick - prev.closeTick <= cfg.revengeTicks) revenge += 1;
    }
  }
  const overtradeLimit = Math.max(3, Math.round((cfg.overtradesPer15Min * market.matchTicks) / 900));
  const overtrading = trades.length > overtradeLimit;

  // ── Category scores ──
  const ret = sim.returnPct;
  const outcome = clamp(50 + 50 * Math.tanh(ret / 6));

  let risk = trades.length ? 100 : 70;
  if (trades.length) {
    risk -= noStopShare * 35;
    if (avgRisk != null && avgRisk > cfg.goodRiskPct) risk -= Math.min(30, (avgRisk - cfg.goodRiskPct) * 4);
    if (maxRisk != null && maxRisk > cfg.maxRiskPct) risk -= 15;
    if (sim.maxDrawdownPct > 3) risk -= Math.min(25, (sim.maxDrawdownPct - 3) * 3);
    risk -= Math.min(20, widened * 10);
    risk -= Math.min(30, removed * 15);
    if (maxSize > cfg.highLeveragePct) risk -= 10;
    if (sim.stoppedOut) risk -= 30;
  }

  let decision = trades.length ? 60 : 50;
  if (trades.length) {
    const per = assess.map((a) => {
      let s = 0;
      s += a.coherent ? 8 : -12;
      if (a.confirmed != null) s += (a.confirmed - 0.5) * 30;
      if (a.chasing) s -= 10;
      if (a.drift) s -= 15;
      if (a.rr != null) s += a.rr >= 1.5 ? 8 : a.rr < 1 ? -8 : 0;
      if (a.addedWhileLosing) s -= 10;
      return s;
    });
    decision += per.reduce((s, x) => s + x, 0) / per.length;
    if (overtrading) decision -= 10;
  }

  let execution = trades.length ? 60 : 50;
  if (trades.length) {
    const per = assess.map((a) => {
      let s = 0;
      if (a.captured != null) s += a.captured >= 0.6 ? 15 : a.captured < 0.3 ? -10 : 5;
      if (a.lossVsPlan != null) s += a.lossVsPlan <= 1.1 ? 10 : a.lossVsPlan > 1.5 ? -15 : 0;
      if (a.exitReason === 'target') s += 8;
      if (a.exitReason === 'end') s -= 5;
      if (a.exitReason === 'stop_out') s -= 30;
      if (a.drift) s -= 10;
      return s;
    });
    execution += per.reduce((s, x) => s + x, 0) / per.length;
  }

  let consistency = trades.length ? 80 : 60;
  if (trades.length) {
    if (trades.length >= 2) {
      const sizes = trades.map((t) => t.maxSizePct);
      const mean = sizes.reduce((s, x) => s + x, 0) / sizes.length;
      const cv = Math.sqrt(sizes.reduce((s, x) => s + (x - mean) ** 2, 0) / sizes.length) / Math.max(mean, 1e-9);
      if (cv > 0.6) consistency -= 15;
    }
    consistency -= Math.min(30, sizeUpAfterLoss * 15);
    consistency -= Math.min(30, revenge * 15);
    if (overtrading) consistency -= 20;
    if (trades.every((t) => t.stopAtOpen != null)) consistency += 10;
  }

  const subscores = { outcome: r1(clamp(outcome)), risk: r1(clamp(risk)), decision: r1(clamp(decision)), execution: r1(clamp(execution)), consistency: r1(clamp(consistency)) };
  const wsum = Object.values(weights).reduce((s, x) => s + x, 0) || 1;
  const score = r1(Object.entries(weights).reduce((s, [k, w]) => s + (subscores[k] ?? 0) * w, 0) / wsum);

  // ── Findings, in plain words ──
  if (!trades.length) {
    findings.push({ key: 'no_trades', tone: 'neutral', text: 'You didn’t open a position. Staying out is a valid decision, but it also means there was nothing to judge beyond capital kept.' });
  } else {
    if (noStopShare === 0) good('stops', 'Every position had a stop loss the whole time it was open.');
    else if (noStopShare > 0.5) bad('no_stop', `Your positions had no stop loss for ${Math.round(noStopShare * 100)}% of the time they were open.`);
    if (avgRisk != null && avgRisk <= cfg.goodRiskPct) good('risk_size', `You risked about ${r1(avgRisk)}% of your capital per trade.`);
    if (maxRisk != null && maxRisk > cfg.maxRiskPct) bad('oversize', `One trade risked ${r1(maxRisk)}% of your capital, more than the ${cfg.maxRiskPct}% most traders use as a ceiling.`, assess.find((a) => a.risk === maxRisk)?.tick);
    if (maxSize > cfg.highLeveragePct) bad('leverage', `Your largest position was ${Math.round(maxSize)}% of your capital, so small moves had a big effect.`);
    if (widened) bad('stop_widened', `You moved a stop loss further away ${widened === 1 ? 'once' : `${widened} times`}, which increased the risk you had planned.`);
    if (removed) bad('stop_removed', `You removed a stop loss ${removed === 1 ? 'once' : `${removed} times`}.`);
    if (addLosing) bad('add_losing', `You added to a position while it was losing ${addLosing === 1 ? 'once' : `${addLosing} times`}.`);
    if (sizeUpAfterLoss) bad('size_after_loss', 'You increased your position size straight after a losing trade.');
    if (revenge) bad('quick_reentry', `You opened a new trade within ${cfg.revengeTicks} seconds of closing a loss ${revenge === 1 ? 'once' : `${revenge} times`}.`);
    if (overtrading) bad('overtrading', `You made ${trades.length} trades in ${Math.round(market.matchTicks / 60)} minutes.`);
    if (chases.length) bad('chasing', `${chases.length === 1 ? 'One entry came' : `${chases.length} entries came`} after the price had already moved sharply in that direction.`, chases[0].tick);
    const confirmed = assess.filter((a) => a.confirmed != null && a.confirmed >= 0.75);
    if (confirmed.length === assess.length) good('confirmed', 'The market supported the reasons you gave when you entered.');
    else if (assess.some((a) => a.confirmed != null && a.confirmed < 0.5)) bad('unconfirmed', 'At least one entry wasn’t supported by the reasons you gave (for example a breakout you called before price broke the level).', assess.find((a) => a.confirmed != null && a.confirmed < 0.5)?.tick);
    if (assess.some((a) => !a.coherent)) bad('incoherent', 'You traded against the view you declared (for example going short with a bullish view).');
    const rrs = assess.map((a) => a.rr).filter((x) => x != null);
    if (rrs.length && rrs.every((x) => x >= 1.5)) good('rr', 'Your targets were at least 1.5 times your stop distance.');
    for (const a of drifts) {
      bad('thesis_drift', `Your original idea was invalidated at ${mmss(a.drift.tick)} when price closed through ${fmt(a.drift.level)}, but you stayed in the position.`, a.drift.tick);
      points.push({ tick: a.drift.tick, text: 'Your original thesis was invalidated here, but the position stayed open.' });
    }
    const respected = assess.filter((a) => a.lossVsPlan != null && a.lossVsPlan <= 1.1);
    if (respected.length && respected.length === assess.filter((a) => a.lossVsPlan != null).length) good('respected_stop', 'Your losing trades were closed at or before your planned stop.');
    const gaveBack = assess.filter((a) => a.captured != null && a.captured < 0.3);
    if (gaveBack.length) bad('gave_back', 'A winning trade gave back most of its best profit before you closed it.');
    if (sim.stoppedOut) bad('stopped_out', 'Your capital fell to the floor and your position was closed for you.');
    if (sim.maxDrawdownPct <= 2 && ret >= 0) good('capital', `Your capital never fell more than ${r1(sim.maxDrawdownPct)}% from its high.`);
  }
  for (const tr of trades) points.push({ tick: tr.openTick, text: `${tr.side === 'long' ? 'Long' : 'Short'} entry at ${fmt(tr.openPrice)}${tr.riskPctAtOpen != null ? `, risking ${r1(tr.riskPctAtOpen)}%` : ', with no stop'}.` });
  for (const e of market.events) if (e.tick >= market.historyTicks) points.push({ tick: e.tick - market.historyTicks, text: e.label, market: true });
  points.sort((a, b) => a.tick - b.tick);

  const metrics = {
    returnPct: sim.returnPct,
    finalEquity: sim.equity,
    maxDrawdownPct: sim.maxDrawdownPct,
    trades: trades.length,
    winners: trades.filter((t) => t.pnl > 0).length,
    avgRiskPct: avgRisk != null ? r1(avgRisk) : null,
    maxRiskPct: maxRisk != null ? r1(maxRisk) : null,
    maxSizePct: r1(maxSize),
    noStopSharePct: Math.round(noStopShare * 100),
    stoppedOut: sim.stoppedOut,
  };
  return { score, subscores, metrics, findings, decisionPoints: points, report: buildReport({ market, subscores, findings, metrics, trades }) };
}

// The learning part of the result: plain, specific, no psychology.
function buildReport({ market, subscores, findings, metrics, trades }) {
  const tpl = templateOf(market.scenario);
  const goodOnes = findings.filter((f) => f.tone === 'good').map((f) => f.text);
  const badOnes = findings.filter((f) => f.tone === 'bad').map((f) => f.text);
  const weakest = Object.entries(subscores).filter(([k]) => k !== 'outcome').sort((a, b) => a[1] - b[1])[0]?.[0];
  const riskLesson =
    findings.some((f) => ['no_stop', 'stop_removed', 'stop_widened'].includes(f.key))
      ? 'Set the stop where your idea is proven wrong, before you enter, and leave it there or move it only in your favour.'
      : findings.some((f) => ['oversize', 'leverage', 'size_after_loss'].includes(f.key))
        ? 'Size each trade from the stop: risk a fixed small share of capital (1–2%), so one bad trade can’t decide the match.'
        : 'Keep risk per trade small and fixed; it lets good decisions show over several trades.';
  const behaviour =
    findings.find((f) => ['size_after_loss', 'quick_reentry', 'add_losing', 'overtrading', 'thesis_drift', 'chasing'].includes(f.key))?.text ??
    (trades.length ? 'No risky pattern stood out in this match.' : 'You stayed out of the market for the whole match.');
  const practice = {
    risk: 'Practise a match using a stop on every trade and no more than 2% risk each time.',
    decision: 'Practise waiting for confirmation: enter only when the chart shows the reason you give.',
    execution: 'Practise planning exits: set a target and a stop on entry, and judge the trade against them.',
    consistency: 'Practise keeping the same size on every trade, whatever happened on the last one.',
  }[weakest] ?? 'Practise another match in a different kind of market.';
  let summary;
  if (!trades.length) summary = 'You didn’t trade, so your capital was untouched. Your score reflects that there were no decisions to credit.';
  else if (metrics.returnPct > 0 && subscores.risk >= 70 && subscores.decision >= 65) summary = 'You read the market well and kept your risk under control. The result came from good process.';
  else if (metrics.returnPct > 0) summary = 'You finished with a profit, but parts of your process exposed you to more risk than the result shows.';
  else if (subscores.risk >= 70 && subscores.decision >= 60) summary = 'You lost money, but your decisions and risk control were sound. Losing trades are part of a good process.';
  else summary = 'The loss came mostly from how the trades were managed. The points below show where.';
  return {
    summary,
    didWell: goodOnes.length ? goodOnes : ['You finished the match and every decision was recorded for review.'],
    hurt: badOnes,
    riskLesson,
    marketLesson: tpl?.lesson ?? null,
    scenarioName: tpl?.name ?? market.scenario,
    behaviour,
    practice,
  };
}
