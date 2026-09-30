// Share-card models for Goal Room: what a card can show, which fields are
// sensitive, and the public snapshot for a chosen set of fields.
//
// Privacy rules (Kotka's, not optional):
// - Profit, targets in money, number of trades, risk and personal notes are
//   sensitive: never on a card or public page unless the trader turns them on.
// - A profit goal's own wording can contain amounts, so it is shown by a
//   neutral name ("Monthly Profit Goal") unless the trader chooses otherwise.
// - Everything is labelled self-reported; nothing claims broker verification.

import { prisma } from '../prisma.js';
import { BADGES, METRICS, computeStats, goalProgress, isDisciplined, loadContext, monthLabel, monthStats, monthStatus, runEndingAt } from './engine.js';

export const MOTTO = 'DISCIPLINE OVER RECKLESS RISK';
const IDENTITY_KEYS = ['name', 'username'];

const periodWord = (days) => (days === 7 ? 'Weekly' : days >= 28 && days <= 31 ? 'Monthly' : `${days}-Day`);
export const safeGoalName = (g) => (g.metric === 'net_profit' ? `${periodWord(g.periodDays)} Profit Goal` : g.title);
const money = (v, ccy) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy, signDisplay: 'exceptZero', maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${v > 0 ? '+' : ''}${v} ${ccy}`;
  }
};
const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || null;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// f(key, label, value, { sensitive, on, kind, unit })
const f = (key, label, value, opts = {}) => ({ key, label, value, kind: opts.kind ?? 'stat', unit: opts.unit, sensitive: !!opts.sensitive, on: opts.on ?? !opts.sensitive });

function identityFields(user) {
  // Off unless the person turns them on: a public link shouldn't name you by default.
  return [f('name', 'Your name', user.name, { kind: 'identity', on: false }), ...(user.username ? [f('username', 'Your username', `@${user.username}`, { kind: 'identity', on: false })] : [])];
}

const EYEBROW = {
  goal_created: ['GOAL SET', 'target'],
  goal_locked: ['GOAL LOCKED', 'lock'],
  goal_reached: ['GOAL REACHED', 'trophy'],
  goal_completed: ['GOAL ACHIEVED', 'trophy'],
  streak: ['CONSISTENCY STREAK', 'flame'],
  discipline_streak: ['DISCIPLINE STREAK', 'shield'],
  badge: ['BADGE EARNED', 'medal'],
  checkins: ['CHECK-IN MILESTONE', 'calendar'],
  learning: ['LEARNING MILESTONE', 'book'],
  backtests: ['BACKTESTING MILESTONE', 'history'],
  monthly_review: ['KOTKA MONTHLY REVIEW', 'calendar'],
  monthly_champion: ['MONTHLY RECOGNITION', 'award'],
  most_improved: ['MOST IMPROVED', 'trending'],
};

function statFields(d, { on = [] } = {}) {
  const out = [];
  if (d.streak) out.push(f('streak', 'Consistency streak', plural(d.streak, 'day'), { on: on.includes('streak') }));
  if (d.disciplineStreak) out.push(f('disciplineStreak', 'Discipline streak', plural(d.disciplineStreak, 'check-in'), { on: on.includes('disciplineStreak') }));
  if (d.adherence != null) out.push(f('discipline', 'Discipline', `${d.adherence}%`, { on: on.includes('discipline') }));
  if (d.level) out.push(f('level', 'Level', `${d.level.n} · ${d.level.name}`, { on: on.includes('level') }));
  if (d.checkins) out.push(f('checkins', 'Daily check-ins', String(d.checkins), { on: on.includes('checkins') }));
  if (d.learning) out.push(f('learning', 'Learning activities', String(d.learning), { on: on.includes('learning') }));
  const badgeNames = (d.badges ?? []).map((b) => BADGES[b]?.name).filter(Boolean);
  if (badgeNames.length) out.push(f('badges', 'Badges', badgeNames.slice(-3), { kind: 'badges', on: on.includes('badges') }));
  return out;
}

function goalModel(a, goal, ctx) {
  const g = goal ?? a.data?.goal;
  if (!g) return null;
  const m = METRICS[g.metric];
  const p = a.data?.progress ?? {};
  const early = ['goal_created', 'goal_locked'].includes(a.type);
  const fields = [f('goalName', 'Goal', safeGoalName(g), { on: true })];
  if (g.metric === 'net_profit') fields.push(f('goalTitle', 'Goal name as you wrote it', g.title, { sensitive: true }));
  if (!early) fields.push(f('hero', 'Completed', `${p.pct ?? 0}%`, { kind: 'hero', unit: 'COMPLETED' }));
  fields.push(f('period', 'Goal period', `${g.periodDays}-day goal period`, { kind: 'period' }));
  if (g.metric !== 'net_profit') fields.push(f('progress', early ? 'Target' : 'Progress', early ? m.describe(g.target) : `${p.value ?? 0} of ${g.target} ${m.unit}`, { on: true }));
  if (p.adherence != null && !early) fields.push(f('goalDiscipline', 'Discipline in this goal', `${p.adherence}%`, { on: true }));
  fields.push(...statFields(a.data ?? {}, { on: early ? ['level'] : ['streak', 'badges', 'level'] }));
  if (g.metric === 'net_profit') fields.push(f('target', 'Profit target', money(g.target, ctx.baseCurrency).replace('+', ''), { sensitive: true }));
  if (!early && p.trades) fields.push(f('profit', 'Net profit in the goal period', money(p.netProfit ?? 0, ctx.baseCurrency), { sensitive: true }));
  if (!early && p.trades) fields.push(f('trades', 'Trades journaled', String(p.trades), { sensitive: true }));
  if (!early && p.avgRisk != null) fields.push(f('risk', 'Average risk per trade', `${p.avgRisk}%`, { sensitive: true }));
  const verb = { goal_created: 'set', goal_locked: 'locked in', goal_reached: 'reached', goal_completed: 'completed' }[a.type];
  return {
    headline: safeGoalName(g),
    headlineGeneric: `${g.periodDays}-Day ${m.label.replace(' goal', ' Goal')}`,
    headlineSensitive: g.metric === 'net_profit' ? g.title : null,
    sentence: `{who} ${verb} a ${g.periodDays}-day ${m.noun} goal.`,
    fields,
  };
}

function achievementModel(a, ctx) {
  const d = a.data ?? {};
  switch (a.type) {
    case 'goal_created':
    case 'goal_locked':
    case 'goal_reached':
    case 'goal_completed':
      return goalModel(a, ctx.goals.find((g) => g.id === a.goalId), ctx);
    case 'streak':
    case 'discipline_streak': {
      const n = d.milestone;
      const isD = a.type === 'discipline_streak';
      return {
        headline: a.title,
        sentence: isD ? `{who} kept to their plan and risk rules for ${n} check-ins in a row.` : `{who} reached a ${n}-day consistency streak.`,
        fields: [f('hero', isD ? 'Discipline streak' : 'Consistency streak', String(n), { kind: 'hero', unit: isD ? 'DISCIPLINED DAYS IN A ROW' : 'DAY STREAK' }), ...statFields({ ...d, streak: isD ? d.streak : null }, { on: ['discipline', 'level', 'badges'] })],
      };
    }
    case 'badge': {
      const b = BADGES[d.badge];
      return {
        headline: b?.name ?? a.title,
        sentence: `{who} earned the ${b?.name ?? a.title} badge.`,
        fields: [f('rule', 'How it was earned', b?.rule ?? ''), ...statFields({ ...d, badges: (d.badges ?? []).filter((x) => x !== d.badge) }, { on: ['streak', 'level'] })],
      };
    }
    case 'checkins':
    case 'learning':
    case 'backtests': {
      const n = d.milestone;
      const unit = { checkins: 'DAILY CHECK-INS', learning: 'LEARNING ACTIVITIES', backtests: 'BACKTESTING SESSIONS' }[a.type];
      const sentence = { checkins: `{who} logged ${n} daily check-ins.`, learning: `{who} completed ${n} learning activities.`, backtests: `{who} completed ${n} backtesting sessions.` }[a.type];
      return { headline: a.title, sentence, fields: [f('hero', 'Milestone', String(n), { kind: 'hero', unit }), ...statFields({ ...d, [a.type === 'checkins' ? 'checkins' : a.type]: null }, { on: ['streak', 'level'] })] };
    }
    case 'monthly_review':
      return monthModel(d.stats, ctx);
    case 'monthly_champion':
    case 'most_improved': {
      const s = d.stats ?? {};
      const champ = a.type === 'monthly_champion';
      return {
        headline: champ ? 'Consistency Champion' : 'Most Improved',
        subline: s.label,
        sentence: champ ? `{who} was a Consistency Champion in ${s.label}.` : `{who} was among the most improved traders in ${s.label}.`,
        fields: [
          champ ? f('hero', 'Discipline', `${s.adherence}%`, { kind: 'hero', unit: 'DISCIPLINE' }) : f('hero', 'Discipline', `${d.from}% → ${d.to}%`, { kind: 'hero', unit: 'DISCIPLINE ADHERENCE' }),
          f('monthCheckins', 'Daily check-ins', String(s.checkins)),
          ...(s.longestStreak ? [f('monthStreak', 'Consistency streak', plural(s.longestStreak, 'day'))] : []),
          f('basis', 'Recognised for', champ ? '15+ check-ins at 90%+ discipline' : '+15 points of discipline month on month', { on: true }),
        ],
      };
    }
    default:
      return { headline: a.title, sentence: `{who} earned ${a.title}.`, fields: statFields(d, { on: ['streak', 'level'] }) };
  }
}

function monthModel(m, ctx) {
  const fields = [
    f('status', 'Monthly status', monthStatus(m), { kind: 'hero', unit: m.inProgress ? 'SO FAR THIS MONTH' : 'MONTHLY STATUS' }),
    f('goalsCompleted', 'Goals completed', String(m.goalsCompleted)),
    f('monthStreak', 'Consistency streak', plural(m.longestStreak, 'day')),
    f('monthCheckins', 'Daily check-ins', String(m.checkins)),
  ];
  if (m.adherence != null) fields.push(f('monthDiscipline', 'Discipline', `${m.adherence}%`));
  if (m.learning) fields.push(f('monthLearning', 'Learning activities', String(m.learning)));
  if (m.backtests) fields.push(f('monthBacktests', 'Backtesting sessions', String(m.backtests), { on: false }));
  const badges = (m.badgesEarned ?? []).map((b) => BADGES[b]?.name).filter(Boolean);
  if (badges.length) fields.push(f('badges', 'Badges earned', badges, { kind: 'badges' }));
  if (m.trades) fields.push(f('profit', 'Net profit this month', money(m.netProfit, ctx.baseCurrency), { sensitive: true }));
  if (m.trades) fields.push(f('trades', 'Trades journaled', String(m.trades), { sensitive: true }));
  return { headline: m.label, sentence: `{who}'s ${m.label} on Kotka${m.inProgress ? ', so far' : ''}.`, fields };
}

