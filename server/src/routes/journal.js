import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { auditLater } from '../lib/audit.js';
import { nvidiaChatCompletion } from '../lib/nvidia.js';
import { connection, withModelFallback } from '../lib/aiModels.js';
import { logUsage, usageSnapshot, limitReached, tonePreference } from '../lib/aiUsage.js';

export const journalRouter = Router();
journalRouter.use(requireAuth);

journalRouter.get('/', asyncHandler(async (req, res) => {
  const entries = await prisma.journalEntry.findMany({
    where: { userId: req.userId },
    orderBy: { date: 'desc' },
  });
  res.json({ entries });
}));

journalRouter.post('/', asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  if (!b.date || !b.market || !b.strategy) {
    return res.status(400).json({ error: 'Add the date, market and strategy for this trade.' });
  }

  const isOpen = b.positionStatus === 'open';

  const entry = await prisma.journalEntry.create({
    data: {
      userId: req.userId,
      date: b.date,
      market: b.market,
      session: b.session ?? '',
      strategy: b.strategy,
      direction: b.direction ?? 'Long',
      entry: Number(b.entry) || 0,
      stopLoss: Number(b.stopLoss) || 0,
      takeProfit: Number(b.takeProfit) || 0,
      risk: Number(b.risk) || 0,
      reward: Number(b.reward) || 0,
      result: isOpen ? null : (b.result ?? 'win'),
      pnl: isOpen ? null : (Number(b.pnl) || 0),
      emotionBefore: b.emotionBefore ?? '',
      emotionAfter: isOpen ? null : (b.emotionAfter ?? ''),
      confidence: Number(b.confidence) || 0,
      mistakes: b.mistakes ?? '',
      lessons: b.lessons ?? '',
      checklistComplete: !!b.checklistComplete,
      positionStatus: isOpen ? 'open' : 'closed',
    },
  });
  auditLater(req, isOpen ? 'journal.position_opened' : 'journal.trade_logged', { targetType: 'journal', targetId: entry.id, detail: { market: entry.market, direction: entry.direction, ...(isOpen ? {} : { result: entry.result }) } });
  res.status(201).json({ entry });
}));

journalRouter.patch('/:id/close', asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const existing = await prisma.journalEntry.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.userId) {
    return res.status(404).json({ error: 'Journal entry not found.' });
  }
  if (existing.positionStatus === 'closed') {
    return res.status(400).json({ error: 'This position is already closed.' });
  }

  const entry = await prisma.journalEntry.update({
    where: { id: req.params.id },
    data: {
      positionStatus: 'closed',
      result: b.result ?? 'win',
      pnl: Number(b.pnl) || 0,
      reward: Number(b.reward) || existing.reward,
      emotionAfter: b.emotionAfter ?? '',
      mistakes: b.mistakes ?? existing.mistakes,
      lessons: b.lessons ?? existing.lessons,
      closedAt: new Date(),
    },
  });
  auditLater(req, 'journal.position_closed', { targetType: 'journal', targetId: existing.id, detail: { market: existing.market } });
  res.json({ entry });
}));

// ── Kotka AI trade review ─────────────────────────────────────────────────
// Written on request from the entry itself plus the trader's recent record,
// then saved with the entry. Mentor feedback on process only, never a signal.
const REVIEW_SYSTEM = `You are Kotka AI, an institutional trading mentor reviewing one journal entry for a trader. You are not a signal provider: never suggest entries, exits, targets, direction or what to trade next.

Review the process, not the outcome. In 90 to 150 words of plain prose (no headings, no bullet points, no markdown):
- judge whether the plan was sound (defined stop, reward-to-risk, checklist, confidence vs. result);
- connect it to the trader's recent record when the numbers show a pattern (for example repeated losses without a complete checklist, or emotions that recur before losing trades);
- end with one concrete, process-level question or habit for the next trade.

Speak to the trader directly as "you". Use only the facts given. If a field is empty, don't invent it. Refer to numbers exactly as given. Don't use em dashes.`;

