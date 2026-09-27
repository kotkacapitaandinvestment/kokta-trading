import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { auditLater } from '../../lib/audit.js';
import { overLimit } from '../../lib/community/throttle.js';
import { str } from './context.js';

export const reportsRouter = Router();

export const REPORT_CATEGORIES = ['spam', 'scam', 'harassment', 'hate', 'impersonation', 'fraud', 'manipulation', 'illegal', 'other'];

async function resolveTarget(type, id) {
  switch (type) {
    case 'post': return prisma.post.findUnique({ where: { id }, select: { id: true, authorId: true } }).then((r) => r && { userId: r.authorId });
    case 'comment': return prisma.comment.findUnique({ where: { id }, select: { authorId: true } }).then((r) => r && { userId: r.authorId });
    case 'message': return prisma.message.findUnique({ where: { id }, select: { authorId: true } }).then((r) => r && { userId: r.authorId });
    case 'user': return prisma.user.findUnique({ where: { id }, select: { id: true } }).then((r) => r && { userId: r.id });
    case 'conversation': return prisma.conversation.findUnique({ where: { id }, select: { createdById: true } }).then((r) => r && { userId: r.createdById });
    default: return null;
  }
}

reportsRouter.post('/reports', asyncHandler(async (req, res) => {
  const targetType = String(req.body?.targetType ?? '');
  const targetId = String(req.body?.targetId ?? '');
  const category = String(req.body?.category ?? '');
  if (!REPORT_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Choose what is wrong.' });
  const target = await resolveTarget(targetType, targetId);
  if (!target) return res.status(404).json({ error: 'That item could not be found.' });
  if (target.userId === req.me.id) return res.status(400).json({ error: "You can't report yourself." });
  const limited = await overLimit('report', req.me.id);
  if (limited) return res.status(429).json({ error: 'You have sent a lot of reports today. Our moderators are reviewing them.' });
  const existing = await prisma.report.findFirst({ where: { reporterId: req.me.id, targetType, targetId, status: 'open' } });
  const details = str(req.body?.details, 1000) || null;
  if (existing) await prisma.report.update({ where: { id: existing.id }, data: { category, details: details ?? existing.details } });
  else await prisma.report.create({ data: { reporterId: req.me.id, targetType, targetId, targetUserId: target.userId ?? null, category, details } });
  auditLater(req, 'community.reported', { targetType, targetId, actor: req.me, detail: { category, reportedUserId: target.userId ?? undefined } });
  res.status(201).json({ ok: true, message: 'Thanks. A moderator will review it. You can also block this trader from their profile.' });
}));
