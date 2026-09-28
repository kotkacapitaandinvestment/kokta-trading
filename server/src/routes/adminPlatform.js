import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { loadAppSettings, sanitizeAppSettings, saveAppSettings, appSettingsMeta } from '../lib/appSettings.js';
import { audit } from '../lib/audit.js';

// Mounted behind requireAuth + requireRole('admin', 'super_admin').
export const adminPlatformRouter = Router();

adminPlatformRouter.get('/settings', asyncHandler(async (req, res) => {
  const settings = await loadAppSettings();
  const meta = appSettingsMeta();
  const updatedBy = meta.updatedBy ? await prisma.user.findUnique({ where: { id: meta.updatedBy }, select: { name: true, email: true } }) : null;
  res.json({ settings, updatedAt: meta.updatedAt, updatedBy, canEdit: req.user.role === 'super_admin' });
}));

adminPlatformRouter.put('/settings', asyncHandler(async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Only a super admin can change platform settings.' });
  const current = await loadAppSettings();
  const { settings, error } = sanitizeAppSettings(req.body ?? {}, current);
  if (error) return res.status(400).json({ error });
  const changed = Object.fromEntries(Object.keys(settings).filter((k) => settings[k] !== current[k]).map((k) => [k, { from: current[k], to: settings[k] }]));
  const saved = await saveAppSettings(settings, req.user.id);
  if (Object.keys(changed).length) await audit(req, 'platform.settings_updated', { targetType: 'app_settings', targetId: 'singleton', detail: changed });
  res.json({ settings: saved, updatedAt: new Date(), updatedBy: { name: req.user.name, email: req.user.email }, canEdit: true });
}));

adminPlatformRouter.get('/audit-logs', asyncHandler(async (req, res) => {
  const take = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  // One or more actions or prefixes ("auth." = every sign-in event), comma-separated.
  const actions = typeof req.query.action === 'string' && /^[a-z_.,]{1,400}$/.test(req.query.action) ? req.query.action.split(',').filter(Boolean) : [];
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const userId = typeof req.query.user === 'string' && /^[a-z0-9]{10,40}$/i.test(req.query.user) ? req.query.user : null;
  const cursor = typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : null;
  const where = {
    AND: [
      actions.length ? { OR: actions.map((a) => (a.endsWith('.') || a.endsWith('_') ? { action: { startsWith: a } } : { action: a })) } : {},
      q ? { actorEmail: { contains: q, mode: 'insensitive' } } : {},
      // One person's history: what they did, and what was done to their account.
      userId ? { OR: [{ actorId: userId }, { targetType: 'user', targetId: userId }] } : {},
    ],
  };
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const logs = rows.slice(0, take);
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set([...logs.map((l) => l.actorId), userId].filter(Boolean))] } }, select: { id: true, name: true, email: true, role: true } });
  const byId = new Map(people.map((p) => [p.id, p]));
  const counts = await prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { action: 'asc' } });
  res.json({
    logs: logs.map((l) => ({ ...l, actorName: byId.get(l.actorId)?.name ?? null, actorRole: byId.get(l.actorId)?.role ?? null })),
    nextCursor: hasMore ? logs[logs.length - 1].id : null,
    actions: counts.map((a) => ({ action: a.action, count: a._count._all })),
    user: userId ? byId.get(userId) ?? null : null,
  });
}));
