import crypto from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { auditLater } from '../lib/audit.js';
import { requireAuth } from '../middleware/auth.js';
import { saveMedia, removeMedia } from '../lib/media.js';
import { overLimit } from '../lib/community/throttle.js';
import { screenText } from '../lib/community/safety.js';
import { BADGES, LEVELS, METRICS, PERIODS, addDays, computeStats, evaluate, goalProgress, goalRoomPrefs, loadContext, localDate, monthLabel, monthStats } from '../lib/goals/engine.js';
import { buildCard, presetKeys, publicSnapshot, safeGoalName } from '../lib/goals/cards.js';
import { afterEarned, postAchievement, postable } from '../lib/goals/social.js';
import { limit } from '../lib/rateLimit.js';

// Goal Room: goals, daily check-ins, achievements and share links.
export const goalsRouter = Router();
goalsRouter.use(requireAuth);

const MAX_OPEN_GOALS = 5;
const bool = (v) => (typeof v === 'boolean' ? v : null);
const intIn = (v, lo, hi) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : lo;
};
const str = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

function goalView(g, ctx, today) {
  return {
    id: g.id,
    metric: g.metric,
    metricLabel: METRICS[g.metric]?.label,
    unit: METRICS[g.metric]?.unit,
    describe: METRICS[g.metric]?.describe(g.target),
    title: g.title,
    publicName: safeGoalName(g),
    why: g.why,
    target: g.target,
    periodDays: g.periodDays,
    startDate: g.startDate,
    endDate: g.endDate,
    status: g.status,
    lockedAt: g.lockedAt,
    achievedAt: g.achievedAt,
    closedAt: g.closedAt,
    verification: g.verification,
    sensitive: !!METRICS[g.metric]?.sensitive,
    progress: goalProgress(g, ctx, today),
  };
}

const achievementView = (a) => ({ id: a.id, type: a.type, title: a.title, goalId: a.goalId, earnedAt: a.earnedAt, pinned: a.pinned, postId: a.postId, verification: a.verification, data: a.data, postable: postable(a) });
const checkinView = (c) => c && { id: c.id, date: c.date, traded: c.traded, planFollowed: c.planFollowed, riskRespected: c.riskRespected, noRevengeTrading: c.noRevengeTrading, learning: c.learning, backtests: c.backtests, note: c.note };

async function overview(userId, today) {
  const { stats, created, ctx } = await evaluate(userId, today);
  await afterEarned(userId, created, ctx.prefs);
  const order = { active: 0, achieved: 1, draft: 2, completed: 3, missed: 4, abandoned: 5 };
  const earned = new Set(stats.badges);
  const months = [...new Set(ctx.checkins.map((c) => c.date.slice(0, 7)))].sort().reverse();
  return {
    today,
    stats,
    levels: LEVELS,
    badges: Object.entries(BADGES).map(([id, b]) => ({ id, ...b, earned: earned.has(id) })),
    checkin: checkinView(ctx.byDate.get(today)) ?? null,
    recent: ctx.checkins.slice(-35).map(checkinView),
    goals: ctx.goals.map((g) => goalView(g, ctx, today)).sort((a, b) => order[a.status] - order[b.status]),
    achievements: ctx.achievements.slice(0, 80).map(achievementView),
    months: months.map((m) => ({ month: m, label: monthLabel(m) })),
    prefs: ctx.prefs,
    metrics: Object.entries(METRICS).map(([id, m]) => ({ id, label: m.label, unit: m.unit, sensitive: !!m.sensitive })),
    periods: PERIODS,
    currency: ctx.baseCurrency,
    earned: created.map(achievementView),
  };
}

// Light read for the dashboard: no evaluation, just today's standing.
goalsRouter.get('/summary', asyncHandler(async (req, res) => {
  const today = localDate(req.query.today);
  const ctx = await loadContext(req.userId);
  const { stats } = computeStats(ctx, today);
  const goals = ctx.goals.filter((g) => ['active', 'achieved'].includes(g.status)).slice(0, 3).map((g) => ({ id: g.id, title: g.title, status: g.status, pct: goalProgress(g, ctx, today).pct }));
  res.json({ checkedInToday: stats.checkedInToday, currentStreak: stats.currentStreak, adherence30: stats.adherence30, level: { n: stats.level.n, name: stats.level.name }, goals });
}));

