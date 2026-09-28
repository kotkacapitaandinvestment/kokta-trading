import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { cachedSource } from '../../lib/research/cache.js';
import { reserveAiUse, settleAiUse } from '../../lib/aiUsage.js';
import { hit, LIMITS } from '../../lib/rateLimit.js';
import { instrument, instrumentView, marketStatus } from '../../lib/instruments.js';
import { instrumentMarketData } from '../../lib/marketPulse.js';
import { latestReportSummaries } from '../../lib/research/engine.js';
import { conversationAccess } from '../../lib/community/access.js';
import { userCards } from '../../lib/community/users.js';
import { sentimentFor } from '../../lib/community/sentiment.js';
import { eventView } from '../../lib/community/posts.js';
import { eventReaction } from '../../lib/community/events.js';
import { AiUnavailable, summarizeDiscussion, challengeThesis, explainNews, analyzeChart, factCheck, instrumentsIn } from '../../lib/community/ai.js';
import { requireProfile } from './context.js';

export const aiRouter = Router();

// Wraps an AI action: burst limit, daily cap (reserved up front so parallel
// requests can't overshoot it), usage accounting, friendly failures. Cached
// answers cost nothing and release the reservation.
function aiAction(handler) {
  return asyncHandler(async (req, res) => {
    const [max, windowMs] = LIMITS.communityAi;
    if (await hit(`communityAi:${req.me.id}`, max, windowMs)) return res.status(429).json({ error: 'You’re asking Kotka AI a lot right now. Please wait a few minutes.' });
    const { usage, reservation } = await reserveAiUse(req.me.id);
    if (!reservation) return res.status(429).json({ error: "You’ve used today’s Kotka AI requests. More become available overnight.", ...usage });
    const started = Date.now();
    try {
      const out = await handler(req, res);
      if (out === undefined) return void (await settleAiUse(reservation, 'error', 'none', started)); // handler already responded
      await settleAiUse(reservation, out.charged === false ? 'cached' : 'nvidia', out.result?.model ?? 'community', started);
      res.json({ result: out.result, cached: !!out.cached });
    } catch (err) {
      await settleAiUse(reservation, 'error', 'none', started);
      if (err instanceof AiUnavailable) return res.status(503).json({ error: err.message });
      console.error('Community AI failed:', err.message);
      res.status(502).json({ error: 'Kotka AI could not complete that right now. Try again shortly.' });
    }
  });
}

async function transcriptOf(messages) {
  const cards = await userCards(messages.map((m) => m.authorId));
  return messages
    .filter((m) => m.body && !m.deletedAt && !m.removedById && m.kind !== 'system')
    .map((m) => ({ user: cards.get(m.authorId)?.username ?? 'trader', at: m.createdAt.toISOString().slice(0, 16), text: m.body.slice(0, 600) }));
}

