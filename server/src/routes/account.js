import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAuth, clearSessionCookie, forgetUserAccess } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { toPublicUser, PUBLIC_USER_INCLUDE } from '../lib/serialize.js';
import { audit } from '../lib/audit.js';
import { initialsFor } from './auth.js';

// The signed-in user's own account: display name, password, deletion.
export const accountRouter = Router();
accountRouter.use(requireAuth);

async function checkPassword(userId, password) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || typeof password !== 'string' || !password) return { user, ok: false };
  return { user, ok: await bcrypt.compare(password.slice(0, 200), user.passwordHash) };
}

accountRouter.patch('/profile', asyncHandler(async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) return res.status(400).json({ error: 'Enter your name.' });
  if (name.length > 80) return res.status(400).json({ error: 'Keep your name under 80 characters.' });
  const user = await prisma.user.update({ where: { id: req.userId }, data: { name, initials: initialsFor(name) }, include: PUBLIC_USER_INCLUDE });
  res.json({ user: toPublicUser(user) });
}));

accountRouter.post('/password', asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof newPassword !== 'string' || newPassword.length < 8) return res.status(400).json({ error: 'Use at least 8 characters for the new password.' });
  if (newPassword.length > 200) return res.status(400).json({ error: 'Password is too long.' });
  const { user, ok } = await checkPassword(req.userId, currentPassword);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (!ok) return res.status(400).json({ error: 'Your current password is incorrect.' });
  if (await bcrypt.compare(newPassword, user.passwordHash)) return res.status(400).json({ error: 'Choose a password you have not used here before.' });
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
  await audit(req, 'account.password_changed', { targetType: 'user', targetId: user.id, actor: user });
  res.json({ ok: true });
}));

// Permanent: cascades to the journal, AI history, settings and verification.
accountRouter.delete('/', asyncHandler(async (req, res) => {
  const { user, ok } = await checkPassword(req.userId, req.body?.password);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (!ok) return res.status(400).json({ error: 'Your password is incorrect.' });
  if (user.role === 'super_admin') {
    const others = await prisma.user.count({ where: { role: 'super_admin', status: 'active', id: { not: user.id } } });
    if (others === 0) return res.status(409).json({ error: 'You are the only Super Admin. Promote someone else before deleting this account.' });
  }
  await audit(req, 'account.deleted', { targetType: 'user', targetId: user.id, actor: user, detail: { email: user.email, role: user.role } });
  await prisma.follow.deleteMany({ where: { targetType: 'user', targetId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  forgetUserAccess(user.id);
  clearSessionCookie(res);
  res.json({ ok: true });
}));
