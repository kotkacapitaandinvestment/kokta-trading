import { Router } from 'express';
import { waitUntil } from '@vercel/functions';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { publish } from '../../lib/realtime.js';
import { instrument } from '../../lib/instruments.js';
import { isStaff, staffOutranks, userCards, relationsFor } from '../../lib/community/users.js';
import { normalizeAttachments, REACTIONS, excerpt, flagLabels, reactionSummary } from '../../lib/community/serialize.js';
import { screenText, REVIEW_FLAGS } from '../../lib/community/safety.js';
import { overLimit } from '../../lib/community/throttle.js';
import { notify } from '../../lib/community/notify.js';
import { resolveMentions } from '../../lib/community/mentions.js';
import { postViews, buildFeed, POST_INCLUDE, trendScore } from '../../lib/community/posts.js';
import { audit, auditLater } from '../../lib/audit.js';
import { limit } from '../../lib/rateLimit.js';
import { TOPICS } from './social.js';
import { requireProfile, clampInt, str } from './context.js';

export const postsRouter = Router();

const KINDS = ['post', 'market', 'idea', 'poll', 'question', 'news'];
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1H', '4H', 'Daily', 'Weekly', 'Monthly'];
const CHALLENGES = ['technical', 'fundamental', 'risk', 'timing', 'liquidity', 'invalidation'];
const IDEA_STATUSES = ['open', 'updated', 'closed', 'invalidated'];
// How a status change reads in followers' notifications.
const STATUS_NEWS = { open: (m) => `reopened their ${m} idea`, updated: (m) => `posted an update on their ${m} idea`, closed: (m) => `closed their ${m} idea`, invalidated: (m) => `marked their ${m} idea as no longer valid` };
const CHALLENGE_WORDS = { technical: 'chart reading', fundamental: 'fundamentals', risk: 'risk', timing: 'timing', liquidity: 'liquidity', invalidation: 'stop level' };
const postLink = (p) => `/app/community/${p.kind === 'idea' ? 'ideas' : 'posts'}/${p.id}`;
const KIND_NOUN = { idea: 'trade idea', achievement: 'achievement' };

function validateIdea(input, symbol) {
  const i = input && typeof input === 'object' ? input : {};
  const num = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '')));
  const direction = i.direction === 'bearish' ? 'bearish' : i.direction === 'bullish' ? 'bullish' : null;
  const [entry, stop, target] = [num(i.entry), num(i.stop), num(i.target)];
  const thesis = str(i.thesis, 5000);
  if (!symbol) return { error: 'Choose the market this idea is about.' };
  if (!direction) return { error: 'Choose bullish or bearish.' };
  if (!TIMEFRAMES.includes(i.timeframe)) return { error: 'Choose a timeframe.' };
  if (![entry, stop, target].every((v) => Number.isFinite(v) && v > 0)) return { error: 'Entry, stop and target must be positive prices.' };
  if (direction === 'bullish' && !(stop < entry && entry < target)) return { error: 'For a bullish idea the stop must be below entry and the target above it.' };
  if (direction === 'bearish' && !(target < entry && entry < stop)) return { error: 'For a bearish idea the stop must be above entry and the target below it.' };
  if (thesis.length < 40) return { error: 'Explain your idea in a couple of sentences (at least 40 characters).' };
  const riskReward = Math.round((Math.abs(target - entry) / Math.abs(entry - stop)) * 100) / 100;
  return { idea: { instrument: symbol, direction, timeframe: i.timeframe, entry, stop, target, riskReward, thesis } };
}

// ── feed & discovery ───────────────────────────────────────────────────────

