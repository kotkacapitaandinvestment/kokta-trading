import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { audit } from '../lib/audit.js';
import { waitUntil } from '@vercel/functions';
import { sendPush } from '../lib/push.js';
import { prefsFor } from '../lib/community/users.js';

// Mounted behind requireAuth + requireRole('admin', 'super_admin'). Published
// announcements appear in traders' notifications and on their dashboard.
export const adminAnnouncementsRouter = Router();

export const AUDIENCES = ['All users', 'Traders', 'Premium'];

function clean(body, { partial = false } = {}) {
  const out = {};
  const errors = [];
  if (body.title !== undefined || !partial) {
    const title = typeof body.title === 'string' ? body.title.trim().replace(/\s+/g, ' ') : '';
    if (!title || title.length > 140) errors.push('Title is required (up to 140 characters).');
    else out.title = title;
  }
  if (body.body !== undefined) {
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (text.length > 1000) errors.push('Message must be under 1000 characters.');
    else out.body = text || null;
  }
  if (body.audience !== undefined) {
    if (!AUDIENCES.includes(body.audience)) errors.push('Unknown audience.');
    else out.audience = body.audience;
  }
  if (body.status !== undefined) {
    if (!['draft', 'published'].includes(body.status)) errors.push('Choose Draft or Published.');
    else {
      out.status = body.status;
      out.publishedAt = body.status === 'published' ? new Date() : null;
    }
  }
  return { data: out, errors };
}

adminAnnouncementsRouter.get('/', asyncHandler(async (req, res) => {
  const items = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ items });
}));

adminAnnouncementsRouter.post('/', asyncHandler(async (req, res) => {
  const { data, errors } = clean(req.body ?? {});
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  const item = await prisma.announcement.create({ data: { audience: 'All users', status: 'draft', ...data } });
  await audit(req, 'announcement.created', { targetType: 'announcement', targetId: item.id, detail: { title: item.title } });
  if (item.status === 'published') waitUntil(pushAnnouncement(item));
  res.status(201).json({ item });
}));

adminAnnouncementsRouter.patch('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Announcement not found.' });
  const { data, errors } = clean(req.body ?? {}, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  const item = await prisma.announcement.update({ where: { id: existing.id }, data });
  const action = data.status && data.status !== existing.status ? (data.status === 'published' ? 'announcement.published' : 'announcement.unpublished') : 'announcement.updated';
  await audit(req, action, { targetType: 'announcement', targetId: item.id, detail: { title: item.title } });
  if (action === 'announcement.published') waitUntil(pushAnnouncement(item));
  res.json({ item });
}));

adminAnnouncementsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const removed = await prisma.announcement.delete({ where: { id: req.params.id } }).catch(() => null);
  if (removed) await audit(req, 'announcement.deleted', { targetType: 'announcement', targetId: removed.id, detail: { title: removed.title } });
  res.status(204).end();
}));

function audienceIncludes(audience, role) {
  if (audience === 'All users' || ['admin', 'super_admin'].includes(role)) return true;
  return audience === (role === 'premium' ? 'Premium' : 'Traders');
}

// Push a newly published announcement to devices of everyone in its audience
// who has push on and hasn't switched announcements off.
async function pushAnnouncement(item) {
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { user: { status: 'active' } }, select: { userId: true, user: { select: { role: true } } } });
    const ids = [...new Set(subs.filter((s) => audienceIncludes(item.audience, s.user.role)).map((s) => s.userId))];
    if (!ids.length) return;
    const prefOf = await prefsFor(ids);
    await sendPush(ids.filter((id) => prefOf(id).push.announcements !== false).map((userId) => ({ userId, title: item.title, body: item.body ?? '', link: '/app/notifications', tag: `announcement:${item.id}` })));
  } catch (err) {
    console.warn('[push] announcement', err.message);
  }
}

// Announcements a given role should see, newest first.
export async function announcementsFor(role, { sinceDays = 30 } = {}) {
  const audiences = ['admin', 'super_admin'].includes(role) ? AUDIENCES : ['All users', role === 'premium' ? 'Premium' : 'Traders'];
  return prisma.announcement.findMany({
    where: { status: 'published', audience: { in: audiences }, publishedAt: { gte: new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000) } },
    orderBy: { publishedAt: 'desc' },
    take: 10,
    select: { id: true, title: true, body: true, publishedAt: true },
  });
}
