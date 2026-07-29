import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const simulatorRouter = Router();
simulatorRouter.use(requireAuth);

simulatorRouter.post('/sessions', asyncHandler(async (req, res) => {
  const { difficulty, overall, isBest } = req.body ?? {};
  if (!difficulty || typeof overall !== 'number') {
    return res.status(400).json({ error: 'difficulty and overall score are required.' });
  }

  const session = await prisma.simulatorSession.create({
    data: { userId: req.userId, difficulty, overall, isBest: !!isBest },
  });
  res.status(201).json({ session });
}));
