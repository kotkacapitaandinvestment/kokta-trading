import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { auditLater } from '../lib/audit.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/', asyncHandler(async (req, res) => {
  const settings = await prisma.userSettings.upsert({
    where: { userId: req.userId },
    update: {},
    create: { userId: req.userId },
  });
  res.json({ settings });
}));

const TONES = ['Direct & challenging', 'Supportive & measured', 'Purely analytical'];
const CURRENCIES = ['USD', 'EUR', 'GBP'];

const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
const bool = (v) => (typeof v === 'boolean' ? v : undefined);
const pick = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// Only known keys with sane values are stored; anything else is dropped so a
// half-typed number can't zero out a loss limit.
function clean(body, current) {
  const out = {};
  if (body.notifications && typeof body.notifications === 'object') {
    const n = body.notifications;
    out.notifications = { ...current.notifications, ...pick({ checklist: bool(n.checklist), journal: bool(n.journal), riskWarnings: bool(n.riskWarnings) }) };
  }
  if (body.aiPreferences && typeof body.aiPreferences === 'object') {
    const a = body.aiPreferences;
    out.aiPreferences = { ...current.aiPreferences, ...pick({ tone: TONES.includes(a.tone) ? a.tone : undefined }) };
  }
  if (body.tradingPreferences && typeof body.tradingPreferences === 'object') {
    const t = body.tradingPreferences;
    out.tradingPreferences = {
      ...current.tradingPreferences,
      ...pick({
        baseCurrency: CURRENCIES.includes(t.baseCurrency) ? t.baseCurrency : undefined,
        dailyLossLimit: num(t.dailyLossLimit, 0.1, 100),
        defaultRisk: num(t.defaultRisk, 0.01, 100),
      }),
    };
  }
  return out;
}

settingsRouter.put('/', asyncHandler(async (req, res) => {
  const current = await prisma.userSettings.upsert({ where: { userId: req.userId }, update: {}, create: { userId: req.userId } });
  const { notifications, aiPreferences, tradingPreferences } = clean(req.body ?? {}, current);
  if (tradingPreferences) {
    const was = current.tradingPreferences ?? {};
    const changed = Object.fromEntries(Object.keys(tradingPreferences).filter((k) => tradingPreferences[k] !== was[k]).map((k) => [k, { from: was[k] ?? null, to: tradingPreferences[k] }]));
    if (Object.keys(changed).length) auditLater(req, 'settings.trading_changed', { targetType: 'user', targetId: req.userId, detail: changed });
  }
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
}));
