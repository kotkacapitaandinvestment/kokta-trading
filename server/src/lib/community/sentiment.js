// Community sentiment per instrument: each trader's current view, counted
// only if shared or re-confirmed in the last 7 days. Never a trading signal.
import { prisma } from '../prisma.js';

export const SENTIMENT_WINDOW_DAYS = 7;
const since = () => new Date(Date.now() - SENTIMENT_WINDOW_DAYS * 86400e3);

export async function sentimentFor(symbols) {
  const list = Array.isArray(symbols) ? symbols : [symbols];
  const rows = await prisma.sentimentVote.groupBy({ by: ['instrument', 'stance'], where: { instrument: { in: list }, updatedAt: { gte: since() } }, _count: { _all: true } });
  const out = new Map(list.map((s) => [s, { bullish: 0, neutral: 0, bearish: 0, total: 0 }]));
  for (const r of rows) {
    const e = out.get(r.instrument);
    e[r.stance] = r._count._all;
    e.total += r._count._all;
  }
  for (const e of out.values()) {
    for (const k of ['bullish', 'neutral', 'bearish']) e[`${k}Pct`] = e.total ? Math.round((e[k] / e.total) * 100) : null;
  }
  return Array.isArray(symbols) ? out : out.get(symbols);
}

export async function snapshotSentiment(symbol) {
  const bucket = new Date();
  bucket.setUTCMinutes(0, 0, 0);
  const s = await sentimentFor(symbol);
  if (!s.total) return null;
  return prisma.sentimentSnapshot.upsert({
    where: { instrument_bucket: { instrument: symbol, bucket } },
    update: { bullish: s.bullish, neutral: s.neutral, bearish: s.bearish },
    create: { instrument: symbol, bucket, bullish: s.bullish, neutral: s.neutral, bearish: s.bearish },
  });
}

export async function sentimentHistory(symbol, days = 7) {
  const rows = await prisma.sentimentSnapshot.findMany({ where: { instrument: symbol, bucket: { gte: new Date(Date.now() - days * 86400e3) } }, orderBy: { bucket: 'asc' } });
  return rows.map((r) => {
    const total = r.bullish + r.neutral + r.bearish;
    return { at: r.bucket, total, bullishPct: total ? Math.round((r.bullish / total) * 100) : null, neutralPct: total ? Math.round((r.neutral / total) * 100) : null, bearishPct: total ? Math.round((r.bearish / total) * 100) : null };
  });
}

// Hourly job: one snapshot per instrument that has any current views.
export async function snapshotAllSentiment() {
  const symbols = await prisma.sentimentVote.findMany({ where: { updatedAt: { gte: since() } }, distinct: ['instrument'], select: { instrument: true } });
  for (const s of symbols) await snapshotSentiment(s.instrument);
  return symbols.length;
}