goalsRouter.get('/', asyncHandler(async (req, res) => {
  res.json(await overview(req.userId, localDate(req.query.today)));
}));

// ── check-ins ──────────────────────────────────────────────────────────────
goalsRouter.post('/checkins', limit('checkin'), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const date = localDate(b.date);
  const traded = bool(b.traded);
  if (traded === null) return res.status(400).json({ error: 'Say whether you traded today.' });
  const answers = { planFollowed: bool(b.planFollowed), riskRespected: bool(b.riskRespected), noRevengeTrading: bool(b.noRevengeTrading) };
  if (traded && Object.values(answers).some((v) => v === null)) return res.status(400).json({ error: 'Answer the three questions about today’s trading.' });
  const note = str(b.note, 500) || null;
  const data = {
    traded,
    ...(traded ? answers : { planFollowed: null, riskRespected: null, noRevengeTrading: null }),
    learning: intIn(b.learning, 0, 20),
    backtests: intIn(b.backtests, 0, 20),
    note,
  };
  await prisma.goalCheckIn.upsert({ where: { userId_date: { userId: req.userId, date } }, update: data, create: { userId: req.userId, date, ...data } });
  auditLater(req, 'goals.checked_in', { targetType: 'checkin', targetId: date, detail: { date, traded, kept: !traded || Object.values(answers).every(Boolean) } });
  res.status(201).json(await overview(req.userId, localDate(b.today ?? b.date)));
}));

// ── goals ──────────────────────────────────────────────────────────────────
function validateGoal(b, today, { existing = null } = {}) {
  const metric = b.metric ?? existing?.metric;
  if (!METRICS[metric]) return { error: 'Choose what the goal measures.' };
  const periodDays = Number(b.periodDays ?? existing?.periodDays);
  if (!PERIODS.includes(periodDays)) return { error: `Choose a period of ${PERIODS.join(', ')} days.` };
  const target = Number(b.target ?? existing?.target);
  const isCount = metric !== 'net_profit';
  if (!Number.isFinite(target) || target <= 0) return { error: 'Set a target above zero.' };
  if (isCount && (!Number.isInteger(target) || target > 1000)) return { error: 'Use a whole-number target up to 1,000.' };
  if (metric === 'streak' && target > periodDays) return { error: `A streak can't be longer than the ${periodDays}-day period.` };
  if (['checkins', 'disciplined_days'].includes(metric) && target > periodDays) return { error: `You can't check in more than ${periodDays} times in ${periodDays} days.` };
  if (!isCount && target > 1e9) return { error: 'That target is too large.' };
  const title = str(b.title ?? existing?.title, 80);
  if (title.length < 3) return { error: 'Give the goal a short name (3+ characters).' };
  // A draft whose start has passed simply starts today.
  let startDate = existing && existing.startDate > today ? existing.startDate : today;
  if (b.startDate !== undefined && b.startDate !== null && b.startDate !== '') {
    const s = typeof b.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.startDate) ? b.startDate : null;
    if (!s || s < today || s > addDays(today, 7)) return { error: 'Start the goal today or within the next 7 days.' };
    startDate = s;
  }
  const why = b.why === undefined ? existing?.why ?? null : str(b.why, 300) || null;
  return { goal: { metric, periodDays, target, title, why, startDate, endDate: addDays(startDate, periodDays - 1) } };
}

