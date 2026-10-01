import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { computeScores, computeAnalytics, generatePsychologyInsights } from '../lib/traderMetrics.js';
import { announcementsFor } from './adminAnnouncements.js';

export const meStatsRouter = Router();
meStatsRouter.use(requireAuth);

const DAY_MS = 24 * 60 * 60 * 1000;
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);

async function getUserContext(userId) {
  const [allEntries, settings] = await Promise.all([
    prisma.journalEntry.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
    prisma.userSettings.findUnique({ where: { userId } }),
  ]);
  const entries = allEntries.filter((e) => e.positionStatus !== 'open');
  const openPositions = allEntries.filter((e) => e.positionStatus === 'open');
  const defaultRisk = settings?.tradingPreferences?.defaultRisk ?? 1;
  const dailyLossLimit = settings?.tradingPreferences?.dailyLossLimit ?? 2;
  const notify = { checklist: true, journal: true, riskWarnings: true, ...(settings?.notifications ?? {}) };
  return { entries, openPositions, defaultRisk, dailyLossLimit, notify };
}

meStatsRouter.get('/analytics', asyncHandler(async (req, res) => {
  const { entries, defaultRisk } = await getUserContext(req.userId);
  const analytics = computeAnalytics(entries, defaultRisk);
  const insights = generatePsychologyInsights(entries);
  res.json({ ...analytics, insights });
}));

meStatsRouter.get('/dashboard', asyncHandler(async (req, res) => {
  const { entries, openPositions, dailyLossLimit } = await getUserContext(req.userId);
  const { scores } = computeScores(entries);
  const disciplineScore = scores.find((s) => s.label === 'Discipline')?.value ?? 0;

  const today = todayStr();
  const todayEntries = entries.filter((e) => e.date === today);
  const riskUsedToday = todayEntries.filter((e) => e.result === 'loss').reduce((s, e) => s + e.risk, 0);

  const uniqueDays = [...new Set(entries.map((e) => e.date))].sort().reverse();
  let streak = 0;
  for (const day of uniqueDays) {
    const dayEntries = entries.filter((e) => e.date === day);
    const dayLossRisk = dayEntries.filter((e) => e.result === 'loss').reduce((s, e) => s + e.risk, 0);
    if (dayLossRisk <= dailyLossLimit) streak += 1;
    else break;
  }

  const last7 = daysAgoStr(6);
  const weeklyByDay = {};
  for (let i = 6; i >= 0; i--) {
    const d = daysAgoStr(i);
    const label = new Date(d).toLocaleDateString(undefined, { weekday: 'short' });
    weeklyByDay[d] = { day: label, pnl: 0 };
  }
  for (const e of entries) {
    if (e.date >= last7 && weeklyByDay[e.date]) weeklyByDay[e.date].pnl += e.pnl ?? 0;
  }
  const weeklyPerformance = Object.values(weeklyByDay);

  const recentTrades = [...entries]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .map((e) => ({ id: e.id, symbol: e.market, direction: e.direction, result: e.result, rr: e.reward, pnl: e.pnl, date: e.date, session: e.session }));

  const openPositionsView = openPositions
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((e) => ({
      id: e.id,
      symbol: e.market,
      direction: e.direction,
      entry: e.entry,
      stopLoss: e.stopLoss,
      takeProfit: e.takeProfit,
      risk: e.risk,
      date: e.date,
      session: e.session,
    }));

  const insights = generatePsychologyInsights(entries);

  const weekEntries = entries.filter((e) => e.date >= last7);
  const weekChecklistRate = weekEntries.length
    ? Math.round((weekEntries.filter((e) => e.checklistComplete).length / weekEntries.length) * 100)
    : 0;
  const daysThisWeek = [...new Set(weekEntries.map((e) => e.date))];
  const daysWithinLimit = daysThisWeek.filter((d) => {
    const dayLoss = weekEntries.filter((e) => e.date === d && e.result === 'loss').reduce((s, e) => s + e.risk, 0);
    return dayLoss <= dailyLossLimit;
  }).length;
  const withinLimitRate = daysThisWeek.length ? Math.round((daysWithinLimit / daysThisWeek.length) * 100) : 100;

  const weeklyGoals = [
    { id: 'g1', label: 'Complete pre-trade checklist on every entry', progress: weekChecklistRate },
    { id: 'g2', label: `Keep daily losses under ${dailyLossLimit}R`, progress: withinLimitRate },
  ];

  res.json({
    disciplineScore,
    riskUsedToday,
    dailyLossLimit,
    streak,
    weeklyPerformance,
    recentTrades,
    openPositions: openPositionsView,
    hasJournaledToday: todayEntries.length > 0,
    insights,
    weeklyGoals,
    totalEntries: entries.length,
  });
}));

