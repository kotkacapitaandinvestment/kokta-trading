import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const adminStatsRouter = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);
const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

adminStatsRouter.get('/ai-usage', asyncHandler(async (req, res) => {
  const since30d = daysAgo(30);
  const todayStart = startOfDay();

  const [logs30d, requestsToday] = await Promise.all([
    prisma.aIUsageLog.findMany({ where: { createdAt: { gte: since30d } } }),
    prisma.aIUsageLog.count({ where: { createdAt: { gte: todayStart } } }),
  ]);

  const totalRequests = logs30d.length;
  const avgLatencyMs = totalRequests ? Math.round(logs30d.reduce((s, l) => s + l.latencyMs, 0) / totalRequests) : 0;
  const liveCount = logs30d.filter((l) => l.source === 'nvidia').length;

  const byModel = {};
  for (const l of logs30d) {
    const key = `${l.source === 'nvidia' ? l.model : 'Scripted mentor (fallback)'}`;
    if (!byModel[key]) byModel[key] = { model: key, requests: 0, totalLatency: 0 };
    byModel[key].requests += 1;
    byModel[key].totalLatency += l.latencyMs;
  }
  const models = Object.values(byModel)
    .map((m) => ({ model: m.model, requests: m.requests, avgLatencyMs: Math.round(m.totalLatency / m.requests) }))
    .sort((a, b) => b.requests - a.requests);

  res.json({
    totalRequests30d: totalRequests,
    requestsToday,
    avgLatencyMs,
    liveSharePct: totalRequests ? Math.round((liveCount / totalRequests) * 100) : 0,
    models,
  });
}));