postsRouter.get('/feed', asyncHandler(async (req, res) => {
  const mode = ['foryou', 'latest', 'trending', 'following'].includes(req.query.mode) ? req.query.mode : 'foryou';
  const type = ['all', 'posts', 'ideas', 'news', 'events', 'markets', 'goals'].includes(req.query.type) ? req.query.type : 'all';
  const feed = await buildFeed(req.me, {
    mode,
    type,
    before: typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? req.query.before : null,
    offset: clampInt(req.query.offset, 0, 2000, 0),
    limit: clampInt(req.query.limit, 5, 40, 20),
  });
  res.json({ mode, type, ...feed });
}));

postsRouter.get('/ideas', asyncHandler(async (req, res) => {
  const inst = instrument(req.query.instrument);
  // 'active' = open or updated.
  const status = req.query.status === 'active' ? 'active' : IDEA_STATUSES.includes(req.query.status) ? req.query.status : null;
  const direction = ['bullish', 'bearish'].includes(req.query.direction) ? req.query.direction : null;
  const sort = req.query.sort === 'discussed' ? 'discussed' : 'latest';
  const rel = await relationsFor(req.me.id);
  const where = {
    kind: 'idea',
    deletedAt: null,
    removedAt: null,
    ...(rel.hidden.size ? { authorId: { notIn: [...rel.hidden] } } : {}),
    ...(inst ? { instrument: inst.symbol } : {}),
    ...(status || direction ? { idea: { ...(status === 'active' ? { status: { in: ['open', 'updated'] } } : status ? { status } : {}), ...(direction ? { direction } : {}) } } : {}),
    ...(typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? { createdAt: { lt: new Date(req.query.before) } } : {}),
  };
  const posts = await prisma.post.findMany({ where, orderBy: sort === 'discussed' ? [{ commentCount: 'desc' }, { createdAt: 'desc' }] : { createdAt: 'desc' }, take: 30, include: POST_INCLUDE });
  const views = await postViews(posts, req.me.id);
  res.json({ ideas: views, next: sort === 'latest' && posts.length === 30 ? { before: posts[posts.length - 1].createdAt } : null });
}));

// ── posts ──────────────────────────────────────────────────────────────────

