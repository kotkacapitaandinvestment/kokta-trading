// Goal Room in Community: achievement posts, and what happens right after
// something is earned (a notification, and a post only if the trader chose
// automatic posting).

import { prisma } from '../prisma.js';
import { notify } from '../community/notify.js';
import { buildCard, presetKeys, publicSnapshot } from './cards.js';

// Worth a Community post on their own. Small steps (goal set, 3-day streak,
// 10 check-ins) stay in the trader's Goal Room unless they post them.
const POSTABLE = new Set(['goal_locked', 'goal_reached', 'goal_completed', 'badge', 'monthly_champion', 'most_improved']);
export function postable(a) {
  if (POSTABLE.has(a.type)) return true;
  const n = a.data?.milestone ?? 0;
  return (a.type === 'streak' && n >= 7) || (a.type === 'discipline_streak' && n >= 14) || (a.type === 'checkins' && n >= 25) || (a.type === 'learning' && n >= 25) || (a.type === 'backtests' && n >= 10);
}

// Posts an achievement to Community with the public-safe fields only.
export async function postAchievement(userId, achievementId, { note = '' } = {}) {
  const [a, user] = await Promise.all([
    prisma.achievement.findFirst({ where: { id: achievementId, userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { username: true, communityMutedUntil: true } }),
  ]);
  if (!a) return { error: 'Achievement not found.', status: 404 };
  if (!user?.username) return { error: 'Set up your Community profile (choose a username) before posting.', status: 400 };
  if (user.communityMutedUntil && user.communityMutedUntil > new Date()) return { error: 'Your Community posting is paused.', status: 403 };
  if (a.postId) {
    const existing = await prisma.post.findUnique({ where: { id: a.postId } });
    if (existing && !existing.deletedAt && !existing.removedAt) return { post: existing, existing: true };
  }
  const card = await buildCard(userId, 'achievement', a.id, new Date().toISOString().slice(0, 10));
  if (!card) return { error: 'Achievement not found.', status: 404 };
  const { snapshot } = publicSnapshot(card, presetKeys(card));
  const post = await prisma.post.create({
    data: { authorId: userId, kind: 'achievement', body: String(note ?? '').trim().slice(0, 1000), topics: ['goals'], attachments: [{ type: 'achievement', achievementId: a.id, snapshot }] },
  });
  await prisma.achievement.update({ where: { id: a.id }, data: { postId: post.id } });
  return { post };
}

// Notify the trader of new achievements (recent ones only, so evaluating
// older history never floods them), and auto-post when they opted in.
export async function afterEarned(userId, created, prefs) {
  const recent = created.filter((a) => Date.now() - new Date(a.earnedAt).getTime() < 3 * 86400e3 && a.type !== 'goal_created');
  if (!recent.length) return;
  await notify(
    recent.map((a) => ({
      userId,
      type: 'achievement',
      title: a.type.startsWith('monthly') || a.type === 'most_improved' ? a.title : `Achievement: ${a.title}`,
      body: a.type === 'monthly_review' ? 'Your monthly review is ready to look back on and share.' : 'Share it, or post it to Community, from your Goal Room.',
      link: `/app/goals?achievement=${a.id}`,
      groupKey: `achievement:${a.id}`,
    })),
  );
  if (prefs?.autoPost) {
    for (const a of recent.filter(postable)) {
      await postAchievement(userId, a.id).catch((err) => console.warn('[goals] auto-post failed', err.message));
    }
  }
}

// Scheduled: closes goals whose period ended and, in the first days of a
// month, writes last month's reviews and recognitions. Uses "yesterday" in
// UTC so every time zone has finished the day before a goal is closed.
export async function runGoalJobs() {
  const { evaluate, monthlyRecognition, utcToday, addDays, loadContext } = await import('./engine.js');
  const today = addDays(utcToday(), -1);
  const due = await prisma.goal.findMany({ where: { status: { in: ['active', 'achieved'] }, endDate: { lt: today } }, select: { userId: true }, distinct: ['userId'], take: 200 });
  let closed = 0;
  for (const { userId } of due) {
    const { created, ctx } = await evaluate(userId, today);
    await afterEarned(userId, created, ctx.prefs);
    closed += 1;
  }
  let monthly = 0;
  if (Number(utcToday().slice(8, 10)) <= 3) {
    const month = addDays(`${utcToday().slice(0, 7)}-01`, -1).slice(0, 7);
    const [users, done] = await Promise.all([
      prisma.goalCheckIn.findMany({ where: { date: { startsWith: month } }, select: { userId: true }, distinct: ['userId'], take: 2000 }),
      prisma.achievement.findMany({ where: { key: `monthly:${month}` }, select: { userId: true } }),
    ]);
    const reviewed = new Set(done.map((d) => d.userId));
    for (const { userId } of users.filter((u) => !reviewed.has(u.userId))) {
      const created = await monthlyRecognition(userId, month);
      if (created.length) {
        const ctx = await loadContext(userId);
        await afterEarned(userId, created, ctx.prefs);
        monthly += created.length;
      }
    }
  }
  return { usersWithClosedGoals: closed, monthlyAchievements: monthly };
}
