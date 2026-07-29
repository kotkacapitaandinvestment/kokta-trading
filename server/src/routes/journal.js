import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const journalRouter = Router();
journalRouter.use(requireAuth);

journalRouter.get('/', async (req, res) => {
  const entries = await prisma.journalEntry.findMany({
    where: { userId: req.userId },
    orderBy: { date: 'desc' },
  });
  res.json({ entries });
});

journalRouter.post('/', async (req, res) => {
  const b = req.body ?? {};
  if (!b.date || !b.market || !b.strategy) {
    return res.status(400).json({ error: 'date, market, and strategy are required.' });
  }

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
      result: b.result ?? 'win',
      pnl: Number(b.pnl) || 0,
      emotionBefore: b.emotionBefore ?? '',
      emotionAfter: b.emotionAfter ?? '',
      confidence: Number(b.confidence) || 0,
      mistakes: b.mistakes ?? '',
      lessons: b.lessons ?? '',
      checklistComplete: !!b.checklistComplete,
    },
  });
  res.status(201).json({ entry });
});