postsRouter.post('/posts', requireProfile, asyncHandler(async (req, res) => {
  const kind = KINDS.includes(req.body?.kind) ? req.body.kind : 'post';
  const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 5000) : '';
  const inst = req.body?.instrument ? instrument(req.body.instrument) : null;
  if (req.body?.instrument && !inst) return res.status(400).json({ error: 'We couldn’t find that market. Choose one from the list.' });
  if ((kind === 'market' || kind === 'idea') && !inst) return res.status(400).json({ error: 'Choose a market.' });
  const topics = [...new Set((Array.isArray(req.body?.topics) ? req.body.topics : []).filter((t) => TOPICS.includes(t)))].slice(0, 3);

  let idea = null;
  if (kind === 'idea') {
    const v = validateIdea(req.body?.idea, inst?.symbol);
    if (v.error) return res.status(400).json({ error: v.error });
    idea = v.idea;
  }
  let poll = null;
  if (kind === 'poll') {
    const question = str(req.body?.poll?.question, 200) || body.slice(0, 200);
    const options = (Array.isArray(req.body?.poll?.options) ? req.body.poll.options : []).map((o) => str(o, 80)).filter(Boolean);
    if (!question || options.length < 2 || options.length > 6) return res.status(400).json({ error: 'A poll needs a question and 2 to 6 options.' });
    const hours = clampInt(req.body?.poll?.closesInHours, 1, 24 * 14, 72);
    poll = { question, options, closesAt: new Date(Date.now() + hours * 3600e3) };
  }
  let news = null;
  if (kind === 'news') {
    news = await prisma.newsItem.findUnique({ where: { id: String(req.body?.newsId ?? '') }, select: { id: true } });
    if (!news) return res.status(400).json({ error: 'Choose the news item to discuss.' });
  }
  if (!body && kind !== 'poll' && kind !== 'idea') return res.status(400).json({ error: 'Write something first.' });
  if (kind === 'question' && body.length < 15) return res.status(400).json({ error: 'Ask a full question (at least 15 characters).' });

  const text = [body, idea?.thesis, poll?.question, ...(poll?.options ?? [])].filter(Boolean).join(' ');
  const screen = screenText(text, { staff: isStaff(req.me) });
  if (screen.blocked) return res.status(400).json({ error: screen.blocked, code: 'blocked_content' });
  const [norm, limited, mentions] = await Promise.all([normalizeAttachments(req.me.id, req.body?.attachments), overLimit('post', req.me.id), resolveMentions(text)]);
  if (norm.error) return res.status(400).json({ error: norm.error });
  if (limited) return res.status(429).json({ error: limited });
  let attachments = norm.attachments;
  // Market posts carry a dated market snapshot.
  if (kind === 'market' && !attachments.some((a) => a.type === 'market')) {
    const withMarket = await normalizeAttachments(req.me.id, [{ type: 'market', symbol: inst.symbol }, ...(req.body?.attachments ?? [])]);
    if (!withMarket.error) attachments = withMarket.attachments;
  }

  const post = await prisma.post.create({
    data: {
      authorId: req.me.id,
      kind,
      body,
      instrument: inst?.symbol ?? null,
      topics,
      attachments,
      newsId: news?.id ?? null,
      mentions,
      flags: screen.flags,
      ...(idea ? { idea: { create: { ...idea, history: [{ status: 'open', at: new Date().toISOString() }] } } } : {}),
      ...(poll ? { poll: { create: { question: poll.question, closesAt: poll.closesAt, options: { create: poll.options.map((label, position) => ({ label, position })) } } } } : {}),
    },
    include: POST_INCLUDE,
  });
  if (news) await prisma.newsItem.update({ where: { id: news.id }, data: { commentCount: { increment: 1 } } });
  const [view] = await postViews([post], req.me.id);
  auditLater(req, kind === 'idea' ? 'community.idea_posted' : 'community.posted', { targetType: 'post', targetId: post.id, actor: req.me, detail: { kind, instrument: post.instrument ?? undefined } });
  res.status(201).json({ post: view });

  waitUntil(
    (async () => {
      await publish([
        { channel: 'community', type: 'post', payload: { postId: post.id, kind, instrument: post.instrument, authorId: req.me.id } },
        ...(post.instrument ? [{ channel: `market:${post.instrument}`, type: 'post', payload: { postId: post.id, kind } }] : []),
      ]);
      const out = mentions.map((userId) => ({ userId, type: 'mention', actorId: req.me.id, title: `${req.me.name} mentioned you in a ${kind === 'idea' ? 'trade idea' : 'post'}`, body: excerpt(body || idea?.thesis, 120), link: postLink(post) }));
      if (kind === 'idea') {
        const followers = await prisma.follow.findMany({ where: { targetType: 'user', targetId: req.me.id }, select: { followerId: true }, take: 2000 });
        for (const f of followers) {
          if (!mentions.includes(f.followerId)) out.push({ userId: f.followerId, type: 'idea', actorId: req.me.id, title: `${req.me.name} shared a ${idea.direction} idea on ${inst.display}`, body: excerpt(idea.thesis, 120), link: postLink(post), groupKey: `idea:${req.me.id}` });
        }
      }
      await notify(out);
      if (screen.flags.some((f) => REVIEW_FLAGS.has(f))) {
        await prisma.report.create({ data: { targetType: 'post', targetId: post.id, targetUserId: req.me.id, category: 'scam', details: `Automatic screening: ${screen.flags.join(', ')}`, auto: true } });
      }
    })().catch((err) => console.error('Post follow-up failed:', err)),
  );
}));

