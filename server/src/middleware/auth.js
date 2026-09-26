import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

// Account status is re-checked on every request (cached ~60s per instance),
// so suspending or banning a user takes effect without waiting for their
// session cookie to expire.
const accessCache = new Map();
const ACCESS_TTL_MS = 60 * 1000;

async function accountIsActive(userId) {
  const hit = accessCache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.active;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  const active = user?.status === 'active';
  accessCache.set(userId, { active, expires: Date.now() + ACCESS_TTL_MS });
  return active;
}

export function forgetUserAccess(userId) {
  accessCache.delete(userId);
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.kotka_session;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  req.userId = payload.sub;
  accountIsActive(payload.sub)
    .then((active) => {
      if (!active) {
        res.clearCookie('kotka_session');
        return res.status(403).json({ error: 'This account is not active. Contact support for help.' });
      }
      next();
    })
    .catch(next);
}

export function requireRole(...roles) {
  return (req, res, next) => {
    prisma.user
      .findUnique({ where: { id: req.userId } })
      .then((user) => {
        if (!user || user.status !== 'active' || !roles.includes(user.role)) {
          return res.status(403).json({ error: 'You do not have permission to perform this action.' });
        }
        req.user = user;
        next();
      })
      .catch(next);
  };
}

export function issueSessionCookie(res, userId) {
  const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('kotka_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}
