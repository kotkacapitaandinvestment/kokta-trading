import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { userCards } from '../../lib/community/users.js';
import { clampInt } from './context.js';

export const notificationsRouter = Router();

notificationsRouter.get('/notifications', asyncHandler(async (req, res) => {
  const limit = clampInt(req.query.limit, 5, 100, 40);
  const rows = await prisma.notification.findMany({
    where: { userId: req.me.id, ...(req.query.unread === '1' ? { readAt: null } : {}), ...(typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? { updatedAt: { lt: new Date(req.query.before) } } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
  const cards = await userCards(rows.map((r) => r.actorId));
  res.json({
    notifications: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, count: n.count, actor: n.actorId ? cards.get(n.actorId) ?? null : null, read: !!n.readAt, at: n.updatedAt })),
    unread: await prisma.notification.count({ where: { userId: req.me.id, readAt: null } }),
    next: rows.length === limit ? { before: rows[rows.length - 1].updatedAt } : null,
  });
}));

notificationsRouter.post('/notifications/read', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 200) : null;
  await prisma.notification.updateMany({ where: { userId: req.me.id, readAt: null, ...(ids && !req.body?.all ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
  res.json({ unread: await prisma.notification.count({ where: { userId: req.me.id, readAt: null } }) });
}));