function checkinModel(c, ctx) {
  const n = runEndingAt(ctx.byDate, c.date).length;
  const dn = runEndingAt(ctx.byDate, c.date, isDisciplined).length;
  const checks = c.traded
    ? [
        { label: 'Plan followed', ok: c.planFollowed === true },
        { label: 'Risk respected', ok: c.riskRespected === true },
        { label: 'Revenge trading avoided', ok: c.noRevengeTrading === true },
      ]
    : [{ label: 'No trades taken: stayed patient', ok: true }];
  const fields = [
    f('checks', 'Today', checks, { kind: 'checks' }),
    f('streak', 'Consistency streak', plural(n, 'day')),
  ];
  if (dn) fields.push(f('disciplineStreak', 'Discipline streak', plural(dn, 'check-in'), { on: false }));
  if (c.learning) fields.push(f('learningToday', 'Learning today', plural(c.learning, 'activity', 'activities'), { on: false }));
  if (c.backtests) fields.push(f('backtestsToday', 'Backtesting today', plural(c.backtests, 'session'), { on: false }));
  if (c.note) fields.push(f('note', 'Your note', c.note, { sensitive: true, kind: 'note' }));
  const clean = checks.every((x) => x.ok);
  return {
    eyebrow: `DAY ${n} COMPLETE`,
    icon: 'flame',
    headline: n === 1 ? '1 check-in' : `${n} trading days in a row`,
    sentence: clean ? `Day ${n}: {who} checked in and kept to the plan.` : `Day ${n} of {who}'s check-in streak.`,
    fields,
    date: new Date(`${c.date}T12:00:00Z`),
  };
}

