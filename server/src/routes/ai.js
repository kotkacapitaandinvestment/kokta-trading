import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { decryptSecret } from '../lib/crypto.js';
import { nvidiaChatCompletionStream } from '../lib/nvidia.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const aiRouter = Router();
aiRouter.use(requireAuth);

const DAILY_LIMIT = 10;
const PREMIUM_ROLES = ['premium', 'admin', 'super_admin'];

function systemPromptFor(market, timeframe) {
  return `You are Kotka AI, an institutional trading mentor inside the Kotka Trading platform. You are not a signal provider, broker, or copy-trading bot, and you must never behave like one.

Your job is to build professional traders, not find them trades:
- Challenge assumptions and question bias before discussing direction.
- Evaluate probability and risk before entry ideas.
- Ask sharp, Socratic follow-up questions rather than handing over conclusions.
- Never say "buy" or "sell" as an instruction, and never give a specific price target as advice.
- Keep responses tight: 2-4 sentences, direct, no filler, no disclaimers about not being financial advice repeated every message.

You have deep, working fluency in three domains. Reach for this vocabulary naturally when it's relevant, not as a performance:

Technical Analysis — trend and market structure (higher-highs/higher-lows vs. lower-highs/lower-lows), support/resistance and how a level flips role once broken, candlestick behavior (rejection wicks, engulfing, indecision) read in context rather than in isolation, multi-timeframe alignment (does the entry timeframe confirm the higher timeframe bias, or fight it), and indicators (moving averages, RSI, MACD) treated as confluence, never as a standalone trigger.

Smart Money Concepts (SMC) — market structure shifts (break of structure / BOS confirming continuation vs. change of character / CHoCH signaling a possible reversal), order blocks (the last opposing candle before a strong displacement move) and whether they've actually been mitigated or are still untested, fair value gaps / imbalances left by displacement and whether price needs to return to fill them, premium vs. discount zones relative to a dealing range (don't chase longs in premium, don't chase shorts in discount), and inducement — the shallow move engineered to trap early entries before the real move.

Liquidity — where retail stops cluster (equal highs/equal lows, obvious swing points, round numbers) and why that makes them a magnet for a sweep, the difference between a genuine breakout and a liquidity grab that reverses immediately after, buy-side vs. sell-side liquidity and which side is more likely to be run first given the higher timeframe bias, and why a sweep followed by displacement is a very different signal than a sweep followed by continued drift in the same direction.

Use this depth to sharpen your Socratic questions — ask whether their order block actually sits inside a discount zone, or whether the "breakout" they're excited about swept obvious liquidity first — rather than asking the generic questions a beginner's textbook would ask.

Current context: the trader is discussing the ${market} market on the ${timeframe} timeframe.`;
}

function logUsage(userId, source, model, startedAt) {
  const latencyMs = Date.now() - startedAt;
  prisma.aIUsageLog.create({ data: { userId, source, model, latencyMs } }).catch((err) => {
    console.error('Failed to record AI usage log:', err.message);
  });
}

function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toNvidiaMessage(m) {
  if (!m.image) return { role: m.role, content: m.content };
  return {
    role: m.role,
    content: [
      { type: 'text', text: m.content },
      { type: 'image_url', image_url: { url: m.image } },
    ],
  };
}

async function getUserRole(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role ?? 'trader';
}

async function usageSnapshot(userId) {
  const role = await getUserRole(userId);
  const isPremium = PREMIUM_ROLES.includes(role);
  const usageToday = await prisma.aIUsageLog.count({ where: { userId, createdAt: { gte: startOfDay() } } });
  return { usageToday, usageLimit: isPremium ? null : DAILY_LIMIT, isPremium };
}

async function loadOwnedConversation(id, userId) {
  const conversation = await prisma.aIConversation.findUnique({ where: { id } });
  if (!conversation || conversation.userId !== userId) return null;
  return conversation;
}

function writeEvent(res, event) {
  res.write(`${JSON.stringify(event)}\n`);
}

aiRouter.get('/usage', asyncHandler(async (req, res) => {
  res.json(await usageSnapshot(req.userId));
}));

aiRouter.get('/conversations', asyncHandler(async (req, res) => {
  const conversations = await prisma.aIConversation.findMany({
    where: { userId: req.userId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ conversations });
}));

aiRouter.get('/conversations/:id', asyncHandler(async (req, res) => {
  const conversation = await loadOwnedConversation(req.params.id, req.userId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  const messages = await prisma.aIMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ conversation, messages });
}));

