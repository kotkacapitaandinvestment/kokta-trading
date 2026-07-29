import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/', async (req, res) => {
  const settings = await prisma.userSettings.upsert({
    where: { userId: req.userId },
    update: {},
    create: { userId: req.userId },
  });
  res.json({ settings });
});

settingsRouter.put('/', async (req, res) => {
  const { notifications, aiPreferences, tradingPreferences } = req.body ?? {};
  const settings = await prisma.userSettings.upsert({
    where: { userId: req.userId },
    update: {
      ...(notifications ? { notifications } : {}),
      ...(aiPreferences ? { aiPreferences } : {}),
      ...(tradingPreferences ? { tradingPreferences } : {}),
    },
    create: {
      userId: req.userId,
      notifications: notifications ?? undefined,
      aiPreferences: aiPreferences ?? undefined,
      tradingPreferences: tradingPreferences ?? undefined,
    },
  });
  res.json({ settings });
});
