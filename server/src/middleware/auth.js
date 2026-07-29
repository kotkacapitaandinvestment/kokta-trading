import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.kotka_session;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function requireRole(...roles) {
  return async (req, res, next) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    req.user = user;
    next();
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