goalsRouter.post('/goals', limit('goalWrite'), asyncHandler(async (req, res) => {
  const today = localDate(req.body?.today);
  const open = await prisma.goal.count({ where: { userId: req.userId, status: { in: ['draft', 'active', 'achieved'] } } });
  if (open >= MAX_OPEN_GOALS) return res.status(400).json({ error: `You can have up to ${MAX_OPEN_GOALS} open goals. Finish or abandon one first.` });
  const { goal, error } = validateGoal(req.body ?? {}, today);
  if (error) return res.status(400).json({ error });
  const screen = screenText(`${goal.title} ${goal.why ?? ''}`);
  if (screen.blocked) return res.status(400).json({ error: screen.blocked });
  const g = await prisma.goal.create({ data: { userId: req.userId, ...goal } });
  await prisma.achievement.create({ data: { userId: req.userId, type: 'goal_created', key: `goal:${g.id}:created`, goalId: g.id, title: 'Goal Set', data: { goal: { id: g.id, title: g.title, metric: g.metric, target: g.target, periodDays: g.periodDays, startDate: g.startDate, endDate: g.endDate } } } });
  auditLater(req, 'goals.goal_set', { targetType: 'goal', targetId: g.id, detail: { title: g.title, type: METRICS[g.metric].label, periodDays: g.periodDays } });
  res.status(201).json({ ...(await overview(req.userId, today)), goalId: g.id });
}));

goalsRouter.patch('/goals/:id', limit('goalWrite'), asyncHandler(async (req, res) => {
  const today = localDate(req.body?.today);
  const existing = await prisma.goal.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'We couldn’t find that goal. It may have been deleted. Refresh your Goal Room.' });
  if (existing.status !== 'draft') return res.status(400).json({ error: 'A locked goal can’t be changed. That’s the point of locking it.' });
  const { goal, error } = validateGoal(req.body ?? {}, today, { existing });
  if (error) return res.status(400).json({ error });
  await prisma.goal.update({ where: { id: existing.id }, data: goal });
  res.json(await overview(req.userId, today));
}));

goalsRouter.post('/goals/:id/lock', limit('goalWrite'), asyncHandler(async (req, res) => {
  const today = localDate(req.body?.today);
  const g = await prisma.goal.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!g) return res.status(404).json({ error: 'We couldn’t find that goal. It may have been deleted. Refresh your Goal Room.' });
  if (g.status !== 'draft') return res.status(400).json({ error: 'This goal is already locked.' });
  // The period starts when the goal is locked, never in the past.
  const startDate = g.startDate < today ? today : g.startDate;
  const locked = await prisma.goal.update({ where: { id: g.id }, data: { status: 'active', lockedAt: new Date(), startDate, endDate: addDays(startDate, g.periodDays - 1) } });
  const ctx = await loadContext(req.userId);
  const a = await prisma.achievement.create({
    data: { userId: req.userId, type: 'goal_locked', key: `goal:${g.id}:locked`, goalId: g.id, title: 'Goal Locked', data: { goal: { id: g.id, title: g.title, metric: g.metric, target: g.target, periodDays: g.periodDays, startDate: locked.startDate, endDate: locked.endDate }, progress: goalProgress(locked, ctx, today) } },
  });
  await afterEarned(req.userId, [a], ctx.prefs);
  auditLater(req, 'goals.goal_locked', { targetType: 'goal', targetId: g.id, detail: { title: g.title, from: locked.startDate, to: locked.endDate } });
  res.json(await overview(req.userId, today));
}));

goalsRouter.post('/goals/:id/abandon', limit('goalWrite'), asyncHandler(async (req, res) => {
  const g = await prisma.goal.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!g) return res.status(404).json({ error: 'We couldn’t find that goal. It may have been deleted. Refresh your Goal Room.' });
  if (!['active', 'achieved'].includes(g.status)) return res.status(400).json({ error: 'Only a goal in progress can be abandoned.' });
  await prisma.goal.update({ where: { id: g.id }, data: { status: 'abandoned', closedAt: new Date() } });
  auditLater(req, 'goals.goal_abandoned', { targetType: 'goal', targetId: g.id, detail: { title: g.title } });
  res.json(await overview(req.userId, localDate(req.body?.today)));
}));

