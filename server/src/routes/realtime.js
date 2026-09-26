import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { openStream } from '../lib/realtime.js';
import { prisma } from '../lib/prisma.js';
import { instrument } from '../lib/instruments.js';
import { isPublicConversation } from '../lib/community/access.js';
import { touchPresence } from '../lib/community/users.js';

export const realtimeRouter = Router();
realtimeRouter.use(requireAuth);

// GET /api/realtime/stream?channels=conv:<id>,market:EURUSD
// The user's private channel is always included. Private conversations are
// delivered through it, so only public conversation channels are accepted.
realtimeRouter.get('/stream', asyncHandler(async (req, res) => {
  const requested = String(req.query.channels ?? '').split(',').map((c) => c.trim()).filter(Boolean).slice(0, 12);
  const channels = [`user:${req.userId}`];
  const convIds = requested.filter((c) => c.startsWith('conv:')).map((c) => c.slice(5));
  if (convIds.length) {
    const convs = await prisma.conversation.findMany({ where: { id: { in: convIds } }, select: { id: true, kind: true, visibility: true } });
    for (const c of convs) if (isPublicConversation(c)) channels.push(`conv:${c.id}`);
  }
  for (const c of requested) if (c.startsWith('market:') && instrument(c.slice(7))) channels.push(`market:${instrument(c.slice(7)).symbol}`);
  if (requested.includes('community')) channels.push('community');
  await openStream(req, res, { channels, onPresence: () => touchPresence(req.userId) });
}));