postsRouter.get('/posts/:id', asyncHandler(async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id }, include: POST_INCLUDE });
  if (!post || post.deletedAt) return res.status(404).json({ error: 'This post isn’t available. It may have been deleted.' });
  const [view] = await postViews([post], req.me.id);
  const followers = post.kind === 'idea' ? await prisma.follow.count({ where: { targetType: 'idea', targetId: post.id } }) : 0;
  res.json({ post: view, followers, canEdit: post.authorId === req.me.id, canModerate: isStaff(req.me) });
}));

postsRouter.patch('/posts/:id', requireProfile, asyncHandler(async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post || post.deletedAt || post.removedAt) return res.status(404).json({ error: 'This post isn’t available. It may have been deleted.' });
  if (post.authorId !== req.me.id) return res.status(403).json({ error: 'You can only edit your own posts.' });
  const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 5000) : '';
  if (!body && !['poll', 'idea'].includes(post.kind)) return res.status(400).json({ error: 'A post cannot be empty.' });
  const screen = screenText(body, { staff: isStaff(req.me) });
  if (screen.blocked) return res.status(400).json({ error: screen.blocked, code: 'blocked_content' });
  const updated = await prisma.post.update({ where: { id: post.id }, data: { body, flags: screen.flags, editedAt: new Date() }, include: POST_INCLUDE });
  const [view] = await postViews([updated], req.me.id);
  res.json({ post: view });
}));

postsRouter.delete('/posts/:id', asyncHandler(async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post || post.deletedAt) return res.status(404).json({ error: 'This post isn’t available. It may have been deleted.' });
  const own = post.authorId === req.me.id;
  if (!own && !(await staffOutranks(req.me, post.authorId))) return res.status(403).json({ error: 'You can only delete your own posts.' });
  if (own) {
    await prisma.post.update({ where: { id: post.id }, data: { deletedAt: new Date() } });
    auditLater(req, 'community.post_deleted', { targetType: 'post', targetId: post.id, actor: req.me, detail: { kind: post.kind } });
  }
  else {
    await prisma.post.update({ where: { id: post.id }, data: { removedAt: new Date(), removedById: req.me.id } });
    await prisma.moderationAction.create({ data: { moderatorId: req.me.id, action: 'remove', targetType: 'post', targetId: post.id, targetUserId: post.authorId, reason: str(req.body?.reason, 300) || null } });
    await audit(req, 'community.post_removed', { targetType: 'post', targetId: post.id });
  }
  res.json({ ok: true });
}));

postsRouter.post('/posts/:id/reactions', requireProfile, limit('reaction'), asyncHandler(async (req, res) => {
  const emoji = String(req.body?.emoji ?? 'like');
  if (emoji !== 'like' && !REACTIONS.includes(emoji)) return res.status(400).json({ error: 'That reaction isn’t available.' });
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post || post.deletedAt || post.removedAt) return res.status(404).json({ error: 'This post isn’t available. It may have been deleted.' });
  // Toggle without a read-then-write race; the count is always recomputed.
  const removed = await prisma.postReaction.deleteMany({ where: { postId: post.id, userId: req.me.id, emoji } });
  if (!removed.count) {
    await prisma.postReaction.createMany({ data: [{ postId: post.id, userId: req.me.id, emoji }], skipDuplicates: true });
    if (post.authorId !== req.me.id) await notify([{ userId: post.authorId, type: 'reaction', actorId: req.me.id, title: `${req.me.name} ${post.kind === 'achievement' ? (emoji === '👏' ? 'celebrated' : emoji === '💪' ? 'encouraged you on' : 'reacted to') : 'reacted to'} your ${KIND_NOUN[post.kind] ?? 'post'}`, body: excerpt(post.body, 80), link: postLink(post), groupKey: `react:post:${post.id}` }]);
  }
  const reactions = await prisma.postReaction.findMany({ where: { postId: post.id }, select: { emoji: true, userId: true } });
  await prisma.post.update({ where: { id: post.id }, data: { reactionCount: reactions.length } });
  res.json({ reactions: reactionSummary(reactions, req.me.id), reactionCount: reactions.length });
}));

