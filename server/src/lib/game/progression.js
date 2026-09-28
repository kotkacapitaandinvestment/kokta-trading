// Progression: XP, levels and badges. Entirely separate from money: nothing
// here can be bought, sold or withdrawn, and a settlement never depends on it.

import { prisma } from '../prisma.js';

export const BADGES = {
  risk_manager: { name: 'Risk Manager', how: 'A risk score of 90 or more in 3 matches.' },
  disciplined_trader: { name: 'Disciplined Trader', how: 'A stop loss on every trade in 5 matches.' },
  capital_protector: { name: 'Capital Protector', how: 'Finish level or up with under 2% drawdown in 5 matches.' },
  trend_hunter: { name: 'Trend Hunter', how: 'Finish up in 3 trending markets.' },
  breakout_specialist: { name: 'Breakout Specialist', how: 'A decision score of 80 or more, and a profit, in a breakout or false breakout.' },
  volatility_navigator: { name: 'Volatility Navigator', how: 'A score of 75 or more in a high-volatility or shock market.' },
};

const TRENDING = ['bull_trend', 'bear_trend', 'trend_continuation', 'momentum_expansion'];

export const levelFor = (xp) => Math.floor(1 + Math.sqrt(Math.max(0, xp) / 50));
export const xpForLevel = (level) => 50 * (level - 1) ** 2;

export async function awardProgress({ userId, matchId, score, subscores, metrics, outcome, scenario }) {
  const played = outcome !== 'refund';
  const xp = !played ? 0 : outcome === 'practice' ? 20 + Math.round((score ?? 0) / 10) : 50 + (outcome === 'win' ? 30 : outcome === 'draw' ? 15 : 0) + Math.round((score ?? 0) / 5);
  if (xp) {
    const prof = await prisma.gameProfile.upsert({ where: { userId }, update: { xp: { increment: xp } }, create: { userId, xp } });
    const level = levelFor(prof.xp);
    if (level !== prof.level) await prisma.gameProfile.update({ where: { userId }, data: { level } });
    await prisma.gamePlayer.update({ where: { matchId_userId: { matchId, userId } }, data: { xpAwarded: xp } });
  }

  // Badges from what actually happened in this player's matches.
  const rows = await prisma.gamePlayer.findMany({ where: { userId, score: { not: null }, outcome: { not: 'refund' } }, select: { score: true, subscores: true, report: true, returnPct: true, maxDrawdownPct: true, match: { select: { scenario: true } } } });
  const count = (fn) => rows.filter(fn).length;
  const earned = [];
  if (count((r) => r.subscores?.risk >= 90) >= 3) earned.push('risk_manager');
  if (count((r) => r.report?.metrics?.trades > 0 && r.report?.metrics?.noStopSharePct === 0) >= 5) earned.push('disciplined_trader');
  if (count((r) => (r.returnPct ?? 0) >= 0 && (r.maxDrawdownPct ?? 100) < 2 && r.report?.metrics?.trades > 0) >= 5) earned.push('capital_protector');
  if (count((r) => TRENDING.includes(r.match.scenario) && (r.returnPct ?? 0) > 0) >= 3) earned.push('trend_hunter');
  if (count((r) => ['breakout', 'false_breakout'].includes(r.match.scenario) && r.subscores?.decision >= 80 && (r.returnPct ?? 0) > 0) >= 1) earned.push('breakout_specialist');
  if (count((r) => ['high_volatility', 'volatility_shock'].includes(r.match.scenario) && r.score >= 75) >= 1) earned.push('volatility_navigator');
  for (const badge of earned) await prisma.gameBadge.upsert({ where: { userId_badge: { userId, badge } }, update: {}, create: { userId, badge, matchId } });
  return { xp, badges: earned };
}

// A trader's record: quality first, not just wins.
export async function profileFor(userId) {
  const [prof, badges, rows] = await Promise.all([
    prisma.gameProfile.findUnique({ where: { userId } }),
    prisma.gameBadge.findMany({ where: { userId }, orderBy: { awardedAt: 'asc' } }),
    prisma.gamePlayer.findMany({ where: { userId, score: { not: null } }, select: { score: true, subscores: true, returnPct: true, maxDrawdownPct: true, outcome: true, payoutKobo: true, matchId: true, match: { select: { mode: true, stakeKobo: true, scenario: true, settledAt: true } } } }),
  ]);
  const duels = rows.filter((r) => r.match.mode === 'duel' && r.outcome !== 'refund');
  const avg = (list, fn) => (list.length ? Math.round((list.reduce((s, r) => s + (fn(r) ?? 0), 0) / list.length) * 10) / 10 : null);
  const scored = rows.filter((r) => r.outcome !== 'refund');
  const best = scored.reduce((b, r) => (!b || r.score > b.score ? r : b), null);
  const worst = scored.reduce((b, r) => (!b || r.score < b.score ? r : b), null);
  const xp = prof?.xp ?? 0;
  const level = levelFor(xp);
  return {
    level,
    xp,
    nextLevelXp: xpForLevel(level + 1),
    thisLevelXp: xpForLevel(level),
    matches: duels.length,
    practice: rows.filter((r) => r.match.mode === 'practice').length,
    wins: duels.filter((r) => r.outcome === 'win').length,
    losses: duels.filter((r) => r.outcome === 'loss').length,
    draws: duels.filter((r) => r.outcome === 'draw').length,
    totalStakedKobo: duels.reduce((s, r) => s + Number(r.match.stakeKobo), 0),
    totalWonKobo: duels.filter((r) => r.outcome === 'win' || r.outcome === 'draw').reduce((s, r) => s + Number(r.payoutKobo), 0),
    avgScore: avg(scored, (r) => r.score),
    avgReturnPct: avg(scored, (r) => r.returnPct),
    avgDrawdownPct: avg(scored, (r) => r.maxDrawdownPct),
    avgRisk: avg(scored, (r) => r.subscores?.risk),
    avgDecision: avg(scored, (r) => r.subscores?.decision),
    avgProcess: avg(scored, (r) => ((r.subscores?.risk ?? 0) + (r.subscores?.decision ?? 0) + (r.subscores?.execution ?? 0) + (r.subscores?.consistency ?? 0)) / 4),
    best: best ? { matchId: best.matchId, score: best.score } : null,
    weakest: worst ? { matchId: worst.matchId, score: worst.score } : null,
    badges: badges.map((b) => ({ key: b.badge, name: BADGES[b.badge]?.name ?? b.badge, how: BADGES[b.badge]?.how, awardedAt: b.awardedAt })),
    allBadges: Object.entries(BADGES).map(([key, b]) => ({ key, ...b })),
  };
}