goalsRouter.delete('/goals/:id', limit('goalWrite'), asyncHandler(async (req, res) => {
  const g = await prisma.goal.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!g) return res.status(404).json({ error: 'We couldn’t find that goal. It may have been deleted. Refresh your Goal Room.' });
  if (g.status !== 'draft') return res.status(400).json({ error: 'Locked goals stay on your record. You can abandon a running goal instead.' });
  await prisma.achievement.deleteMany({ where: { userId: req.userId, goalId: g.id } });
  await prisma.goal.delete({ where: { id: g.id } });
  auditLater(req, 'goals.draft_deleted', { targetType: 'goal', targetId: g.id, detail: { title: g.title } });
  res.json(await overview(req.userId, localDate(req.query.today)));
}));

// ── achievements ───────────────────────────────────────────────────────────
goalsRouter.patch('/achievements/:id', limit('goalWrite'), asyncHandler(async (req, res) => {
  const a = await prisma.achievement.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!a) return res.status(404).json({ error: 'We couldn’t find that achievement. Refresh your Goal Room.' });
  if (typeof req.body?.pinned === 'boolean') {
    if (req.body.pinned && !a.pinned && (await prisma.achievement.count({ where: { userId: req.userId, pinned: true } })) >= 3) return res.status(400).json({ error: 'You can pin up to 3 achievements. Unpin one first.' });
    await prisma.achievement.update({ where: { id: a.id }, data: { pinned: req.body.pinned } });
  }
  res.json({ ok: true });
}));

goalsRouter.post('/achievements/:id/post', limit('goalWrite'), asyncHandler(async (req, res) => {
  const note = str(req.body?.note, 1000);
  if (note) {
    const screen = screenText(note);
    if (screen.blocked) return res.status(400).json({ error: screen.blocked });
  }
  const r = await postAchievement(req.userId, req.params.id, { note });
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  if (!r.existing) auditLater(req, 'goals.achievement_posted', { targetType: 'post', targetId: r.post.id, detail: { achievementId: req.params.id } });
  res.status(r.existing ? 200 : 201).json({ postId: r.post.id, existing: !!r.existing });
}));

// ── share cards & public links ─────────────────────────────────────────────
const SOURCES = ['achievement', 'checkin', 'monthly', 'journey'];

goalsRouter.get('/cards/:source/:sourceId', asyncHandler(async (req, res) => {
  if (!SOURCES.includes(req.params.source)) return res.status(404).json({ error: 'We couldn’t make that card. Refresh and try again.' });
  const card = await buildCard(req.userId, req.params.source, req.params.sourceId, localDate(req.query.today));
  if (!card) return res.status(404).json({ error: 'We couldn’t make that card. Refresh and try again.' });
  res.json({ card, preset: presetKeys(card) });
}));

goalsRouter.post('/shares', asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  if (!SOURCES.includes(b.source)) return res.status(400).json({ error: 'We couldn’t make that card. Refresh and try again.' });
  const limited = await overLimit('share', req.userId);
  if (limited) return res.status(429).json({ error: limited });
  const card = await buildCard(req.userId, b.source, String(b.sourceId ?? ''), localDate(b.today));
  if (!card) return res.status(404).json({ error: 'We couldn’t make that card. Refresh and try again.' });
  const { snapshot, fields, error } = publicSnapshot(card, Array.isArray(b.fields) ? b.fields.map(String) : presetKeys(card), { sensitiveAck: b.sensitiveAck === true });
  if (error) return res.status(400).json({ error, code: 'sensitive_ack' });
  let imageId = null;
  if (typeof b.image === 'string' && b.image.startsWith('data:image/')) {
    const saved = await saveMedia(req.userId, { dataUrl: b.image, width: Number(b.width) || undefined, height: Number(b.height) || undefined });
    if (saved.error) return res.status(400).json({ error: saved.error });
    // A public card is always a picture, whatever the upload claimed to be.
    if (saved.media.kind !== 'image') {
      await removeMedia([saved.media.id]);
      return res.status(400).json({ error: 'The card must be an image.' });
    }
    imageId = saved.media.id;
  }
  const slug = crypto.randomBytes(9).toString('base64url');
  const share = await prisma.achievementShare.create({ data: { slug, userId: req.userId, source: b.source, sourceId: String(b.sourceId), fields, snapshot, imageId } });
  auditLater(req, 'goals.public_link_created', { targetType: 'share', targetId: share.id, detail: { headline: snapshot.headline, fields, sensitive: card.fields.filter((x) => x.sensitive && fields.includes(x.key)).map((x) => x.label) } });
  res.status(201).json({ share: { id: share.id, slug, path: `/achievement/${slug}` } });
}));

