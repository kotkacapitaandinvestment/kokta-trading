import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';

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
