import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAuth, issueSessionCookie } from '../middleware/auth.js';
import { toPublicUser } from '../lib/serialize.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const authRouter = Router();

function initialsFor(name) {
  return (name || 'Trader')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const normalizeEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

authRouter.post('/signup', asyncHandler(async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Name, email, and an 8+ character password are required.' });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length > 200) return res.status(400).json({ error: 'Password is too long.' });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      initials: initialsFor(name),
      role: 'trader',
      plan: 'Free',
      lastLoginAt: new Date(),
      settings: { create: {} },
    },
  });

  issueSessionCookie(res, user.id);
  res.status(201).json({ user: toPublicUser(user) });
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

  if (user.status !== 'active') {
    return res.status(403).json({ error: user.status === 'banned' ? 'This account has been closed. Contact support for help.' : 'This account has been suspended. Contact support for help.' });
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  issueSessionCookie(res, updated.id);
  res.json({ user: toPublicUser(updated) });
}));

authRouter.post('/logout', (req, res) => {
  res.clearCookie('kotka_session');
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: toPublicUser(user) });
}));
