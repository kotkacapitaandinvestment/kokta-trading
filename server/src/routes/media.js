import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { saveMedia, serveMedia, mediaUrl } from '../lib/media.js';
import { overLimit } from '../lib/community/throttle.js';
import { prisma } from '../lib/prisma.js';

export const mediaRouter = Router();
mediaRouter.use(requireAuth);

mediaRouter.post('/', asyncHandler(async (req, res) => {
  const limited = await overLimit('media', req.userId);
  if (limited) return res.status(429).json({ error: limited });
  const { media, error } = await saveMedia(req.userId, req.body ?? {});
  if (error) return res.status(400).json({ error });
  res.status(201).json({ media });
}));

mediaRouter.get('/avatar/:userId', asyncHandler(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { avatarId: true } });
  const m = u?.avatarId ? await prisma.media.findUnique({ where: { id: u.avatarId }, select: { id: true, token: true } }) : null;
  if (!m) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=300');
  res.redirect(302, mediaUrl(m));
}));

mediaRouter.get('/:id/:token', asyncHandler(serveMedia));
