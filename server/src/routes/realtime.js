import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { eventsSince, parseCursor } from '../lib/realtime.js';
import { prisma } from '../lib/prisma.js';
import { instrument } from '../lib/instruments.js';
import { isPublicConversation } from '../lib/community/access.js';
import { touchPresence } from '../lib/community/users.js';
import { memoryHit } from '../lib/rateLimit.js';

export const realtimeRouter = Router();

// The long-lived stream is retired: it kept a server function running for
// every open tab. 204 is the answer that tells EventSource (in app versions
// still cached in someone's browser) to stop reconnecting.
realtimeRouter.get('/stream', (req, res) => res.status(204).end());

realtimeRouter.use(requireAuth);

// The user's private channel is always included. Private conversations are
// delivered through it, so only public conversation channels are accepted.
async function channelsFor(req) {
  const requested = String(req.query.channels ?? '').split(',').map((c) => c.trim()).filter(Boolean).slice(0, 12);
  const channels = [`user:${req.userId}`];
  const convIds = requested.filter((c) => c.startsWith('conv:')).map((c) => c.slice(5));
  if (convIds.length) {
    const convs = await prisma.conversation.findMany({ where: { id: { in: convIds } }, select: { id: true, kind: true, visibility: true } });
    for (const c of convs) if (isPublicConversation(c)) channels.push(`conv:${c.id}`);
  }
  for (const c of requested) if (c.startsWith('market:') && instrument(c.slice(7))) channels.push(`market:${instrument(c.slice(7)).symbol}`);
  if (requested.includes('community')) channels.push('community');
  return channels;
}

// GET /api/realtime/poll?channels=conv:<id>,market:EURUSD&after=<cursor>
// One quick answer per check-in. Every request is signed in afresh, so a
// signed-out, suspended or banned account stops receiving at once.
realtimeRouter.get('/poll', asyncHandler(async (req, res) => {
  // A tab checks in every few seconds; far more than that is a script.
  if (memoryHit(`rt-poll:${req.userId}`, 120, 60e3)) return res.status(429).json({ error: 'Too many requests.', code: 'rate_limited' });
  const channels = await channelsFor(req);
  // Online status: at most one write a minute per person.
  if (!memoryHit(`rt-presence:${req.userId}`, 1, 60e3)) touchPresence(req.userId).catch(() => {});
  res.set('Cache-Control', 'no-store');
  res.json({ channels, ...(await eventsSince(channels, parseCursor(req.query.after))) });
}));
