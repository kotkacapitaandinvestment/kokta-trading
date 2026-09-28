// Goal Room engine: goal progress, check-in streaks, badges, levels, monthly
// stats and the achievements they earn. Everything is computed from the
// trader's own check-ins, goals and journal, so every result is
// self-reported: nothing here claims broker verification.
//
// Streak rule: a streak counts consecutive trading days (Mon-Fri) with a
// check-in. Weekends never break a streak, and a weekend check-in adds to it.

import { prisma } from '../prisma.js';

// ── dates (YYYY-MM-DD strings, calendar arithmetic in UTC) ─────────────────
const DAY = 86400e3;
export const utcToday = () => new Date().toISOString().slice(0, 10);
export const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const isWeekend = (d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
export const monthOf = (d) => d.slice(0, 7);
export const monthLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// The trader's local date, trusted only within a day of UTC (time zones).
export function localDate(input) {
  const s = typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
  const today = utcToday();
  return s && Math.abs(daysBetween(today, s)) <= 1 ? s : today;
}

// ── catalogue ──────────────────────────────────────────────────────────────
export const METRICS = {
  checkins: { label: 'Consistency goal', noun: 'consistency', unit: 'check-ins', describe: (t) => `Check in on ${t} days` },
  disciplined_days: { label: 'Discipline goal', noun: 'discipline', unit: 'disciplined days', describe: (t) => `${t} days following your plan and risk rules` },
  streak: { label: 'Streak goal', noun: 'streak', unit: 'days', describe: (t) => `Reach a ${t}-day check-in streak` },
  learning: { label: 'Learning goal', noun: 'learning', unit: 'learning activities', describe: (t) => `${t} learning activities` },
  backtests: { label: 'Backtesting goal', noun: 'backtesting', unit: 'backtesting sessions', describe: (t) => `${t} backtesting sessions` },
  journal_trades: { label: 'Journaling goal', noun: 'journaling', unit: 'journaled trades', describe: (t) => `Journal ${t} trades` },
  net_profit: { label: 'Profit goal', noun: 'profit', unit: 'net profit', describe: (t) => `Net profit of ${t}`, sensitive: true },
};
export const PERIODS = [7, 14, 30, 60, 90];

export const BADGES = {
  consistency_builder: { name: 'Consistency Builder', icon: 'flame', rule: 'Checked in on 7 trading days in a row.' },
  two_week_discipline: { name: 'Two-Week Discipline', icon: 'shield', rule: 'Followed your plan and risk rules on 14 check-ins in a row.' },
  risk_guardian: { name: 'Risk Guardian', icon: 'shield', rule: 'Respected your risk and avoided revenge trading on 15 traded days in a row, with no day past your daily loss limit in your journal.' },
  market_student: { name: 'Market Student', icon: 'book', rule: 'Logged 25 learning activities.' },
  goal_achiever: { name: 'Goal Achiever', icon: 'trophy', rule: 'Reached a goal you had locked.' },
};

const STREAKS = [3, 7, 14, 30, 60, 90];
const DISCIPLINE_STREAKS = [7, 14, 30, 60];
const CHECKIN_TOTALS = [10, 25, 50, 100, 250];
const LEARNING_TOTALS = [10, 25, 50, 100];
const BACKTEST_TOTALS = [5, 10, 25, 50];

export const LEVELS = [
  { n: 1, name: 'Foundation', needs: 'Your first check-ins.' },
  { n: 2, name: 'Committed', needs: '10 check-ins.' },
  { n: 3, name: 'Consistent', needs: '30 check-ins and a 7-day streak.' },
  { n: 4, name: 'Disciplined', needs: '60 check-ins, a completed goal and 80% discipline over your last 60 check-ins.' },
  { n: 5, name: 'Professional', needs: '120 check-ins, 3 completed goals, a 30-day streak and 85% discipline.' },
];

export const isDisciplined = (c) => !c.traded || (c.planFollowed === true && c.riskRespected === true && c.noRevengeTrading === true);

// ── context ────────────────────────────────────────────────────────────────
export async function loadContext(userId) {
  const [checkins, goals, journal, settings, achievements] = await Promise.all([
    prisma.goalCheckIn.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
    prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.journalEntry.findMany({ where: { userId }, select: { date: true, result: true, risk: true, pnl: true, positionStatus: true } }),
    prisma.userSettings.findUnique({ where: { userId }, select: { tradingPreferences: true, goalRoomPreferences: true } }),
    prisma.achievement.findMany({ where: { userId }, orderBy: { earnedAt: 'desc' } }),
  ]);
  const byDate = new Map(checkins.map((c) => [c.date, c]));
  const dailyLossLimit = settings?.tradingPreferences?.dailyLossLimit ?? 2;
  const lossByDate = new Map();
  for (const e of journal) if (e.result === 'loss') lossByDate.set(e.date, (lossByDate.get(e.date) ?? 0) + (e.risk ?? 0));
  return { userId, checkins, byDate, goals, journal, dailyLossLimit, lossByDate, achievements, prefs: goalRoomPrefs(settings?.goalRoomPreferences), baseCurrency: settings?.tradingPreferences?.baseCurrency ?? 'USD' };
}

export function goalRoomPrefs(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  // Posting to Community is always the trader's choice; the profile
  // showcase holds no trading figures, so it starts on.
  return { autoPost: r.autoPost === true, showOnProfile: r.showOnProfile !== false };
}

// Run of qualifying days ending at `anchor`, walking back.
export function runEndingAt(byDate, anchor, qualifies = () => true) {
  let length = 0;
  let start = null;
  for (let d = anchor, i = 0; i < 3660; i++, d = addDays(d, -1)) {
    const c = byDate.get(d);
    if (c && qualifies(c)) {
      length += 1;
      start = d;
    } else if (c || !isWeekend(d)) break;
  }
  return { length, start };
}

// Current streak: counted to today if checked in today, else to yesterday
// (today isn't over yet).
function currentRun(byDate, today, qualifies) {
  const anchor = byDate.has(today) ? today : addDays(today, -1);
  return runEndingAt(byDate, anchor, qualifies);
}

// One pass over history: longest runs, and the date each milestone was hit.
function history(ctx) {
  const events = [];
  const { checkins, byDate } = ctx;
  const out = { longest: 0, longestDiscipline: 0, events };
  if (!checkins.length) return out;
  let run = 0;
  let runStart = null;
  let drun = 0;
  let drunStart = null;
  let total = 0;
  let learning = 0;
  let backtests = 0;
  let guard = 0;
  let badgeRisk = false;
  let badgeBuilder = false;
  let badgeDiscipline = false;
  let badgeStudent = false;
  const last = checkins.at(-1).date;
  for (let d = checkins[0].date; d <= last; d = addDays(d, 1)) {
    const c = byDate.get(d);
    const weekend = isWeekend(d);
    if (c) {
      if (!run) runStart = d;
      run += 1;
      if (STREAKS.includes(run)) events.push({ type: 'streak', n: run, start: runStart, date: d });
      if (run === 7 && !badgeBuilder) (badgeBuilder = true), events.push({ type: 'badge', badge: 'consistency_builder', date: d });
    } else if (!weekend) run = 0;
    out.longest = Math.max(out.longest, run);

    if (c && isDisciplined(c)) {
      if (!drun) drunStart = d;
      drun += 1;
      if (DISCIPLINE_STREAKS.includes(drun)) events.push({ type: 'discipline_streak', n: drun, start: drunStart, date: d });
      if (drun === 14 && !badgeDiscipline) (badgeDiscipline = true), events.push({ type: 'badge', badge: 'two_week_discipline', date: d });
    } else if (c || !weekend) drun = 0;
    out.longestDiscipline = Math.max(out.longestDiscipline, drun);

    if (!c) continue;
    total += 1;
    if (CHECKIN_TOTALS.includes(total)) events.push({ type: 'checkins', n: total, date: d });
    const [l0, b0] = [learning, backtests];
    learning += c.learning;
    backtests += c.backtests;
    for (const m of LEARNING_TOTALS) if (l0 < m && learning >= m) events.push({ type: 'learning', n: m, date: d });
    for (const m of BACKTEST_TOTALS) if (b0 < m && backtests >= m) events.push({ type: 'backtests', n: m, date: d });
    if (learning >= 25 && !badgeStudent) (badgeStudent = true), events.push({ type: 'badge', badge: 'market_student', date: d });
    if (c.traded) {
      const ok = c.riskRespected === true && c.noRevengeTrading === true && (ctx.lossByDate.get(d) ?? 0) <= ctx.dailyLossLimit;
      guard = ok ? guard + 1 : 0;
      if (guard === 15 && !badgeRisk) (badgeRisk = true), events.push({ type: 'badge', badge: 'risk_guardian', date: d });
    }
  }
  return out;
}

function adherence(list) {
  return list.length ? Math.round((list.filter(isDisciplined).length / list.length) * 100) : null;
}

export function levelFor({ checkins, longestStreak, goalsCompleted, adherenceRecent }) {
  let n = 1;
  if (checkins >= 10) n = 2;
  if (checkins >= 30 && longestStreak >= 7) n = 3;
  if (n >= 3 && checkins >= 60 && goalsCompleted >= 1 && (adherenceRecent ?? 0) >= 80) n = 4;
  if (n >= 4 && checkins >= 120 && goalsCompleted >= 3 && longestStreak >= 30 && (adherenceRecent ?? 0) >= 85) n = 5;
  return { ...LEVELS[n - 1], next: LEVELS[n] ?? null };
}

// ── goals ──────────────────────────────────────────────────────────────────
function inRange(d, from, to) {
  return d >= from && d <= to;
}

export function goalProgress(goal, ctx, today) {
  const end = goal.endDate < today ? goal.endDate : today;
  const cis = ctx.checkins.filter((c) => inRange(c.date, goal.startDate, end));
  const trades = ctx.journal.filter((e) => inRange(e.date, goal.startDate, end));
  let value = 0;
  switch (goal.metric) {
    case 'checkins':
      value = cis.length;
      break;
    case 'disciplined_days':
      value = cis.filter(isDisciplined).length;
      break;
    case 'streak': {
      const sub = new Map(cis.map((c) => [c.date, c]));
      for (const c of cis) value = Math.max(value, runEndingAt(sub, c.date).length);
      break;
    }
    case 'learning':
      value = cis.reduce((s, c) => s + c.learning, 0);
      break;
    case 'backtests':
      value = cis.reduce((s, c) => s + c.backtests, 0);
      break;
    case 'journal_trades':
      value = trades.length;
      break;
    case 'net_profit':
      value = Math.round(trades.filter((e) => e.positionStatus !== 'open').reduce((s, e) => s + (e.pnl ?? 0), 0) * 100) / 100;
      break;
    default:
      value = 0;
  }
  const pct = goal.target > 0 ? Math.max(0, Math.min(100, Math.round((value / goal.target) * 100))) : 0;
  const started = today >= goal.startDate;
  return {
    value,
    pct,
    reached: value >= goal.target,
    daysTotal: goal.periodDays,
    daysElapsed: started ? Math.min(goal.periodDays, daysBetween(goal.startDate, end) + 1) : 0,
    daysLeft: Math.max(0, daysBetween(today, goal.endDate) + (today <= goal.endDate ? 1 : 0)),
    adherence: adherence(cis),
    checkins: cis.length,
    trades: trades.length,
    netProfit: Math.round(trades.filter((e) => e.positionStatus !== 'open').reduce((s, e) => s + (e.pnl ?? 0), 0) * 100) / 100,
    avgRisk: trades.length ? Math.round((trades.reduce((s, e) => s + (e.risk ?? 0), 0) / trades.length) * 100) / 100 : null,
  };
}

// ── stats ──────────────────────────────────────────────────────────────────
export function computeStats(ctx, today) {
  const h = history(ctx);
  const cur = currentRun(ctx.byDate, today);
  const dcur = currentRun(ctx.byDate, today, isDisciplined);
  const recent30 = ctx.checkins.filter((c) => c.date > addDays(today, -30));
  const last60 = ctx.checkins.slice(-60);
  const goalsCompleted = ctx.goals.filter((g) => g.status === 'completed').length;
  const badges = ctx.achievements.filter((a) => a.type === 'badge').map((a) => a.data?.badge).filter(Boolean);
  const stats = {
    today,
    checkedInToday: ctx.byDate.has(today),
    totalCheckins: ctx.checkins.length,
    currentStreak: cur.length,
    currentStreakStart: cur.start,
    disciplineStreak: dcur.length,
    longestStreak: h.longest,
    longestDisciplineStreak: h.longestDiscipline,
    learning: ctx.checkins.reduce((s, c) => s + c.learning, 0),
    backtests: ctx.checkins.reduce((s, c) => s + c.backtests, 0),
    adherence30: adherence(recent30),
    checkins30: recent30.length,
    goalsCompleted,
    goalsReached: ctx.goals.filter((g) => ['achieved', 'completed'].includes(g.status)).length,
    badges: [...new Set(badges)],
    monthlyAchievements: ctx.achievements.filter((a) => ['monthly_champion', 'most_improved'].includes(a.type)).length,
  };
  stats.level = levelFor({ checkins: stats.totalCheckins, longestStreak: stats.longestStreak, goalsCompleted, adherenceRecent: adherence(last60) });
  return { stats, history: h };
}

export function monthStats(ctx, month, today = utcToday()) {
  const inMonth = (d) => d && d.slice(0, 7) === month;
  const cis = ctx.checkins.filter((c) => inMonth(c.date));
  const sub = new Map(cis.map((c) => [c.date, c]));
  let longest = 0;
  for (const c of cis) longest = Math.max(longest, runEndingAt(sub, c.date).length);
  const trades = ctx.journal.filter((e) => inMonth(e.date));
  return {
    month,
    label: monthLabel(month),
    inProgress: monthOf(today) === month,
    checkins: cis.length,
    disciplinedDays: cis.filter(isDisciplined).length,
    adherence: adherence(cis),
    longestStreak: longest,
    learning: cis.reduce((s, c) => s + c.learning, 0),
    backtests: cis.reduce((s, c) => s + c.backtests, 0),
    goalsCompleted: ctx.goals.filter((g) => g.status === 'completed' && g.closedAt && inMonth(g.closedAt.toISOString())).length,
    goalsReached: ctx.goals.filter((g) => g.achievedAt && inMonth(g.achievedAt.toISOString())).length,
    badgesEarned: ctx.achievements.filter((a) => a.type === 'badge' && inMonth(a.earnedAt.toISOString())).map((a) => a.data?.badge).filter(Boolean),
    trades: trades.length,
    netProfit: Math.round(trades.filter((e) => e.positionStatus !== 'open').reduce((s, e) => s + (e.pnl ?? 0), 0) * 100) / 100,
  };
}

export function monthStatus(m) {
  if (m.goalsCompleted > 0) return 'GOALS COMPLETED';
  if (m.checkins >= 15 && (m.adherence ?? 0) >= 90) return 'CONSISTENCY CHAMPION';
  if (m.checkins >= 10) return 'CONSISTENT MONTH';
  return m.inProgress ? 'IN PROGRESS' : 'MONTH LOGGED';
}

// ── achievements ───────────────────────────────────────────────────────────
const at = (d) => new Date(`${d}T12:00:00Z`);

function titleFor(e) {
  switch (e.type) {
    case 'streak':
      return `${e.n}-Day Consistency Streak`;
    case 'discipline_streak':
      return `${e.n}-Day Discipline Streak`;
    case 'checkins':
      return `${e.n} Daily Check-ins`;
    case 'learning':
      return `${e.n} Learning Activities`;
    case 'backtests':
      return `${e.n} Backtesting Sessions`;
    case 'badge':
      return BADGES[e.badge].name;
    default:
      return e.title;
  }
}

function keyFor(e) {
  switch (e.type) {
    case 'streak':
    case 'discipline_streak':
      return `${e.type}:${e.n}:${e.start}`;
    case 'badge':
      return `badge:${e.badge}`;
    default:
      return `${e.type}:${e.n}`;
  }
}

// Facts frozen into an achievement when it is earned.
function snapshot(stats, extra = {}) {
  return {
    streak: stats.currentStreak,
    disciplineStreak: stats.disciplineStreak,
    checkins: stats.totalCheckins,
    learning: stats.learning,
    backtests: stats.backtests,
    adherence: stats.adherence30,
    level: { n: stats.level.n, name: stats.level.name },
    badges: stats.badges,
    ...extra,
  };
}

export function goalFacts(goal, progress) {
  return { goal: { id: goal.id, title: goal.title, metric: goal.metric, target: goal.target, periodDays: goal.periodDays, startDate: goal.startDate, endDate: goal.endDate }, progress };
}

// Syncs goal statuses and awards everything earned so far. Idempotent: each
// achievement has a unique key. Returns achievements created by this call.
export async function evaluate(userId, today = utcToday(), { ctx: given } = {}) {
  const ctx = given ?? (await loadContext(userId));
  const candidates = [];

  // Goals: reached during the period, then completed or missed after it.
  for (const g of ctx.goals) {
    if (!['active', 'achieved'].includes(g.status)) continue;
    const p = goalProgress(g, ctx, today);
    const data = {};
    if (g.status === 'active' && p.reached) {
      Object.assign(data, { status: 'achieved', achievedAt: new Date() });
      g.status = 'achieved';
      g.achievedAt = data.achievedAt;
    }
    if (g.endDate < today) {
      Object.assign(data, { status: p.reached ? 'completed' : 'missed', closedAt: new Date() });
      g.status = data.status;
      g.closedAt = data.closedAt;
    }
    if (Object.keys(data).length) await prisma.goal.update({ where: { id: g.id }, data });
  }

  const { stats, history: h } = computeStats(ctx, today);
  for (const g of ctx.goals) {
    const p = goalProgress(g, ctx, today);
    if (g.achievedAt) candidates.push({ type: 'goal_reached', key: `goal:${g.id}:reached`, goalId: g.id, title: 'Goal Reached', earnedAt: g.achievedAt, data: snapshot(stats, goalFacts(g, p)) });
    if (g.status === 'completed') candidates.push({ type: 'goal_completed', key: `goal:${g.id}:completed`, goalId: g.id, title: 'Goal Achieved', earnedAt: g.closedAt ?? new Date(), data: snapshot(stats, goalFacts(g, p)) });
  }
  const firstReached = ctx.goals.filter((g) => g.achievedAt).sort((a, b) => a.achievedAt - b.achievedAt)[0];
  if (firstReached) candidates.push({ type: 'badge', key: 'badge:goal_achiever', goalId: firstReached.id, title: BADGES.goal_achiever.name, earnedAt: firstReached.achievedAt, data: snapshot(stats, { badge: 'goal_achiever' }) });

  for (const e of h.events) {
    const extra = e.type === 'badge' ? { badge: e.badge } : { milestone: e.n };
    if (e.type === 'streak') extra.streak = e.n;
    candidates.push({ type: e.type, key: keyFor(e), title: titleFor(e), earnedAt: at(e.date), data: snapshot(stats, extra) });
  }

  const have = new Set(ctx.achievements.map((a) => a.key));
  const fresh = candidates.filter((c) => !have.has(c.key));
  if (!fresh.length) return { stats, created: [], ctx };
  await prisma.achievement.createMany({ data: fresh.map((c) => ({ userId, ...c })), skipDuplicates: true });
  const created = await prisma.achievement.findMany({ where: { userId, key: { in: fresh.map((c) => c.key) } } });
  ctx.achievements = [...created, ...ctx.achievements];
  // Badges earned just now count in the stats.
  const { stats: after } = computeStats(ctx, today);
  return { stats: after, created, ctx };
}

// Monthly review and recognitions for a finished month. Threshold-based:
// everyone who meets the bar is recognised; nobody is ranked by money.
export async function monthlyRecognition(userId, month) {
  const ctx = await loadContext(userId);
  const m = monthStats(ctx, month);
  if (!m.checkins) return [];
  const prevMonth = addDays(`${month}-01`, -1).slice(0, 7);
  const prev = monthStats(ctx, prevMonth);
  const earnedAt = new Date(`${addDays(`${month}-28`, 7).slice(0, 7)}-01T08:00:00Z`);
  const facts = { month, label: m.label, stats: m };
  const rows = [{ type: 'monthly_review', key: `monthly:${month}`, title: `${m.label} Review`, earnedAt, data: facts }];
  if (m.checkins >= 15 && (m.adherence ?? 0) >= 90) rows.push({ type: 'monthly_champion', key: `champion:${month}`, title: `Consistency Champion, ${m.label}`, earnedAt, data: facts });
  if (m.checkins >= 10 && prev.checkins >= 10 && (m.adherence ?? 0) - (prev.adherence ?? 0) >= 15) rows.push({ type: 'most_improved', key: `improved:${month}`, title: `Most Improved, ${m.label}`, earnedAt, data: { ...facts, from: prev.adherence, to: m.adherence } });
  const have = new Set(ctx.achievements.map((a) => a.key));
  const fresh = rows.filter((r) => !have.has(r.key));
  if (!fresh.length) return [];
  await prisma.achievement.createMany({ data: fresh.map((r) => ({ userId, ...r })), skipDuplicates: true });
  return prisma.achievement.findMany({ where: { userId, key: { in: fresh.map((r) => r.key) } } });
}
