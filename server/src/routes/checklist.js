import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { limit } from '../lib/rateLimit.js';

export const checklistRouter = Router();
checklistRouter.use(requireAuth);

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// A day's checklist is a small map of item id -> ticked. Anything else is dropped.
function cleanItems(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [k, v] of Object.entries(raw).slice(0, 50)) {
    if (/^[A-Za-z0-9_-]{1,40}$/.test(k) && typeof v === 'boolean') out[k] = v;
  }
  return out;
}

checklistRouter.get('/:date', asyncHandler(async (req, res) => {
  if (!isDate(req.params.date)) return res.status(400).json({ error: 'Choose a valid date.' });
  const day = await prisma.checklistDay.findUnique({
    where: { userId_date: { userId: req.userId, date: req.params.date } },
  });
  res.json({ items: day?.items ?? {} });
}));

checklistRouter.put('/:date', limit('checklist'), asyncHandler(async (req, res) => {
  if (!isDate(req.params.date)) return res.status(400).json({ error: 'Choose a valid date.' });
  const items = cleanItems(req.body?.items);
  if (!items) return res.status(400).json({ error: 'That checklist couldn’t be saved. Please try again.' });
  const day = await prisma.checklistDay.upsert({
    where: { userId_date: { userId: req.userId, date: req.params.date } },
    update: { items },
    create: { userId: req.userId, date: req.params.date, items },
  });
  res.json({ items: day.items });
}));
