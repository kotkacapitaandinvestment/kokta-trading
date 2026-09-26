// Request context for Community routes: the signed-in user's community
// identity, loaded once per request.
import { prisma } from '../../lib/prisma.js';

export const ME_SELECT = { id: true, name: true, email: true, username: true, headline: true, bio: true, avatarId: true, initials: true, role: true, status: true, communityMutedUntil: true, lastSeenAt: true, createdAt: true };

export async function loadMe(req, res, next) {
  try {
    req.me = await prisma.user.findUnique({ where: { id: req.userId }, select: ME_SELECT });
    if (!req.me) return res.status(401).json({ error: 'Not authenticated' });
    next();
  } catch (err) {
    next(err);
  }
}

// Posting, messaging and following need a username first.
export function requireProfile(req, res, next) {
  if (!req.me.username) return res.status(403).json({ error: 'Choose a username to take part in Community.', code: 'profile_required' });
  next();
}

export const clampInt = (v, min, max, dflt) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : dflt;
};

export const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