meStatsRouter.get('/notifications', asyncHandler(async (req, res) => {
  const { entries, dailyLossLimit, notify } = await getUserContext(req.userId);
  const today = todayStr();
  const checklist = await prisma.checklistDay.findUnique({ where: { userId_date: { userId: req.userId, date: today } } });
  const items = checklist?.items ?? {};
  const checklistTotal = 8;
  const checklistDone = Object.values(items).filter(Boolean).length;

  const todayEntries = entries.filter((e) => e.date === today);
  const riskUsedToday = todayEntries.filter((e) => e.result === 'loss').reduce((s, e) => s + e.risk, 0);

  const notifications = [];
  const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } });
  for (const a of await announcementsFor(me?.role ?? 'trader', { sinceDays: 14 })) {
    notifications.push({
      id: `a-${a.id}`,
      type: 'announcement',
      title: a.title,
      body: a.body ?? '',
      time: a.publishedAt.toISOString(),
    });
  }
  if (notify.checklist && checklistDone < checklistTotal) {
    notifications.push({
      id: 'n-checklist',
      type: 'checklist',
      title: 'Checklist reminder',
      body: `You have completed ${checklistDone} of ${checklistTotal} items on today's pre-trade checklist.`,
      time: 'Today',
    });
  }
  if (notify.riskWarnings && riskUsedToday >= dailyLossLimit * 0.75 && riskUsedToday < dailyLossLimit) {
    notifications.push({
      id: 'n-risk-warning',
      type: 'risk',
      title: 'Risk warning',
      body: `You are approaching your daily loss limit (${riskUsedToday.toFixed(1)}R used of ${dailyLossLimit}R).`,
      time: 'Today',
    });
  }
  if (notify.riskWarnings && riskUsedToday >= dailyLossLimit) {
    notifications.push({
      id: 'n-risk-breach',
      type: 'risk',
      title: 'Daily loss limit reached',
      body: `You have used ${riskUsedToday.toFixed(1)}R of your ${dailyLossLimit}R daily limit. Consider stepping away.`,
      time: 'Today',
    });
  }
  if (notify.journal && todayEntries.length === 0) {
    notifications.push({
      id: 'n-journal',
      type: 'journal',
      title: 'Journal reminder',
      body: "You haven't logged a journal entry yet today.",
      time: 'Today',
    });
  }

  res.json({ notifications });
}));

meStatsRouter.get('/announcements', asyncHandler(async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } });
  res.json({ announcements: await announcementsFor(me?.role ?? 'trader', { sinceDays: 14 }) });
}));

// "Get started" on the Dashboard: the first things worth doing, each ticked
// from what the trader has actually done.
meStatsRouter.get('/getting-started', asyncHandler(async (req, res) => {
  const id = req.userId;
  const [u, journal, checklist, ai, practice] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { emailVerifiedAt: true, username: true, avatarId: true, mfaEnabledAt: true, kyc: { select: { status: true } } } }),
    prisma.journalEntry.count({ where: { userId: id }, take: 1 }),
    prisma.checklistDay.count({ where: { userId: id }, take: 1 }),
    prisma.aIConversation.count({ where: { userId: id, messages: { some: { role: 'user' } } }, take: 1 }),
    prisma.gamePlayer.count({ where: { userId: id, match: { mode: 'practice' } }, take: 1 }),
  ]);
  const steps = [
    { key: 'email', label: 'Confirm your email', done: !!u?.emailVerifiedAt, to: '/app/settings?section=profile' },
    { key: 'identity', label: 'Verify your identity', done: ['approved', 'pending'].includes(u?.kyc?.status), to: '/verify' },
    { key: 'profile', label: 'Pick a Community name', done: !!u?.username, to: '/app/community' },
    { key: 'journal', label: 'Log a trade in your journal', done: journal > 0, to: '/app/journal' },
    { key: 'checklist', label: 'Run the pre-trade checklist', done: checklist > 0, to: '/app/checklist' },
    { key: 'ai', label: 'Ask Kotka AI to challenge an idea', done: ai > 0, to: '/app/ai' },
    { key: 'practice', label: 'Play a free practice match', done: practice > 0, to: '/app/game' },
    { key: 'twoStep', label: 'Turn on two-step verification', done: !!u?.mfaEnabledAt, to: '/app/settings?section=security' },
  ];
  res.json({ steps, done: steps.filter((s) => s.done).length });
}));
