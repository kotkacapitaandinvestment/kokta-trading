import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getMarketPulse, getOfficialCalendar } from '../lib/marketPulse.js';

export const marketDataRouter = Router();
marketDataRouter.use(requireAuth);

marketDataRouter.get('/pulse', asyncHandler(async (req, res) => {
  res.json(await getMarketPulse());
}));

marketDataRouter.get('/calendar', asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 45);
  res.json(await getOfficialCalendar({ days }));
}));