postsRouter.patch('/ideas/:postId/status', requireProfile, asyncHandler(async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.postId }, include: { idea: true } });
  if (!post?.idea || post.deletedAt || post.removedAt) return res.status(404).json({ error: 'We couldn’t find that trade idea. It may have been deleted.' });
  if (post.authorId !== req.me.id) return res.status(403).json({ error: 'Only the author can update this idea.' });
  const status = req.body?.status;
  if (!IDEA_STATUSES.includes(status)) return res.status(400).json({ error: 'Choose a status from the list.' });
  const note = str(req.body?.note, 1000) || null;
  if (status !== 'open' && !note) return res.status(400).json({ error: 'Add a short note explaining the update.' });
  const screen = screenText(note, { staff: isStaff(req.me) });
  if (screen.blocked) return res.status(400).json({ error: screen.blocked });
  const history = [...(Array.isArray(post.idea.history) ? post.idea.history : []), { status, note, at: new Date().toISOString() }];
  await prisma.tradeIdea.update({ where: { id: post.idea.id }, data: { status, statusNote: note, statusChangedAt: new Date(), history } });
  const followers = await prisma.follow.findMany({ where: { targetType: 'idea', targetId: post.id }, select: { followerId: true } });
  await notify(followers.map((f) => ({ userId: f.followerId, type: 'idea', actorId: req.me.id, title: `${req.me.name} ${STATUS_NEWS[status](instrument(post.idea.instrument)?.display ?? post.idea.instrument)}`, body: excerpt(note, 120), link: postLink(post), groupKey: `ideastatus:${post.id}` })));
  const fresh = await prisma.post.findUnique({ where: { id: post.id }, include: POST_INCLUDE });
  const [view] = await postViews([fresh], req.me.id);
  res.json({ post: view });
}));

postsRouter.post('/polls/:id/vote', requireProfile, limit('reaction'), asyncHandler(async (req, res) => {
  const poll = await prisma.poll.findUnique({ where: { id: req.params.id }, include: { options: true } });
  if (!poll) return res.status(404).json({ error: 'We couldn’t find that poll. It may have been deleted.' });
  if (poll.closesAt && poll.closesAt < new Date()) return res.status(400).json({ error: 'This poll has closed.' });
  const option = poll.options.find((o) => o.id === req.body?.optionId);
  if (!option) return res.status(400).json({ error: 'Choose one of the options.' });
  if (poll.messageId) {
    const msg = await prisma.message.findUnique({ where: { id: poll.messageId }, include: { conversation: true } });
    const { conversationAccess } = await import('../../lib/community/access.js');
    if (!msg || !(await conversationAccess(msg.conversation, req.me)).canRead) return res.status(403).json({ error: 'Join this chat to vote in the poll.' });
  }
  await prisma.$transaction(async (tx) => {
    const prev = await tx.pollVote.findUnique({ where: { pollId_userId: { pollId: poll.id, userId: req.me.id } } });
    if (prev?.optionId === option.id) return;
    if (prev) {
      await tx.pollOption.update({ where: { id: prev.optionId }, data: { voteCount: { decrement: 1 } } });
      await tx.pollVote.update({ where: { id: prev.id }, data: { optionId: option.id } });
    } else await tx.pollVote.create({ data: { pollId: poll.id, optionId: option.id, userId: req.me.id } });
    await tx.pollOption.update({ where: { id: option.id }, data: { voteCount: { increment: 1 } } });
  });
  const { pollViews } = await import('../../lib/community/serialize.js');
  const view = (await pollViews([poll.id], req.me.id)).get(poll.id);
  if (poll.messageId) {
    const msg = await prisma.message.findUnique({ where: { id: poll.messageId }, include: { conversation: true } });
    const { conversationChannels } = await import('../../lib/community/access.js');
    await publish((await conversationChannels(msg.conversation)).map((channel) => ({ channel, type: 'poll', payload: { conversationId: msg.conversationId, messageId: msg.id, poll: { ...view, myVote: null } } })));
  }
  res.json({ poll: view });
}));