function describeEntry(e) {
  const rr = e.risk > 0 ? (e.reward / e.risk).toFixed(2) : 'not recorded';
  return [
    `Date: ${e.date}; market: ${e.market}; session: ${e.session || 'not recorded'}; strategy: ${e.strategy}; direction: ${e.direction}.`,
    `Entry ${e.entry}, stop ${e.stopLoss}, target ${e.takeProfit}; planned risk ${e.risk}R, planned reward ${e.reward}R (reward-to-risk ${rr}).`,
    e.positionStatus === 'open' ? 'The position is still open.' : `Result: ${e.result}; P&L: ${e.pnl}.`,
    `Pre-trade checklist complete: ${e.checklistComplete ? 'yes' : 'no'}. Confidence: ${e.confidence}/10.`,
    `Emotion before: ${e.emotionBefore || 'not recorded'}; after: ${e.emotionAfter || 'not recorded'}.`,
    `Mistakes noted by the trader: ${e.mistakes || 'none recorded'}.`,
    `Lessons noted by the trader: ${e.lessons || 'none recorded'}.`,
  ].join('\n');
}

function describeRecord(entries) {
  const closed = entries.filter((e) => e.positionStatus !== 'open' && e.result);
  if (closed.length < 3) return `Recent record: only ${closed.length} closed trade(s), too few for patterns.`;
  const wins = closed.filter((e) => e.result === 'win').length;
  const losses = closed.filter((e) => e.result === 'loss');
  const noChecklistLosses = losses.filter((e) => !e.checklistComplete).length;
  const emotions = {};
  for (const e of losses) if (e.emotionBefore) emotions[e.emotionBefore] = (emotions[e.emotionBefore] ?? 0) + 1;
  const topEmotion = Object.entries(emotions).sort((a, b) => b[1] - a[1])[0];
  return [
    `Recent record (last ${closed.length} closed trades): ${wins} wins, ${losses.length} losses.`,
    `Losses taken without a complete checklist: ${noChecklistLosses} of ${losses.length}.`,
    topEmotion ? `Most common emotion before a loss: ${topEmotion[0]} (${topEmotion[1]} times).` : null,
  ].filter(Boolean).join('\n');
}

journalRouter.post('/:id/review', asyncHandler(async (req, res) => {
  const entry = await prisma.journalEntry.findUnique({ where: { id: req.params.id } });
  if (!entry || entry.userId !== req.userId) return res.status(404).json({ error: 'Journal entry not found.' });

  const usage = await usageSnapshot(req.userId);
  if (limitReached(usage)) return res.status(429).json({ error: "You’ve used today’s Kotka AI requests. More become available overnight.", ...usage });

  const integration = await prisma.integration.findUnique({ where: { provider: 'nvidia' } });
  if (!integration?.enabled || !integration.secretCipher) return res.status(503).json({ error: 'Kotka AI is not connected right now.' });

  const recent = await prisma.journalEntry.findMany({ where: { userId: req.userId, id: { not: entry.id } }, orderBy: { date: 'desc' }, take: 30 });
  const tone = await tonePreference(req.userId);
  const { apiKey, baseUrl } = connection(integration);
  const startedAt = Date.now();

  let review;
  let model;
  try {
    ({ result: review, model } = await withModelFallback('chat', integration, async (m, settings) => {
      const text = await nvidiaChatCompletion({
        apiKey,
        baseUrl,
        model: m,
        messages: [
          { role: 'system', content: tone ? `${REVIEW_SYSTEM}\n\nCoaching style: ${tone}` : REVIEW_SYSTEM },
          { role: 'user', content: `${describeEntry(entry)}\n\n${describeRecord(recent)}` },
        ],
        maxTokens: 450,
        temperature: 0.4,
        topP: settings.topP,
        extraBody: settings.extraBody,
        timeoutMs: 45000,
      });
      const clean = String(text ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (clean.length < 40) throw new Error('NVIDIA API error (502): empty review');
      return clean;
    }));
  } catch (err) {
    console.error('Journal review failed:', err.message);
    return res.status(502).json({ error: 'Kotka AI could not review this trade right now. Try again shortly.' });
  }

  logUsage(req.userId, 'nvidia', model, startedAt);
  const updated = await prisma.journalEntry.update({ where: { id: entry.id }, data: { aiReview: review, aiReviewModel: model, aiReviewAt: new Date() } });
  res.json({ entry: updated });
}));