goalsRouter.get('/shares', asyncHandler(async (req, res) => {
  const rows = await prisma.achievementShare.findMany({ where: { userId: req.userId, revokedAt: null }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ shares: rows.map((s) => ({ id: s.id, slug: s.slug, path: `/achievement/${s.slug}`, headline: s.snapshot?.headline, eyebrow: s.snapshot?.eyebrow, fields: s.fields, views: s.views, createdAt: s.createdAt })) });
}));

goalsRouter.delete('/shares/:id', asyncHandler(async (req, res) => {
  const s = await prisma.achievementShare.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!s) return res.status(404).json({ error: 'That link was already removed.' });
  await prisma.achievementShare.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
  auditLater(req, 'goals.public_link_removed', { targetType: 'share', targetId: s.id, detail: { headline: s.snapshot?.headline } });
  if (s.imageId) await removeMedia([s.imageId]);
  res.json({ ok: true });
}));

// Community "Goals" tab: last month's recognitions among traders who show
// achievements on their profile. Threshold-based, never ranked by money.
goalsRouter.get('/community/recognitions', asyncHandler(async (req, res) => {
  const { utcToday } = await import('../lib/goals/engine.js');
  const month = addDays(`${utcToday().slice(0, 7)}-01`, -1).slice(0, 7);
  const rows = await prisma.achievement.findMany({ where: { type: { in: ['monthly_champion', 'most_improved'] }, key: { in: [`champion:${month}`, `improved:${month}`] } }, orderBy: { earnedAt: 'asc' }, take: 200, select: { userId: true, type: true, data: true } });
  const settings = await prisma.userSettings.findMany({ where: { userId: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { userId: true, goalRoomPreferences: true } });
  const shown = new Set(settings.filter((s) => goalRoomPrefs(s.goalRoomPreferences).showOnProfile).map((s) => s.userId));
  const { userCards } = await import('../lib/community/users.js');
  const cards = await userCards(rows.filter((r) => shown.has(r.userId)).map((r) => r.userId));
  const list = (type) => rows.filter((r) => r.type === type && cards.get(r.userId)?.username).map((r) => ({ user: cards.get(r.userId), checkins: r.data?.stats?.checkins, adherence: r.data?.stats?.adherence, from: r.data?.from, to: r.data?.to }));
  res.json({ month, label: monthLabel(month), champions: list('monthly_champion'), improved: list('most_improved'), basis: 'Consistency Champion: 15+ check-ins at 90%+ discipline in the month. Most Improved: discipline up 15+ points on the month before, with 10+ check-ins in both. Everyone who meets the bar is recognised; nothing is ranked by money.' });
}));

// ── monthly review, journey, preferences ───────────────────────────────────
goalsRouter.get('/monthly/:month', asyncHandler(async (req, res) => {
  if (!/^\d{4}-\d{2}$/.test(req.params.month)) return res.status(400).json({ error: 'Choose a month from the list.' });
  const ctx = await loadContext(req.userId);
  res.json({ review: monthStats(ctx, req.params.month, localDate(req.query.today)) });
}));

goalsRouter.put('/preferences', limit('goalWrite'), asyncHandler(async (req, res) => {
  const current = await prisma.userSettings.findUnique({ where: { userId: req.userId }, select: { goalRoomPreferences: true } });
  const prefs = goalRoomPrefs(current?.goalRoomPreferences);
  for (const k of ['autoPost', 'showOnProfile']) if (typeof req.body?.[k] === 'boolean') prefs[k] = req.body[k];
  await prisma.userSettings.upsert({ where: { userId: req.userId }, update: { goalRoomPreferences: prefs }, create: { userId: req.userId, goalRoomPreferences: prefs } });
  res.json({ prefs });
}));
