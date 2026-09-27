import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAuth, issueSessionCookie, clearSessionCookie, sessionUserId } from '../middleware/auth.js';
import { toPublicUser, PUBLIC_USER_INCLUDE } from '../lib/serialize.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { auditLater } from '../lib/audit.js';
import { loadAppSettings } from '../lib/appSettings.js';
import { loginBlocked, signupBlocked, recordAttempt } from '../lib/authThrottle.js';

export const authRouter = Router();

export function initialsFor(name) {
  return (name || 'Trader')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'T';
}

const normalizeEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TOO_MANY = 'Too many attempts. Please wait a few minutes and try again.';

authRouter.post('/signup', asyncHandler(async (req, res) => {
  const settings = await loadAppSettings();
  if (!settings.signupsOpen) return res.status(403).json({ error: 'New sign-ups are paused right now. Please check back soon.' });

  const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Name, email, and an 8+ character password are required.' });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length > 200) return res.status(400).json({ error: 'Password is too long.' });

  if (await signupBlocked(req)) return res.status(429).json({ error: TOO_MANY });
  await recordAttempt(req, 'signup', email, false);

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
    include: PUBLIC_USER_INCLUDE,
  });

  issueSessionCookie(res, user.id);
  auditLater(req, 'auth.signed_up', { targetType: 'user', targetId: user.id, actor: user });
  res.status(201).json({ user: toPublicUser(user) });
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  if (await loginBlocked(req, email)) {
    auditLater(req, 'auth.sign_in_blocked', { actor: { id: null, email }, detail: { reason: 'Too many attempts' } });
    return res.status(429).json({ error: TOO_MANY });
  }

  const user = await prisma.user.findUnique({ where: { email }, include: PUBLIC_USER_INCLUDE });
  const valid = user ? await bcrypt.compare(password.slice(0, 200), user.passwordHash) : false;
  if (!valid) {
    await recordAttempt(req, 'login', email, false);
    auditLater(req, 'auth.sign_in_failed', { targetType: user ? 'user' : null, targetId: user?.id ?? null, actor: { id: user?.id ?? null, email }, detail: { reason: user ? 'Wrong password' : 'No account with this email' } });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.status !== 'active') {
    auditLater(req, 'auth.sign_in_refused', { targetType: 'user', targetId: user.id, actor: user, detail: { reason: `Account ${user.status}` } });
    return res.status(403).json({ error: user.status === 'banned' ? 'This account has been closed. Contact support for help.' : 'This account has been suspended. Contact support for help.' });
  }

  await recordAttempt(req, 'login', email, true);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, include: PUBLIC_USER_INCLUDE });
  issueSessionCookie(res, updated.id);
  auditLater(req, 'auth.signed_in', { targetType: 'user', targetId: updated.id, actor: updated });
  res.json({ user: toPublicUser(updated) });
}));

authRouter.post('/logout', (req, res) => {
  const id = sessionUserId(req);
  if (id) auditLater(req, 'auth.signed_out', { targetType: 'user', targetId: id, actor: { id, email: null } });
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, include: PUBLIC_USER_INCLUDE });
  if (!user) return res.status(401).json({ error: 'Please sign in again.' });
  res.json({ user: toPublicUser(user) });
}));