// Summarise a conversation (or one thread), or the comments on a post.
aiRouter.post('/ai/summarize', requireProfile, aiAction(async (req, res) => {
  if (req.body?.postId) {
    const post = await prisma.post.findUnique({ where: { id: String(req.body.postId) }, include: { idea: true } });
    if (!post || post.deletedAt || post.removedAt) return void res.status(404).json({ error: 'We couldn’t find that post. It may have been deleted.' });
    const comments = await prisma.comment.findMany({ where: { targetType: 'post', targetId: post.id, deletedAt: null, removedById: null }, orderBy: { createdAt: 'asc' }, take: 200 });
    if (comments.length < 3) return void res.status(400).json({ error: 'There isn’t enough to summarise yet. Try again once there are at least 3 comments.' });
    const transcript = await transcriptOf([{ ...post, body: post.idea ? `${post.idea.direction} thesis: ${post.idea.thesis}` : post.body, kind: 'text' }, ...comments]);
    const key = `community:summary:post:${post.id}:${comments.at(-1).id}`;
    const { data, cached } = await cachedSource(key, 3600e3, () => summarizeDiscussion({ title: post.idea ? `${post.instrument} trade idea` : 'Post discussion', transcript, symbols: [post.instrument, ...instrumentsIn(post.body)].filter(Boolean) }));
    return { result: data, cached, charged: !cached };
  }
  const a = await conversationAccess(String(req.body?.conversationId ?? ''), req.me);
  if (!a.conv || !a.canRead) return void res.status(403).json({ error: a.reason ?? 'We couldn’t find that. It may have been removed.' });
  const thread = req.body?.threadRootId ? String(req.body.threadRootId) : null;
  const where = { conversationId: a.conv.id, deletedAt: null, removedById: null, ...(thread ? { OR: [{ id: thread }, { threadRootId: thread }] } : { threadRootId: null }) };
  const recent = await prisma.message.findMany({ where, orderBy: { createdAt: 'desc' }, take: 150 });
  const messages = recent.reverse();
  if (messages.filter((m) => m.body).length < 5) return void res.status(400).json({ error: 'There isn’t enough to summarise yet. Try again once there are at least 5 messages.' });
  const transcript = await transcriptOf(messages);
  let symbols = a.conv.instrument ? [a.conv.instrument] : instrumentsIn(transcript.map((t) => t.text).join(' '));
  let title = a.conv.name ?? 'Conversation';
  if (a.conv.eventId) {
    const e = await prisma.marketEvent.findUnique({ where: { id: a.conv.eventId } });
    if (e) {
      symbols = e.instruments.slice(0, 3);
      title = `${e.title} (${e.currency}) discussion`;
    }
  }
  const key = `community:summary:conv:${a.conv.id}:${thread ?? 'main'}:${messages.at(-1).id}`;
  const { data, cached } = await cachedSource(key, 3600e3, () => summarizeDiscussion({ title, transcript, symbols }));
  if (a.conv.eventId && !cached) await prisma.marketEvent.update({ where: { id: a.conv.eventId }, data: { summary: data, summaryAt: new Date() } });
  return { result: data, cached, charged: !cached };
}));

aiRouter.post('/ai/challenge', requireProfile, aiAction(async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: String(req.body?.postId ?? '') }, include: { idea: true } });
  if (!post?.idea || post.deletedAt || post.removedAt) return void res.status(404).json({ error: 'We couldn’t find that trade idea. It may have been deleted.' });
  const key = `community:challenge:${post.id}:${post.idea.statusChangedAt?.toISOString() ?? post.createdAt.toISOString()}`;
  const { data, cached } = await cachedSource(key, 6 * 3600e3, () => challengeThesis(post));
  return { result: data, cached, charged: !cached };
}));

aiRouter.post('/ai/explain-news', requireProfile, aiAction(async (req, res) => {
  const n = await prisma.newsItem.findUnique({ where: { id: String(req.body?.newsId ?? '') } });
  if (!n) return void res.status(404).json({ error: 'We couldn’t find that news story. It may have been removed.' });
  if (n.explanation) return { result: n.explanation, cached: true, charged: false };
  const result = await explainNews(n);
  await prisma.newsItem.update({ where: { id: n.id }, data: { explanation: result, explanationModel: result.model, explainedAt: new Date() } });
  return { result };
}));