function journeyModel(goal, ctx) {
  const from = goal.startDate;
  const to = goal.endDate;
  const inWindow = (d) => {
    const day = d.toISOString().slice(0, 10);
    return day >= from && day <= to;
  };
  const LABEL = { goal_reached: 'Goal reached', goal_completed: 'Goal achieved' };
  const events = [
    { date: goal.createdAt, label: 'Goal created', icon: 'target' },
    ...(goal.lockedAt ? [{ date: goal.lockedAt, label: 'Goal locked', icon: 'lock' }] : []),
    ...ctx.achievements
      .filter((a) => (a.goalId === goal.id && ['goal_reached', 'goal_completed'].includes(a.type)) || (!a.goalId && ['streak', 'discipline_streak', 'badge', 'checkins', 'learning', 'backtests'].includes(a.type) && inWindow(a.earnedAt)))
      .map((a) => ({ date: a.earnedAt, label: LABEL[a.type] ?? a.title, icon: EYEBROW[a.type]?.[1] ?? 'medal', final: ['goal_reached', 'goal_completed'].includes(a.type) })),
  ].sort((a, b) => a.date - b.date);
  // Keep the story readable: first, last and the biggest steps between.
  const timeline = events.length > 7 ? [events[0], ...events.slice(1, -1).filter((e, i, arr) => i >= arr.length - 5), events.at(-1)] : events;
  const p = goalProgress(goal, ctx, ctx.today);
  const fields = [
    f('timeline', 'Journey', timeline.map((e) => ({ date: e.date.toISOString().slice(0, 10), label: e.label, icon: e.icon, final: !!e.final })), { kind: 'timeline' }),
    f('goalName', 'Goal', safeGoalName(goal)),
  ];
  if (goal.metric === 'net_profit') fields.push(f('goalTitle', 'Goal name as you wrote it', goal.title, { sensitive: true }));
  fields.push(f('hero', 'Completed', `${p.pct}%`, { kind: 'hero', unit: 'COMPLETED', on: false }), f('period', 'Goal period', `${goal.periodDays}-day goal period`, { kind: 'period' }));
  return {
    eyebrow: 'MY KOTKA JOURNEY',
    icon: 'route',
    headline: safeGoalName(goal),
    headlineGeneric: `${goal.periodDays}-Day ${METRICS[goal.metric].label.replace(' goal', ' Goal')}`,
    headlineSensitive: goal.metric === 'net_profit' ? goal.title : null,
    sentence: `{who}'s journey through a ${goal.periodDays}-day ${METRICS[goal.metric].noun} goal.`,
    fields,
    date: events.at(-1)?.date ?? goal.createdAt,
  };
}

