// Risk and compliance signals for the Trading Game admin: patterns worth a
// human look, not verdicts. Each one is counted from settled matches and the
// money ledger; nothing is blocked automatically.

import { prisma } from '../prisma.js';
import { kobo } from './wallet.js';
import { peopleFor, personOf } from './matches.js';

const DAY = 86400e3;

export async function riskSignals({ days = 14 } = {}) {
  const since = new Date(Date.now() - days * DAY);
  const matches = await prisma.gameMatch.findMany({
    where: { mode: 'duel', status: 'SETTLED', settledAt: { gte: since } },
    select: { id: true, settledAt: true, stakeKobo: true, result: true, players: { select: { userId: true, outcome: true, report: true } } },
    orderBy: { settledAt: 'desc' },
  });

  // The same two traders playing each other again and again.
  const pairs = new Map();
  // One side lost without ever trading while the other won: the pattern of
  // someone passing money to another account.
  const oneSided = new Map();
  for (const m of matches) {
    const [p, q] = m.players;
    if (!p?.userId || !q?.userId) continue;
    const key = [p.userId, q.userId].sort().join(':');
    const row = pairs.get(key) ?? { users: [p.userId, q.userId].sort(), matches: 0, wins: {}, stakedKobo: 0, last: m.settledAt };
    row.matches += 1;
    row.stakedKobo += kobo(m.stakeKobo) * 2;
    for (const x of m.players) if (x.outcome === 'win') row.wins[x.userId] = (row.wins[x.userId] ?? 0) + 1;
    pairs.set(key, row);
    const loser = m.players.find((x) => x.outcome === 'loss');
    const winner = m.players.find((x) => x.outcome === 'win');
    // Lost without trading, or with only a token position.
    const token = (x) => (x.report?.metrics?.trades ?? 0) === 0 || x.report?.metrics?.engaged === false || (x.report?.metrics?.maxSizePct ?? 0) < 10;
    if (loser && winner && token(loser)) {
      const k = `${loser.userId}>${winner.userId}`;
      const o = oneSided.get(k) ?? { loserId: loser.userId, winnerId: winner.userId, matches: 0, passedKobo: 0, last: m.settledAt };
      o.matches += 1;
      o.passedKobo += kobo(m.stakeKobo);
      oneSided.set(k, o);
    }
  }
  const repeated = [...pairs.values()].filter((r) => r.matches >= 3).sort((a, b) => b.matches - a.matches).slice(0, 30);
  const dumping = [...oneSided.values()].filter((o) => o.matches >= 2).sort((a, b) => b.matches - a.matches).slice(0, 30);

  // Money in and straight back out, with little or no play in between.
  const withdrawals = await prisma.withdrawal.findMany({ where: { createdAt: { gte: since }, status: { notIn: ['cancelled', 'rejected'] } }, select: { id: true, userId: true, amountKobo: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  const cashOut = [];
  for (const w of withdrawals) {
    if (!w.userId) continue;
    const dep = await prisma.deposit.findFirst({ where: { userId: w.userId, status: 'succeeded', createdAt: { lte: w.createdAt, gte: new Date(w.createdAt.getTime() - DAY) } }, orderBy: { createdAt: 'desc' }, select: { amountKobo: true, createdAt: true } });
    if (!dep) continue;
    const played = await prisma.gamePlayer.count({ where: { userId: w.userId, match: { mode: 'duel', createdAt: { gte: dep.createdAt, lte: w.createdAt } } } });
    if (played <= 1) cashOut.push({ userId: w.userId, withdrawalId: w.id, status: w.status, withdrawnKobo: kobo(w.amountKobo), depositedKobo: kobo(dep.amountKobo), hours: Math.round(((w.createdAt - dep.createdAt) / 3600e3) * 10) / 10, matchesBetween: played, at: w.createdAt });
  }

  const people = await peopleFor([...repeated.flatMap((r) => r.users), ...dumping.flatMap((d) => [d.loserId, d.winnerId]), ...cashOut.map((c) => c.userId)]);
  const who = (id) => personOf(people.get(id)) ?? { id, name: 'Deleted account' };
  return {
    days,
    repeatedPairs: repeated.map((r) => ({ players: r.users.map((id) => ({ ...who(id), wins: r.wins[id] ?? 0 })), matches: r.matches, stakedKobo: r.stakedKobo, last: r.last })),
    oneSidedLosses: dumping.map((d) => ({ loser: who(d.loserId), winner: who(d.winnerId), matches: d.matches, passedKobo: d.passedKobo, last: d.last })),
    quickCashOuts: cashOut.slice(0, 30).map((c) => ({ ...c, person: who(c.userId) })),
  };
}