// Chart images come from message or post attachments the viewer can see.
aiRouter.post('/ai/analyze-chart', requireProfile, aiAction(async (req, res) => {
  const mediaId = String(req.body?.mediaId ?? '');
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media || media.kind !== 'image') return void res.status(404).json({ error: 'We couldn’t find that image. It may have been deleted.' });
  let context = '';
  if (req.body?.messageId) {
    const m = await prisma.message.findUnique({ where: { id: String(req.body.messageId) }, include: { conversation: true } });
    const ok = m && (m.attachments ?? []).some((x) => x.mediaId === mediaId) && (await conversationAccess(m.conversation, req.me)).canRead;
    if (!ok) return void res.status(403).json({ error: 'Kotka AI can only look at images you can see in this conversation or post.' });
    context = m.body;
  } else if (req.body?.postId) {
    const p = await prisma.post.findUnique({ where: { id: String(req.body.postId) } });
    if (!p || p.deletedAt || p.removedAt || !(p.attachments ?? []).some((x) => x.mediaId === mediaId)) return void res.status(403).json({ error: 'Kotka AI can only look at images you can see in this conversation or post.' });
    context = p.body;
  } else if (media.ownerId !== req.me.id) return void res.status(403).json({ error: 'Kotka AI can only look at images you can see in this conversation or post.' });
  const key = `community:chart:${media.id}`;
  const { data, cached } = await cachedSource(key, 7 * 24 * 3600e3, () => analyzeChart({ imageDataUrl: `data:${media.mime};base64,${Buffer.from(media.data).toString('base64')}`, context }));
  return { result: data, cached, charged: !cached };
}));

aiRouter.post('/ai/fact-check', requireProfile, aiAction(async (req, res) => {
  const type = String(req.body?.targetType ?? '');
  const id = String(req.body?.targetId ?? '');
  let text = '';
  let symbols = [];
  if (type === 'message') {
    const m = await prisma.message.findUnique({ where: { id }, include: { conversation: true } });
    if (!m || m.deletedAt || m.removedById || !(await conversationAccess(m.conversation, req.me)).canRead) return void res.status(404).json({ error: 'That message was deleted.' });
    text = m.body;
    symbols = [m.conversation.instrument, ...instrumentsIn(m.body)].filter(Boolean);
  } else if (type === 'post' || type === 'comment') {
    const item = type === 'post' ? await prisma.post.findUnique({ where: { id }, include: { idea: true } }) : await prisma.comment.findUnique({ where: { id } });
    if (!item || item.deletedAt || item.removedAt || item.removedById) return void res.status(404).json({ error: 'We couldn’t find that. It may have been removed.' });
    text = [item.body, item.idea?.thesis].filter(Boolean).join('\n');
    symbols = [item.instrument, ...instrumentsIn(text)].filter(Boolean);
  } else return void res.status(400).json({ error: 'Kotka AI can’t do that for this item.' });
  if (text.trim().length < 20) return void res.status(400).json({ error: 'There aren’t any facts in that for Kotka to check.' });
  const { data, cached } = await cachedSource(`community:factcheck:${type}:${id}:${text.length}`, 3600e3, () => factCheck({ text, symbols }));
  return { result: data, cached, charged: !cached };
}));

// Market context: assembled from data only, no model call.
aiRouter.get('/ai/context/:symbol', asyncHandler(async (req, res) => {
  const inst = instrument(req.params.symbol);
  if (!inst) return res.status(404).json({ error: 'We couldn’t find that market.' });
  const [data, research, sentiment, events] = await Promise.all([
    instrumentMarketData(inst.symbol, { fetch: false }),
    inst.research ? latestReportSummaries().then((m) => m.get(`pair:${inst.research}`) ?? null) : null,
    sentimentFor(inst.symbol),
    prisma.marketEvent.findMany({ where: { cancelled: false, currency: { in: inst.currencies }, scheduledAt: { gte: new Date(Date.now() - 3 * 86400e3), lte: new Date(Date.now() + 7 * 86400e3) } }, orderBy: { scheduledAt: 'asc' }, take: 8 }),
  ]);
  const recent = events.filter((e) => e.scheduledAt < new Date());
  res.json({
    instrument: instrumentView(inst),
    status: marketStatus(inst),
    data: data?.available ? { ...data, history: undefined } : data,
    research: research ? { score: research.score, confidence: research.confidence, condition: research.condition, direction: research.direction, updatedAt: research.createdAt } : null,
    sentiment,
    events: events.map((e) => eventView(e)),
    recentReactions: (await Promise.all(recent.slice(-2).map((e) => eventReaction({ ...e, instruments: [inst.symbol] })))).flat(),
  });
}));