// Full model for the owner (all fields, with sensitive ones flagged).
export async function buildCard(userId, source, sourceId, today, { ctx: given, user: givenUser } = {}) {
  const [ctx, user] = await Promise.all([given ?? loadContext(userId), givenUser ?? prisma.user.findUnique({ where: { id: userId }, select: { name: true, username: true } })]);
  ctx.today = today;
  let model = null;
  let base = {};
  if (source === 'achievement') {
    const a = ctx.achievements.find((x) => x.id === sourceId);
    if (!a) return null;
    model = achievementModel(a, ctx);
    const [eyebrow, icon] = EYEBROW[a.type] ?? ['ACHIEVEMENT', 'medal'];
    base = { type: a.type, eyebrow, icon, date: a.earnedAt, verification: a.verification };
  } else if (source === 'checkin') {
    const c = ctx.checkins.find((x) => x.id === sourceId);
    if (!c) return null;
    model = checkinModel(c, ctx);
    base = { type: 'checkin', verification: 'self_reported' };
  } else if (source === 'monthly') {
    if (!/^\d{4}-\d{2}$/.test(sourceId)) return null;
    const m = monthStats(ctx, sourceId, today);
    if (!m.checkins) return null;
    model = monthModel(m, ctx);
    base = { type: 'monthly', eyebrow: 'KOTKA MONTHLY REVIEW', icon: 'calendar', date: new Date(), verification: 'self_reported' };
  } else if (source === 'journey') {
    const g = ctx.goals.find((x) => x.id === sourceId);
    if (!g) return null;
    model = journeyModel(g, ctx);
    base = { type: 'journey', verification: g.verification };
  }
  if (!model) return null;
  const card = { source, sourceId, motto: MOTTO, ...base, ...model, identity: { name: user.name, username: user.username } };
  card.fields = [...card.fields, ...identityFields(user)];
  card.date = new Date(card.date ?? Date.now()).toISOString();
  return card;
}

