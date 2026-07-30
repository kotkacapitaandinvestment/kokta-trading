import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { decryptSecret } from '../lib/crypto.js';
import { MASSIVE_SYMBOLS, fetchHistoricalBars } from '../lib/massive.js';
import { nvidiaChatCompletion } from '../lib/nvidia.js';

export const journalRouter = Router();
journalRouter.use(requireAuth);

const REPLAY_TIMEFRAME = { multiplier: 5, unit: 'minute' };

async function getEnabledIntegration(provider) {
  const row = await prisma.integration.findUnique({ where: { provider } });
  return row && row.enabled && row.secretCipher ? row : null;
}

async function fetchReplayBars(entry) {
  const mapped = MASSIVE_SYMBOLS[entry.market];
  if (!mapped) return { live: false, reason: 'unsupported_market', bars: [] };

  const massiveRow = await getEnabledIntegration('massive');
  if (!massiveRow) return { live: false, reason: 'market_data_not_configured', bars: [] };

  const [ticker] = mapped;
  const from = entry.date;
  const toDate = entry.closedAt
    ? new Date(entry.closedAt)
    : new Date(new Date(`${entry.date}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000);
  const to = toDate.toISOString().slice(0, 10);

  try {
    const apiKey = decryptSecret(massiveRow.secretCipher);
    const bars = await fetchHistoricalBars(apiKey, ticker, REPLAY_TIMEFRAME.multiplier, REPLAY_TIMEFRAME.unit, from, to);
    if (!bars.length) return { live: false, reason: 'no_data_for_range', bars: [] };
    return { live: true, ticker, bars };
  } catch (err) {
    console.error(`Replay bar fetch failed for ${ticker}:`, err.message);
    return { live: false, reason: 'fetch_failed', bars: [] };
  }
}

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
    return res.status(400).json({ error: 'date, market, and strategy are required.' });
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
  res.json({ entry });
}));

journalRouter.get('/:id/replay', asyncHandler(async (req, res) => {
  const entry = await prisma.journalEntry.findUnique({ where: { id: req.params.id } });
  if (!entry || entry.userId !== req.userId) {
    return res.status(404).json({ error: 'Journal entry not found.' });
  }
  const result = await fetchReplayBars(entry);
  res.json(result);
}));

function critiquePrompt(entry, priceContext) {
  return `You are Kotka AI, an institutional trading mentor. Critique this real logged trade in 2-4 tight, direct sentences — no filler, no repeated disclaimers.

Trade: ${entry.direction} ${entry.market}, ${entry.session} session, strategy "${entry.strategy}".
Entry ${entry.entry}, stop loss ${entry.stopLoss}, take profit ${entry.takeProfit}, risk ${entry.risk}, reward ${entry.reward}.
Result: ${entry.result ?? 'still open'}${entry.pnl != null ? `, P&L ${entry.pnl}` : ''}.
Trader's confidence at entry: ${entry.confidence}/10. Emotion before: ${entry.emotionBefore || 'not recorded'}.
Trader's own notes — mistakes: "${entry.mistakes || 'none recorded'}". Lessons: "${entry.lessons || 'none recorded'}".
${priceContext}`;
}

journalRouter.post('/:id/critique', asyncHandler(async (req, res) => {
  const entry = await prisma.journalEntry.findUnique({ where: { id: req.params.id } });
  if (!entry || entry.userId !== req.userId) {
    return res.status(404).json({ error: 'Journal entry not found.' });
  }

  const replay = await fetchReplayBars(entry);
  let priceContext = 'Real intraday price data for this trade is not available.';
  if (replay.live && replay.bars.length >= 2) {
    const first = replay.bars[0];
    const last = replay.bars[replay.bars.length - 1];
    const pctMove = Math.round(((last.c - first.o) / first.o) * 10000) / 100;
    priceContext = `Real price data: ${entry.market} moved ${pctMove >= 0 ? '+' : ''}${pctMove}% from the open of ${entry.date} to the close of the window fetched.`;
  }

  const nvidiaRow = await getEnabledIntegration('nvidia');
  if (!nvidiaRow) {
    return res.json({ source: 'mock', critique: 'Configure the NVIDIA integration in Admin to get a real, trade-specific critique here.' });
  }

  try {
    const critique = await nvidiaChatCompletion({
      apiKey: decryptSecret(nvidiaRow.secretCipher),
      baseUrl: nvidiaRow.config?.baseUrl,
      model: nvidiaRow.config?.model,
      messages: [{ role: 'user', content: critiquePrompt(entry, priceContext) }],
      maxTokens: 300,
    });
    res.json({ source: 'nvidia', critique });
  } catch (err) {
    console.error('Journal critique failed:', err.message);
    res.json({ source: 'mock', critique: 'Could not reach Kotka AI for a live critique right now. Try again shortly.' });
  }
}));
