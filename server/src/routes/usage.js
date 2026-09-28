import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { usageSnapshot } from '../lib/usage/index.js';
import { periodBounds } from '../lib/usage/periods.js';

// What the signed-in person has used and has left, for every metered
// feature. Always their own: there is no user parameter to change.
export const usageRouter = Router();
usageRouter.use(requireAuth);

usageRouter.get('/', asyncHandler(async (req, res) => {
  const bounds = periodBounds();
  res.json({
    timezone: 'UTC',
    periods: Object.fromEntries(Object.entries(bounds).map(([p, b]) => [p, { start: b.start.toISOString(), resetAt: b.resetAt.toISOString() }])),
    features: await usageSnapshot(req.userId, { role: req.userRole }),
  });
}));
