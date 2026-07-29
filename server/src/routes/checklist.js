import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const checklistRouter = Router();
checklistRouter.use(requireAuth);

checklistRouter.get('/:date', async (req, res) => {
  const day = await prisma.checklistDay.findUnique({
    where: { userId_date: { userId: req.userId, date: req.params.date } },
  });
  res.json({ items: day?.items ?? {} });
});

checklistRouter.put('/:date', async (req, res) => {
  const items = req.body?.items ?? {};
  const day = await prisma.checklistDay.upsert({
    where: { userId_date: { userId: req.userId, date: req.params.date } },
    update: { items },
    create: { userId: req.userId, date: req.params.date, items },
  });
  res.json({ items: day.items });
});
