// The Learn page: how Kotka judges a match (from the live settings, so it
// always matches what the next match will use), what each kind of market
// teaches, and what the trader's own recorded matches show. Nothing here is
// sample data: rules come from settings, progress from the player's rows.

import { prisma } from '../prisma.js';
import { TEMPLATES } from './market.js';
import { BADGES } from './progression.js';
import { FAMILY, insightsFor, traderDna } from './arena.js';

// Every behaviour the scorer can record, with the setting that drives it.
function behaviours(sc, trading) {
  const over15 = sc.overtradesPer15Min;
  return [
    { key: 'no_stop', area: 'risk', title: 'Trading without a stop loss', how: 'Counted when positions are without a stop for more than half the time they’re open.' },
    { key: 'oversize', area: 'risk', title: 'Risking too much on one trade', how: `Counted when a trade risks more than ${sc.maxRiskPct}% of your capital. About ${sc.goodRiskPct}% or less is what Kotka treats as sensible.` },
    { key: 'leverage', area: 'risk', title: 'Very large positions', how: `Counted when a position is bigger than ${sc.highLeveragePct / 100}× your capital (the most you can take is ${trading.maxLeverage}×).` },
    { key: 'stop_widened', area: 'risk', title: 'Moving a stop further away', how: 'Counted each time a stop is moved away from your entry, which adds risk you hadn’t planned.' },
    { key: 'stop_removed', area: 'risk', title: 'Removing a stop', how: 'Counted each time a stop is taken off an open position.' },
    { key: 'add_losing', area: 'decision', title: 'Adding to a losing position', how: 'Counted when you increase a position while it’s losing.' },
    { key: 'unconfirmed', area: 'decision', title: 'Entering before the market confirms', how: 'Counted when the chart at your entry didn’t support the reasons you gave (for example a breakout called before price broke the level).' },
    { key: 'chasing', area: 'decision', title: 'Chasing a move', how: 'Counted when you enter after price has already moved sharply in that direction.' },
    { key: 'incoherent', area: 'decision', title: 'Trading against your own view', how: 'Counted when the direction you trade contradicts the view you declared.' },
    { key: 'thesis_drift', area: 'decision', title: 'Thesis drift', how: `Counted when a candle closes through the point where your idea was wrong and you stay in for more than ${sc.driftGraceTicks} seconds after.` },
    { key: 'gave_back', area: 'execution', title: 'Giving back profit', how: 'Counted when a winning trade gives back most of its best profit before you close it.' },
    { key: 'early_exit', area: 'execution', title: 'Closing winners far short of plan', how: 'Counted when you close a winning trade by hand less than halfway to the target you set when you entered.' },
    { key: 'stopped_out', area: 'execution', title: 'Hitting the capital floor', how: `Counted when your capital falls to ${trading.stopOutPct}% of the start and your position is closed for you.` },
    { key: 'size_after_loss', area: 'consistency', title: 'Sizing up after a loss', how: 'Counted when the next position is more than 1.5× the size of a losing one.' },
    { key: 'quick_reentry', area: 'consistency', title: 'Trading again straight after a loss', how: `Counted when a new trade opens within ${sc.revengeTicks} seconds of closing a loss.` },
    { key: 'overtrading', area: 'consistency', title: 'Overtrading', how: `Counted when you make more than ${over15} trades per 15 minutes of match (scaled to the match length).` },
    { key: 'held_losers', area: 'consistency', title: 'Holding losers longer than winners', how: 'Counted when losing trades are held at least twice as long as winning ones (two or more of each).' },
    { key: 'strategy_switching', area: 'consistency', title: 'Switching approach every trade', how: 'Counted when both your reason and your direction change on every trade across three or more trades.' },
    { key: 'inconsistent_risk', area: 'consistency', title: 'Uneven risk', how: 'Counted when your riskiest trade risks three or more times your safest.' },
    { key: 'small_stake', area: 'risk', title: 'Token positions', how: `Your process counts in full from positions of ${sc.fullCreditSizePct}% of your capital. Smaller positions, or ones closed by hand within seconds, count for less, and a player who barely trades can’t win a competition: at best it’s a draw.` },
  ];
}