adminStatsRouter.get('/simulator', asyncHandler(async (req, res) => {
  const since30d = daysAgo(30);
  const sessions = await prisma.simulatorSession.findMany({ where: { createdAt: { gte: since30d } } });
  const trades = await prisma.simulatorTrade.findMany({
    where: { session: { createdAt: { gte: since30d } } },
    include: { session: { select: { symbol: true } } },
  });

  const sessions30d = sessions.length;
  const completedSessions30d = sessions.filter((s) => s.status === 'completed').length;
  const closedTrades = trades.filter((t) => t.status === 'closed');
  const totalTrades30d = closedTrades.length;

  const wins = closedTrades.filter((t) => t.result === 'win').length;
  const avgWinRate = totalTrades30d ? Math.round((wins / totalTrades30d) * 100) : 0;

  const withStop = closedTrades.filter((t) => t.stopLoss != null);
  const avgExpectancyR = withStop.length
    ? Math.round(
        (withStop.reduce((s, t) => s + t.pnl / (Math.abs(t.entryPrice - t.stopLoss) * t.size), 0) / withStop.length) * 100,
      ) / 100
    : null;

  const totalSimulatedPnl30d = Math.round(closedTrades.reduce((s, t) => s + t.pnl, 0) * 100) / 100;

  const bySymbol = {};
  for (const s of sessions) {
    if (!bySymbol[s.symbol]) bySymbol[s.symbol] = { symbol: s.symbol, sessions: 0, trades: 0, wins: 0, totalPnl: 0 };
    bySymbol[s.symbol].sessions += 1;
  }
  for (const t of closedTrades) {
    const symbol = t.session.symbol;
    if (!bySymbol[symbol]) bySymbol[symbol] = { symbol, sessions: 0, trades: 0, wins: 0, totalPnl: 0 };
    bySymbol[symbol].trades += 1;
    if (t.result === 'win') bySymbol[symbol].wins += 1;
    bySymbol[symbol].totalPnl += t.pnl;
  }
  const symbolBreakdown = Object.values(bySymbol)
    .map((s) => ({
      symbol: s.symbol,
      sessions: s.sessions,
      trades: s.trades,
      winRate: s.trades ? Math.round((s.wins / s.trades) * 100) : 0,
      avgPnl: s.trades ? Math.round((s.totalPnl / s.trades) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  res.json({
    sessions30d,
    completedSessions30d,
    totalTrades30d,
    avgWinRate,
    avgExpectancyR,
    mostTradedSymbol: symbolBreakdown[0]?.symbol ?? null,
    totalSimulatedPnl30d,
    bySymbol: symbolBreakdown,
  });
}));

adminStatsRouter.get('/trading', asyncHandler(async (req, res) => {
  const since30d = daysAgo(30);
  const entries = await prisma.journalEntry.findMany({ where: { createdAt: { gte: since30d } } });

  const total = entries.length;
  const wins = entries.filter((e) => e.result === 'win').length;
  const winRate = total ? Math.round((wins / total) * 100) : 0;
  const checklistCompleted = entries.filter((e) => e.checklistComplete).length;
  const checklistRate = total ? Math.round((checklistCompleted / total) * 100) : 0;
  const withReward = entries.filter((e) => e.reward);
  const avgRR = withReward.length
    ? Math.round((withReward.reduce((s, e) => s + e.reward, 0) / withReward.length) * 10) / 10
    : null;

  const byMarket = {};
  for (const e of entries) {
    if (!byMarket[e.market]) byMarket[e.market] = { market: e.market, trades: 0, wins: 0 };
    byMarket[e.market].trades += 1;
    if (e.result === 'win') byMarket[e.market].wins += 1;
  }
  const markets = Object.values(byMarket)
    .map((m) => ({ market: m.market, trades: m.trades, winRate: Math.round((m.wins / m.trades) * 100) }))
    .sort((a, b) => b.trades - a.trades);

  res.json({ tradesLogged30d: total, winRate, checklistRate, avgRR, markets });
}));

adminStatsRouter.get('/journal', asyncHandler(async (req, res) => {
  const since30d = daysAgo(30);
  const entries = await prisma.journalEntry.findMany({ where: { createdAt: { gte: since30d } } });

  const total = entries.length;
  const activeUsers = new Set(entries.map((e) => e.userId)).size;
  const entriesPerActiveUser = activeUsers ? Math.round((total / activeUsers) * 10) / 10 : 0;
  const withMistakes = entries.filter((e) => e.mistakes && e.mistakes.trim().length > 0).length;
  const avgConfidence = total ? Math.round((entries.reduce((s, e) => s + e.confidence, 0) / total) * 10) / 10 : 0;

  const byEmotion = {};
  for (const e of entries) {
    if (!e.emotionBefore) continue;
    byEmotion[e.emotionBefore] = (byEmotion[e.emotionBefore] || 0) + 1;
  }
  const emotions = Object.entries(byEmotion)
    .map(([emotion, count]) => ({ emotion, pct: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct);

  res.json({
    entriesLogged30d: total,
    entriesPerActiveUser,
    mistakeLoggedRate: total ? Math.round((withMistakes / total) * 100) : 0,
    avgConfidence,
    emotions,
  });
}));

adminStatsRouter.get('/overview', asyncHandler(async (req, res) => {
  const todayStart = startOfDay();
  const since30d = daysAgo(30);

  const [totalUsers, newSignups30d, dau, mau, aiRequestsToday, journalEntries30d, simulatorSessions30d] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since30d } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: todayStart } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: since30d } } }),
    prisma.aIUsageLog.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.journalEntry.count({ where: { createdAt: { gte: since30d } } }),
    prisma.simulatorSession.count({ where: { createdAt: { gte: since30d } } }),
  ]);

  const dailyActive = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = startOfDay(daysAgo(i));
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const count = await prisma.user.count({ where: { lastLoginAt: { gte: dayStart, lt: dayEnd } } });
    dailyActive.push({ day: dayStart.toISOString().slice(5, 10), dau: count });
  }

  const aiUsageCount30d = await prisma.aIUsageLog.count({ where: { createdAt: { gte: since30d } } });
  const checklistDays30d = await prisma.checklistDay.count({ where: { date: { gte: since30d.toISOString().slice(0, 10) } } });

  res.json({
    totalUsers,
    newSignups30d,
    dau,
    mau,
    aiRequestsToday,
    dailyActive,
    featureUsage: [
      { feature: 'Kotka AI', count: aiUsageCount30d },
      { feature: 'Journal', count: journalEntries30d },
      { feature: 'Checklist', count: checklistDays30d },
      { feature: 'Simulator', count: simulatorSessions30d },
    ].sort((a, b) => b.count - a.count),
  });
}));