export const presetKeys = (card) => card.fields.filter((x) => !x.sensitive && x.on).map((x) => x.key);

// What a public page / Community post may show: only the chosen fields.
// Sensitive fields need an explicit acknowledgement from the trader.
export function publicSnapshot(card, keys, { sensitiveAck = false } = {}) {
  const chosen = new Set((keys ?? []).filter((k) => card.fields.some((x) => x.key === k)));
  const sensitive = card.fields.filter((x) => x.sensitive && chosen.has(x.key));
  if (sensitive.length && !sensitiveAck) return { error: `Confirm that you want to show ${sensitive.map((x) => x.label.toLowerCase()).join(', ')} publicly.` };
  const name = chosen.has('name') ? card.identity.name : null;
  const username = chosen.has('username') ? card.identity.username : null;
  const who = firstName(name) ?? (username ? `@${username}` : 'A Kotka trader');
  const sentence = card.sentence.replace('{who}', who).replace(/^A Kotka trader's/, "A Kotka trader's");
  return {
    snapshot: {
      source: card.source,
      type: card.type,
      eyebrow: card.eyebrow,
      icon: card.icon,
      headline: chosen.has('goalTitle') && card.headlineSensitive ? card.headlineSensitive : card.headlineGeneric && !chosen.has('goalName') ? card.headlineGeneric : card.headline,
      subline: card.subline ?? null,
      sentence,
      date: card.date,
      verification: card.verification === 'verified' ? 'verified' : 'self_reported',
      motto: card.motto,
      fields: card.fields.filter((x) => chosen.has(x.key) && !IDENTITY_KEYS.includes(x.key) && !['goalTitle', 'goalName'].includes(x.key)).map(({ key, label, value, kind, unit }) => ({ key, label, value, kind, unit })),
      identity: { name, username },
    },
    fields: [...chosen],
  };
}

// Profile showcase: headline numbers plus pinned achievements, public-safe.
export async function showcase(userId, { self = false } = {}) {
  const [ctx, user] = await Promise.all([loadContext(userId), prisma.user.findUnique({ where: { id: userId }, select: { name: true, username: true } })]);
  if (!self && !ctx.prefs.showOnProfile) return { visible: false };
  const today = new Date().toISOString().slice(0, 10);
  const { stats } = computeStats(ctx, today);
  const pinned = [];
  for (const a of ctx.achievements.filter((x) => x.pinned).slice(0, 3)) {
    const card = await buildCard(userId, 'achievement', a.id, today, { ctx, user });
    if (card) pinned.push({ id: a.id, ...publicSnapshot(card, presetKeys(card)).snapshot });
  }
  return {
    visible: true,
    hiddenFromOthers: !ctx.prefs.showOnProfile,
    stats: {
      goalsCompleted: stats.goalsCompleted,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      badges: stats.badges.map((b) => BADGES[b]?.name).filter(Boolean),
      monthlyAchievements: stats.monthlyAchievements,
      level: { n: stats.level.n, name: stats.level.name },
      checkins: stats.totalCheckins,
    },
    pinned,
  };
}

export async function communitySnapshot(userId, achievementId) {
  const card = await buildCard(userId, 'achievement', achievementId, new Date().toISOString().slice(0, 10));
  return card ? publicSnapshot(card, presetKeys(card)).snapshot : null;
}

export { computeStats, monthLabel };
