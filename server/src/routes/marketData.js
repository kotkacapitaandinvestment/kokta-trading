import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getMarketSnapshot } from '../lib/marketSnapshot.js';

export const marketDataRouter = Router();
marketDataRouter.use(requireAuth);

marketDataRouter.get('/snapshot', asyncHandler(async (req, res) => {
  res.json(await getMarketSnapshot());
}));
