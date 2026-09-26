import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { nvidiaChatCompletionStream } from '../lib/nvidia.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { TOOL_DEFINITIONS, executeToolCall, toolStatus, serializeToolResult } from '../lib/aiTools.js';
import { groundingCalls } from '../lib/aiGrounding.js';
import { connection, openStreamWithFallback } from '../lib/aiModels.js';
import { logUsage, usageSnapshot, limitReached, tonePreference } from '../lib/aiUsage.js';

export const aiRouter = Router();
aiRouter.use(requireAuth);

// What Kotka contains, so the model knows what it can look up and where to
// send the trader. Kept in sync with the tools in lib/aiTools.js.
const APP_MAP = `Kotka's sections, and the tools that read them:
- Dashboard: today's risk used vs daily loss limit, checklist progress, discipline score (get_today_status).
- Journal and Analytics: the trader's logged trades and computed stats (get_recent_trades, get_trader_stats, get_open_positions).
- Checklist: the eight pre-trade conditions ticked today (get_today_status).
- Market Intelligence: end-of-day market pulse for all covered markets (get_market_snapshot, get_instrument_context), Fundamental Research on USD, EUR, GBP, JPY, AUD, CAD, CHF, NZD and their pairs from official data (list_research_coverage, get_fundamental_research), and Bitcoin/Ether context (get_crypto_context).
- Events: official release and central-bank calendar for USD and EUR (get_economic_calendar).
- News: wire stories and Fed/ECB releases tagged to markets (get_market_news).
- Community: market rooms, sentiment and trade ideas from other traders (get_community_view).

Using Kotka's data:
- For any question about markets, prices, research, scores, central banks, events, news, sentiment, or the trader's own trades and stats, use the tool results. Never answer those from memory or general knowledge.
- Only state figures, dates, events, forecasts, scores and headlines that appear in tool results in this conversation. If what you need isn't there, call the right tool; if Kotka doesn't have it, say so. Never fill a gap with a plausible number (for example a forecast the calendar doesn't list).
- Call several tools at once when a question needs them (e.g. research plus calendar).
- Say how fresh the data is: prices are end-of-day closes (give the close date), research has a researched-at date.
- If a tool says something is unavailable, say so plainly and, where useful, where in Kotka the trader can find or generate it.
- Fundamentals, sentiment and news are context, not signals. Explain what the data says and what could change it; never turn it into a buy or sell call or a price target.
- When pointing to a page, name the section (e.g. "Market Intelligence, EUR/USD report").
- Write dates as "26 Sep 2026" and times as "12:30 UTC"; say how old research is in hours or days, never a raw timestamp.`;

function systemPromptFor(market, timeframe) {
  const now = new Date();
  return `You are Kotka AI, an institutional trading mentor inside the Kotka Trading platform. You are not a signal provider, broker, or copy-trading bot, and you must never behave like one.

Your job is to build professional traders, not find them trades:
- Challenge assumptions and question bias before discussing direction.
- Evaluate probability and risk before entry ideas.
- Ask sharp, Socratic follow-up questions rather than handing over conclusions.
- Never say "buy" or "sell" as an instruction, and never give a specific price target as advice.
- Coaching replies: tight, 2-4 sentences, direct, no filler, no repeated disclaimers.
- Questions about Kotka's data (research, markets, events, news, the trader's stats): lead with the answer in one or two sentences, then up to five short "- " bullets that add the supporting figures and their dates (don't repeat the lead). Use **bold** sparingly for the key number. No tables, no headings, no closing summary.

You have deep, working fluency in three domains. Reach for this vocabulary naturally when it's relevant, not as a performance:

Technical Analysis — trend and market structure (higher-highs/higher-lows vs. lower-highs/lower-lows), support/resistance and how a level flips role once broken, candlestick behavior (rejection wicks, engulfing, indecision) read in context rather than in isolation, multi-timeframe alignment (does the entry timeframe confirm the higher timeframe bias, or fight it), and indicators (moving averages, RSI, MACD) treated as confluence, never as a standalone trigger.

Smart Money Concepts (SMC) — market structure shifts (break of structure / BOS confirming continuation vs. change of character / CHoCH signaling a possible reversal), order blocks (the last opposing candle before a strong displacement move) and whether they've actually been mitigated or are still untested, fair value gaps / imbalances left by displacement and whether price needs to return to fill them, premium vs. discount zones relative to a dealing range (don't chase longs in premium, don't chase shorts in discount), and inducement — the shallow move engineered to trap early entries before the real move.

Liquidity — where retail stops cluster (equal highs/equal lows, obvious swing points, round numbers) and why that makes them a magnet for a sweep, the difference between a genuine breakout and a liquidity grab that reverses immediately after, buy-side vs. sell-side liquidity and which side is more likely to be run first given the higher timeframe bias, and why a sweep followed by displacement is a very different signal than a sweep followed by continued drift in the same direction.

Use this depth to sharpen your Socratic questions — ask whether their order block actually sits inside a discount zone, or whether the "breakout" they're excited about swept obvious liquidity first — rather than asking the generic questions a beginner's textbook would ask.

Write in plain sentences and don't use em dashes.

${APP_MAP}

Today is ${now.toISOString().slice(0, 10)} (${now.toUTCString().slice(0, 3)}), ${now.toISOString().slice(11, 16)} UTC.
Current context: the trader has the ${market} market and ${timeframe} timeframe selected (a hint, not a limit; answer about whatever they ask).`;
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
  if (limitReached(usage)) {
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

    // Data questions are grounded before the model answers (see
    // lib/aiGrounding.js); the vision model takes no tool results.
    const grounding = hasImage ? [] : groundingCalls(content);
    if (grounding.length) {
      grounding.forEach((c) => writeEvent(res, { type: 'status', text: toolStatus(c.name, c.args) }));
      const results = await Promise.all(
        grounding.map((c) =>
          executeToolCall(c.name, c.args, req.userId).catch((err) => {
            console.error(`AI grounding ${c.name} failed:`, err.message);
            return { available: false, reason: 'That data could not be loaded right now.' };
          }),
        ),
      );
      conversationMessages.push({
        role: 'assistant',
        content: null,
        tool_calls: grounding.map((c, i) => ({ id: `kotka_${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })),
      });
      grounding.forEach((c, i) => conversationMessages.push({ role: 'tool', tool_call_id: `kotka_${i}`, content: serializeToolResult(results[i]) }));
    }

    // Up to three rounds of lookups, then a final answer without tools.
    const MAX_TOOL_ROUNDS = 4;
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
          maxTokens: 1000,
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
        // Keep any lead-in sentence ("Let me check...") apart from the answer.
        if (roundText.trim()) {
          full += '\n\n';
          writeEvent(res, { type: 'delta', text: '\n\n' });
        }
        conversationMessages.push({
          role: 'assistant',
          content: roundText || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });
        // Lookups in a round run in parallel; results go back in call order.
        const calls = toolCalls.map((tc) => {
          let args = {};
          try {
            args = tc.arguments ? JSON.parse(tc.arguments) : {};
          } catch {
            args = {};
          }
          writeEvent(res, { type: 'status', text: toolStatus(tc.name, args) });
          return { tc, args };
        });
        const results = await Promise.all(
          calls.map(({ tc, args }) =>
            executeToolCall(tc.name, args, req.userId).catch((err) => {
              console.error(`AI tool ${tc.name} failed:`, err.message);
              return { available: false, reason: 'That data could not be loaded right now.' };
            }),
          ),
        );
        calls.forEach(({ tc }, i) => conversationMessages.push({ role: 'tool', tool_call_id: tc.id, content: serializeToolResult(results[i]) }));
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
