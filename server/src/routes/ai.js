import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { nvidiaChatCompletionStream } from '../lib/nvidia.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { TOOL_DEFINITIONS, executeToolCall } from '../lib/aiTools.js';
import { connection, openStreamWithFallback } from '../lib/aiModels.js';
import { loadAppSettings, aiDailyLimitFor } from '../lib/appSettings.js';

export const aiRouter = Router();
aiRouter.use(requireAuth);

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

// Daily limits reset at midnight UTC.
function startOfDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const TONES = {
  'Direct & challenging': 'Be direct and challenging: name weak reasoning plainly and push back hard on bias.',
  'Supportive & measured': 'Be supportive and measured: still challenge weak reasoning, but in a calm, encouraging way.',
  'Purely analytical': 'Be purely analytical: stick to structure, probability and risk, with minimal commentary on psychology unless asked.',
};

async function tonePreference(userId) {
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { aiPreferences: true } }).catch(() => null);
  return TONES[settings?.aiPreferences?.tone] ?? null;
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

// usageLimit is null when uncapped. limitKind says why a cap applies: 'plan'
// (free tier, only once paid plans are switched on) or 'fair_use' (everyone,
// to protect the shared model quota).
async function usageSnapshot(userId) {
  const [role, settings] = await Promise.all([getUserRole(userId), loadAppSettings()]);
  const usageLimit = aiDailyLimitFor(role, settings);
  const usageToday = await prisma.aIUsageLog.count({ where: { userId, source: 'nvidia', createdAt: { gte: startOfDay() } } });
  const onFreePlan = settings.paidPlansEnabled && !['premium', 'admin', 'super_admin'].includes(role);
  return { usageToday, usageLimit, limitKind: usageLimit === null ? null : onFreePlan ? 'plan' : 'fair_use', paidPlansEnabled: settings.paidPlansEnabled };
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

  const usage = await usageSnapshot(req.userId);
  if (usage.usageLimit !== null && usage.usageToday >= usage.usageLimit) {
    return res.status(429).json({ error: 'daily_limit_reached', ...usage });
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
    const reply = "Kotka AI isn't connected right now — an admin needs to configure the AI integration.";
    writeEvent(res, { type: 'meta', source: 'unavailable' });
    writeEvent(res, { type: 'delta', text: reply });
    const saved = await prisma.aIMessage.create({ data: { conversationId: conversation.id, role: 'assistant', content: reply } });
    await prisma.aIConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    logUsage(req.userId, 'unavailable', 'none', startedAt);
    writeEvent(res, { type: 'done', messageId: saved.id });
    return res.end();
  }

  // Chat and chart images each walk a chain of vetted models, so a retired
  // or unavailable model falls through to the next one instead of breaking chat.
  const role = hasImage ? 'vision' : 'chat';
  let model = null;
  let modelSettings = null;
  const { apiKey, baseUrl } = connection(integration);
  writeEvent(res, { type: 'meta', source: 'nvidia' });

  let full = '';
  try {
    const conversationMessages = [
      { role: 'system', content: [systemPromptFor(conversation.market, timeframe), await tonePreference(req.userId)].filter(Boolean).join('\n\nCoaching style: ') },
      ...priorMessages.map(toNvidiaMessage),
    ];

    const MAX_TOOL_ROUNDS = 3;
    let round = 0;
    let finalReached = false;

    while (!finalReached && round < MAX_TOOL_ROUNDS) {
      round += 1;
      const isLastAllowedRound = round === MAX_TOOL_ROUNDS;
      let roundText = '';
      let toolCalls = null;

      const makeStream = (m, settings) =>
        nvidiaChatCompletionStream({
          apiKey,
          baseUrl,
          model: m,
          messages: conversationMessages,
          tools: hasImage || isLastAllowedRound ? undefined : TOOL_DEFINITIONS,
          topP: settings.topP,
          extraBody: settings.extraBody,
        });

      const handle = (event) => {
        if (event.type === 'text') {
          roundText += event.text;
          full += event.text;
          writeEvent(res, { type: 'delta', text: event.text });
        } else if (event.type === 'tool_calls') {
          toolCalls = event.toolCalls;
        }
      };

      // A hosted model occasionally answers with nothing at all; retry the
      // round once rather than saving an empty reply.
      for (let attempt = 0; attempt < 2 && !roundText && !toolCalls?.length; attempt++) {
        let gen;
        let first;
        if (!model) {
          ({ gen, first, model, settings: modelSettings } = await openStreamWithFallback(role, integration, makeStream));
        } else {
          gen = makeStream(model, modelSettings);
          first = await gen.next();
        }
        if (!first.done) handle(first.value);
        for await (const event of gen) handle(event);
      }

      if (toolCalls?.length && !isLastAllowedRound) {
        conversationMessages.push({
          role: 'assistant',
          content: roundText || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });
        for (const tc of toolCalls) {
          let args = {};
          try {
            args = tc.arguments ? JSON.parse(tc.arguments) : {};
          } catch {
            args = {};
          }
          const result = await executeToolCall(tc.name, args, req.userId);
          conversationMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }
      } else {
        finalReached = true;
      }
    }

    if (!full.trim()) throw new Error('NVIDIA API error (502): the model returned an empty reply');
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
      logUsage(req.userId, 'error', model ?? 'none', startedAt);
      writeEvent(res, { type: 'done', messageId: saved.id });
    } else {
      const saved = await prisma.aIMessage.create({ data: { conversationId: conversation.id, role: 'assistant', content: full } });
      logUsage(req.userId, 'nvidia', model ?? 'unknown', startedAt);
      writeEvent(res, { type: 'error', message: 'Stream interrupted, but the partial reply was saved.' });
      writeEvent(res, { type: 'done', messageId: saved.id });
    }
  }
  res.end();
}));