// What raises and lowers each part of the score, in the live settings.
function categories(sc, trading) {
  return {
    outcome: { measures: 'Your return over the match.', up: ['Finishing with more capital than you started.'], down: ['Finishing with less. A loss counts, but it’s only one part of the score.'] },
    // How much of the other four counts depends on what you had at stake.
    credit: `Risk, decision quality, execution and consistency count in full when your positions are ${sc.fullCreditSizePct}% of your capital or more. Token positions count for less, and not trading at all scores a neutral 50 on each.`,
    risk: {
      measures: 'How much you could lose, and how well you protected your capital.',
      up: ['A stop loss on every position, the whole time it’s open.', `About ${sc.goodRiskPct}% of your capital or less at risk per trade.`, 'A small drawdown.'],
      down: ['Time without a stop.', `More than ${sc.maxRiskPct}% at risk on one trade.`, `Positions larger than ${sc.highLeveragePct / 100}× your capital.`, 'Moving a stop away or removing it.', `Hitting the capital floor (${trading.stopOutPct}%).`],
    },
    decision: {
      measures: 'Whether your reasons held up when you entered, and whether you acted on the market in front of you.',
      up: ['Entries the chart supports, for the reasons you gave.', 'Targets at least 1.5 times your stop distance.', 'Trading in the direction of your declared view.'],
      down: ['Entering before confirmation, or chasing a move.', 'Staying in after your idea was proven wrong (thesis drift).', 'Adding to a losing position.', 'Overtrading.'],
    },
    execution: {
      measures: 'How your exits compare with your plan and with what the market offered.',
      up: ['Winners closed near their best, or at your target.', 'Losers closed at or before your planned stop.'],
      down: ['Giving back most of a winner’s profit.', 'Closing winners far short of your target.', 'Losses bigger than the stop you planned.', 'Being closed out at the capital floor.'],
    },
    consistency: {
      measures: 'Whether you trade the same way from one trade to the next.',
      up: ['Steady size and risk on every trade.', 'A stop set on every entry.'],
      down: ['Sizing up after a loss.', `A new trade within ${sc.revengeTicks} seconds of a loss.`, 'Overtrading.', 'Holding losers much longer than winners.', 'Switching approach on every trade.', 'Uneven risk per trade.'],
    },
  };
}

export async function learnData(userId, s) {
  const [row, rows, badges, insights, dna] = await Promise.all([
    prisma.gameSettings.findUnique({ where: { id: 'singleton' }, select: { updatedAt: true } }),
    prisma.gamePlayer.findMany({
      where: { userId, score: { not: null }, outcome: { not: 'refund' } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { score: true, subscores: true, outcome: true, returnPct: true, report: true, createdAt: true, match: { select: { id: true, mode: true, scenario: true, symbol: true } } },
    }),
    prisma.gameBadge.findMany({ where: { userId }, select: { badge: true, awardedAt: true } }),
    insightsFor(userId),
    traderDna(userId),
  ]);
  const catalogue = behaviours(s.scoring, s.trading);
  const traded = rows.filter((r) => (r.report?.metrics?.trades ?? 0) > 0);
  // How often each behaviour showed up across your recent traded matches.
  const seen = new Map();
  for (const r of traded.slice(0, 20)) for (const key of new Set((r.report?.findings ?? []).filter((f) => f.tone === 'bad').map((f) => f.key))) seen.set(key, (seen.get(key) ?? 0) + 1);
  // Results by kind of market.
  const byKind = new Map();
  for (const r of rows) {
    const k = r.match.scenario;
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k).push(r.score);
  }
  const avg = (a) => Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10;
  const have = new Map(badges.map((b) => [b.badge, b.awardedAt]));
  return {
    rules: {
      weights: s.weights,
      scoring: s.scoring,
      trading: { maxLeverage: s.trading.maxLeverage, stopOutPct: s.trading.stopOutPct, spreadBps: s.trading.spreadBps },
      drawTolerance: s.drawTolerance,
      noTradeRefund: s.noTradeRefund,
      startingCapital: s.startingCapital,
      updatedAt: row?.updatedAt ?? null,
      categories: categories(s.scoring, s.trading),
    },
    behaviours: catalogue.map((b) => ({ ...b, yours: seen.get(b.key) ?? 0 })),
    lessons: TEMPLATES.filter((t) => s.scenarios.includes(t.key)).map((t) => {
      const scores = byKind.get(t.key) ?? [];
      return { key: t.key, name: t.name, family: FAMILY[t.key] ?? null, lesson: t.lesson, watch: t.watch, mistake: t.mistake, yours: scores.length ? { matches: scores.length, avgScore: avg(scores) } : null };
    }),
    progress: {
      matches: rows.length,
      traded: traded.length,
      recentTraded: Math.min(traded.length, 20),
      history: rows.slice(0, 20).reverse().map((r) => ({ at: r.createdAt, score: r.score, subscores: r.subscores, outcome: r.outcome, mode: r.match.mode, pair: r.match.symbol, market: TEMPLATES.find((t) => t.key === r.match.scenario)?.name ?? null })),
    },
    badges: Object.entries(BADGES).map(([key, b]) => ({ key, name: b.name, how: b.how, awardedAt: have.get(key) ?? null })),
    insights,
    dna,
  };
}