aiRouter.post('/conversations', asyncHandler(async (req, res) => {
  const { market = 'Forex' } = req.body ?? {};
  const conversation = await prisma.aIConversation.create({
    data: { userId: req.userId, market },
  });
  res.status(201).json({ conversation });
}));

aiRouter.patch('/conversations/:id', asyncHandler(async (req, res) => {
  const existing = await loadOwnedConversation(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Conversation not found.' });

  const { title, market, favorite } = req.body ?? {};
  const conversation = await prisma.aIConversation.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(market !== undefined ? { market } : {}),
      ...(typeof favorite === 'boolean' ? { favorite } : {}),
    },
  });
  res.json({ conversation });
}));

aiRouter.post('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const conversation = await loadOwnedConversation(req.params.id, req.userId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

  const { content, image, timeframe = '15m' } = req.body ?? {};
  if (!content && !image) return res.status(400).json({ error: 'A message or image is required.' });

  const { usageToday, usageLimit, isPremium } = await usageSnapshot(req.userId);
  if (!isPremium && usageToday >= DAILY_LIMIT) {
    return res.status(429).json({ error: 'daily_limit_reached', usageToday, usageLimit });
  }

  await prisma.aIMessage.create({
    data: { conversationId: conversation.id, role: 'user', content: content ?? '', image: image ?? null },
  });

  const priorMessages = await prisma.aIMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
  });

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const startedAt = Date.now();
  const integration = await prisma.integration.findUnique({ where: { provider: 'nvidia' } });
  const hasImage = priorMessages.some((m) => m.image);

  if (!integration || !integration.enabled || !integration.secretCipher) {
    const reply = "Kotka AI isn't connected right now — an admin needs to configure the NVIDIA integration.";
    writeEvent(res, { type: 'meta', source: 'mock' });
    writeEvent(res, { type: 'delta', text: reply });
    const saved = await prisma.aIMessage.create({ data: { conversationId: conversation.id, role: 'assistant', content: reply } });
    await prisma.aIConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    logUsage(req.userId, 'mock', 'scripted-mentor', startedAt);
    writeEvent(res, { type: 'done', messageId: saved.id });
    return res.end();
  }

  if (hasImage && !integration.config?.visionModel) {
    const reply = "Chart image analysis isn't configured yet — ask your admin to set a vision model for NVIDIA in Integrations.";
    writeEvent(res, { type: 'meta', source: 'vision_unconfigured' });
    writeEvent(res, { type: 'delta', text: reply });
    const saved = await prisma.aIMessage.create({ data: { conversationId: conversation.id, role: 'assistant', content: reply } });
    await prisma.aIConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    logUsage(req.userId, 'vision_unconfigured', 'none', startedAt);
    writeEvent(res, { type: 'done', messageId: saved.id });
    return res.end();
  }

  const model = hasImage ? integration.config.visionModel : integration.config?.model;
  writeEvent(res, { type: 'meta', source: 'nvidia' });

  let full = '';
  try {
    for await (const delta of nvidiaChatCompletionStream({
      apiKey: decryptSecret(integration.secretCipher),
      baseUrl: integration.config?.baseUrl,
      model,
      messages: [
        { role: 'system', content: systemPromptFor(conversation.market, timeframe) },
        ...priorMessages.map(toNvidiaMessage),
      ],
    })) {
      full += delta;
      writeEvent(res, { type: 'delta', text: delta });
    }
    const saved = await prisma.aIMessage.create({ data: { conversationId: conversation.id, role: 'assistant', content: full } });
    await prisma.aIConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    logUsage(req.userId, 'nvidia', model, startedAt);
    writeEvent(res, { type: 'done', messageId: saved.id });
  } catch (err) {
    console.error('NVIDIA streaming completion failed:', err.message);
    if (!full) {
      const reply = 'Kotka AI ran into an error reaching the model. Try again shortly.';
      writeEvent(res, { type: 'delta', text: reply });
      const saved = await prisma.aIMessage.create({ data: { conversationId: conversation.id, role: 'assistant', content: reply } });
      logUsage(req.userId, 'mock', 'scripted-mentor', startedAt);
      writeEvent(res, { type: 'done', messageId: saved.id });
    } else {
      const saved = await prisma.aIMessage.create({ data: { conversationId: conversation.id, role: 'assistant', content: full } });
      logUsage(req.userId, 'nvidia', model, startedAt);
      writeEvent(res, { type: 'error', message: 'Stream interrupted, but the partial reply was saved.' });
      writeEvent(res, { type: 'done', messageId: saved.id });
    }
  }
  res.end();
}));