// ── comments & challenges ──────────────────────────────────────────────────

async function commentTarget(targetType, targetId) {
  if (targetType === 'post') {
    const p = await prisma.post.findUnique({ where: { id: targetId }, select: { id: true, kind: true, authorId: true, deletedAt: true, removedAt: true, body: true } });
    return p && !p.deletedAt && !p.removedAt ? p : null;
  }
  if (targetType === 'news') return prisma.newsItem.findUnique({ where: { id: targetId }, select: { id: true, headline: true } });
  return null;
}

async function commentViews(comments, viewerId) {
  const [cards, rel] = await Promise.all([userCards(comments.map((c) => c.authorId)), relationsFor(viewerId)]);
  return comments.map((c) => {
    const gone = !!c.deletedAt || !!c.removedById;
    return { id: c.id, targetType: c.targetType, targetId: c.targetId, parentId: c.parentId, author: cards.get(c.authorId) ?? null, hiddenAuthor: rel.hidden.has(c.authorId), body: gone ? '' : c.body, deleted: !!c.deletedAt, removed: !!c.removedById, challengeCategory: c.challengeCategory, warnings: gone ? [] : flagLabels(c.flags), editedAt: c.editedAt, createdAt: c.createdAt, mine: c.authorId === viewerId };
  });
}

