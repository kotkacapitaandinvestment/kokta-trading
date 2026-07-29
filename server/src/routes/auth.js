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

authRouter.post('/signup', asyncHandler(async (req, res) => {
  const { name, email, password } = req.body ?? {};
  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Name, email, and an 8+ character password are required.' });
  }

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
      settings: { create: {} },
    },
  });

  issueSessionCookie(res, user.id);
  res.status(201).json({ user: toPublicUser(user) });
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

  issueSessionCookie(res, user.id);
  res.json({ user: toPublicUser(user) });
}));

authRouter.post('/provider', asyncHandler(async (req, res) => {
  const { provider } = req.body ?? {};
  if (!provider) return res.status(400).json({ error: 'Provider is required.' });

  const email = `demo+${provider}@kotka.trading`;
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: 'Alex Morgan',
      email,
      passwordHash: await bcrypt.hash(`${provider}-${Date.now()}`, 10),
      initials: initialsFor('Alex Morgan'),
      role: 'trader',
      plan: 'Free',
      settings: { create: {} },
    },
  });

  issueSessionCookie(res, user.id);
  res.json({ user: toPublicUser(user) });
}));

// Demo-only affordance so the admin dashboard can be previewed without a real admin account.
// A production build would gate role changes behind an actual admin action, not self-service.
authRouter.patch('/role', requireAuth, asyncHandler(async (req, res) => {
  const { role } = req.body ?? {};
  if (!['trader', 'premium', 'admin', 'super_admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  const current = await prisma.user.findUnique({ where: { id: req.userId } });
  const plan = role === 'trader' ? 'Free' : current.plan === 'Free' ? 'Premium' : current.plan;
  const user = await prisma.user.update({ where: { id: req.userId }, data: { role, plan } });
  res.json({ user: toPublicUser(user) });
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