postsRouter.get('/comments', asyncHandler(async (req, res) => {
  const targetType = req.query.targetType === 'news' ? 'news' : 'post';
  const targetId = String(req.query.targetId ?? '');
  const challengesOnly = req.query.challenges === '1';
  // Discussion under a deleted or removed post goes with it.
  if (targetType === 'post' && !(await commentTarget('post', targetId))) return res.json({ comments: [] });
  const rows = await prisma.comment.findMany({
    where: { targetType, targetId, ...(challengesOnly ? { challengeCategory: { not: null } } : {}) },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  res.json({ comments: await commentViews(rows, req.me.id) });
}));

postsRouter.post('/comments', requireProfile, asyncHandler(async (req, res) => {
  const targetType = req.body?.targetType === 'news' ? 'news' : 'post';
  const target = await commentTarget(targetType, String(req.body?.targetId ?? ''));
  if (!target) return res.status(404).json({ error: 'This isn’t available any more. It may have been deleted.' });
  const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 3000) : '';
  if (!body) return res.status(400).json({ error: 'Write a comment first.' });
  let challengeCategory = null;
  if (req.body?.challengeCategory) {
    if (targetType !== 'post' || target.kind !== 'idea') return res.status(400).json({ error: 'Only trade ideas can be challenged.' });
    if (!CHALLENGES.includes(req.body.challengeCategory)) return res.status(400).json({ error: 'Choose what you are challenging.' });
    if (body.length < 30) return res.status(400).json({ error: 'Say what you disagree with and why (at least 30 characters).' });
    challengeCategory = req.body.challengeCategory;
  }
  let parent = null;
  if (req.body?.parentId) {
    parent = await prisma.comment.findFirst({ where: { id: String(req.body.parentId), targetType, targetId: target.id }, select: { id: true, authorId: true, parentId: true } });
    if (!parent) return res.status(400).json({ error: 'The comment you’re replying to was deleted.' });
  }
  const screen = screenText(body, { staff: isStaff(req.me) });
  if (screen.blocked) return res.status(400).json({ error: screen.blocked, code: 'blocked_content' });
  const [limited, mentions] = await Promise.all([overLimit('comment', req.me.id), resolveMentions(body)]);
  if (limited) return res.status(429).json({ error: limited });
  const comment = await prisma.comment.create({
    data: { targetType, targetId: target.id, authorId: req.me.id, parentId: parent ? parent.parentId ?? parent.id : null, body, challengeCategory, mentions, flags: screen.flags },
  });
  if (targetType === 'post') await prisma.post.update({ where: { id: target.id }, data: { commentCount: { increment: 1 } } });
  else await prisma.newsItem.update({ where: { id: target.id }, data: { commentCount: { increment: 1 } } });
  const [view] = await commentViews([comment], req.me.id);
  res.status(201).json({ comment: view });

  waitUntil(
    (async () => {
      const link = targetType === 'post' ? `${postLink(target)}?c=${comment.id}` : `/app/community/news/${target.id}?c=${comment.id}`;
      const out = [];
      if (targetType === 'post' && target.authorId !== req.me.id) {
        out.push(
          challengeCategory
            ? { userId: target.authorId, type: 'challenge', actorId: req.me.id, title: `${req.me.name} challenged the ${CHALLENGE_WORDS[challengeCategory] ?? 'reasoning'} in your trade idea`, body: excerpt(body, 120), link }
            : { userId: target.authorId, type: 'comment', actorId: req.me.id, title: `${req.me.name} commented on your ${target.kind === 'idea' ? 'trade idea' : 'post'}`, body: excerpt(body, 120), link, groupKey: `comment:${target.id}` },
        );
      }
      if (parent && parent.authorId !== req.me.id && parent.authorId !== target.authorId) out.push({ userId: parent.authorId, type: 'reply', actorId: req.me.id, title: `${req.me.name} replied to your comment`, body: excerpt(body, 120), link });
      for (const uid of mentions) out.push({ userId: uid, type: 'mention', actorId: req.me.id, title: `${req.me.name} mentioned you in a comment`, body: excerpt(body, 120), link });
      await notify(out);
      await publish({ channel: 'community', type: 'comment', payload: { targetType, targetId: target.id, commentId: comment.id } });
      if (screen.flags.some((f) => REVIEW_FLAGS.has(f))) {
        await prisma.report.create({ data: { targetType: 'comment', targetId: comment.id, targetUserId: req.me.id, category: 'scam', details: `Automatic screening: ${screen.flags.join(', ')}`, auto: true } });
      }
    })().catch((err) => console.error('Comment follow-up failed:', err)),
  );
}));

postsRouter.patch('/comments/:id', requireProfile, asyncHandler(async (req, res) => {
  const c = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!c || c.deletedAt || c.removedById) return res.status(404).json({ error: 'We couldn’t find that comment. It may have been deleted.' });
  if (c.authorId !== req.me.id) return res.status(403).json({ error: 'You can only edit your own comments.' });
  const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 3000) : '';
  if (!body) return res.status(400).json({ error: 'A comment cannot be empty.' });
  const screen = screenText(body, { staff: isStaff(req.me) });
  if (screen.blocked) return res.status(400).json({ error: screen.blocked });
  const updated = await prisma.comment.update({ where: { id: c.id }, data: { body, flags: screen.flags, editedAt: new Date() } });
  const [view] = await commentViews([updated], req.me.id);
  res.json({ comment: view });
}));

postsRouter.delete('/comments/:id', asyncHandler(async (req, res) => {
  const c = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!c || c.deletedAt) return res.status(404).json({ error: 'We couldn’t find that comment. It may have been deleted.' });
  const own = c.authorId === req.me.id;
  if (!own && !(await staffOutranks(req.me, c.authorId))) return res.status(403).json({ error: 'You can only delete your own comments.' });
  if (own) await prisma.comment.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
  else {
    await prisma.comment.update({ where: { id: c.id }, data: { removedById: req.me.id } });
    await prisma.moderationAction.create({ data: { moderatorId: req.me.id, action: 'remove', targetType: 'comment', targetId: c.id, targetUserId: c.authorId, reason: str(req.body?.reason, 300) || null } });
  }
  res.json({ ok: true });
}));

export { trendScore };
