import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { forgetUserAccess } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { revokeUserSessions } from '../lib/sessions.js';
import { limit } from '../lib/rateLimit.js';
import { unsubscribe } from '../lib/email/inbox.js';

export const adminUsersRouter = Router();

function toAdminUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan,
    status: user.status,
    joined: user.createdAt.toISOString().slice(0, 10),
    lastActive: user.lastLoginAt ? user.lastLoginAt.toISOString().slice(0, 10) : null,
    kycStatus: user.kyc?.status ?? 'none',
  };
}

adminUsersRouter.get('/', asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, include: { kyc: { select: { status: true } } } });
  res.json({ users: users.map(toAdminUser) });
}));

const ROLES = ['trader', 'premium', 'moderator', 'admin', 'super_admin'];
const STATUSES = ['active', 'suspended', 'banned'];
const RANK = { trader: 0, premium: 0, moderator: 0.5, admin: 1, super_admin: 2 };

// Role changes are super-admin only; admins may manage trader accounts'
// status and plan; nobody can change their own role or status.
adminUsersRouter.patch('/:id', asyncHandler(async (req, res) => {
  const { status, role, plan } = req.body ?? {};
  const actor = req.user; // set by requireRole
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'User not found.' });

  if (target.id === actor.id && (role !== undefined || status !== undefined || plan !== undefined)) {
    return res.status(403).json({ error: 'You cannot change your own role, status or plan.' });
  }
  if (role !== undefined) {
    if (actor.role !== 'super_admin') return res.status(403).json({ error: 'Only a super admin can change roles.' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Choose a role from the list.' });
  }
  if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'Choose a status from the list.' });
  if (RANK[target.role] >= RANK[actor.role] && actor.role !== 'super_admin') {
    return res.status(403).json({ error: 'You cannot modify an account with an equal or higher role.' });
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    include: { kyc: { select: { status: true } } },
    data: {
      ...(status ? { status } : {}),
      ...(role ? { role } : {}),
      ...(typeof plan === 'string' && plan.trim() ? { plan: plan.trim().slice(0, 40) } : {}),
    },
  });
  // Suspended or banned: every signed-in browser is signed out now.
  if (status && status !== 'active' && status !== target.status) await revokeUserSessions(user.id);
  forgetUserAccess(user.id);
  const changed = {};
  if (status && status !== target.status) changed.status = { from: target.status, to: status };
  if (role && role !== target.role) changed.role = { from: target.role, to: role };
  if (user.plan !== target.plan) changed.plan = { from: target.plan, to: user.plan };
  if (Object.keys(changed).length) await audit(req, 'user.updated', { targetType: 'user', targetId: user.id, detail: { email: user.email, ...changed } });
  res.json({ user: toAdminUser(user) });
}));

// Permanent deletion, for Super Admins: the account and everything that
// belongs to it (journal, AI history, goals, posts, messages, verification).
// You type the account's email to confirm. The same money rules as deleting
// your own account apply, and the audit log keeps a record of who was deleted.
const LIVE_MATCH = ['WAITING_FOR_OPPONENT', 'READY', 'LOCKED', 'COUNTDOWN', 'ACTIVE', 'COMPLETED', 'SCORING', 'SETTLEMENT'];
const naira = (kobo) => `₦${(Number(kobo) / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

adminUsersRouter.delete('/:id', limit('userDelete'), asyncHandler(async (req, res) => {
  const actor = req.user;
  if (actor.role !== 'super_admin') return res.status(403).json({ error: 'Only a Super Admin can delete accounts.' });
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, include: { kyc: { select: { status: true } } } });
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === actor.id) return res.status(403).json({ error: 'To delete your own account, use Settings.' });
  if (target.role === 'super_admin') return res.status(409).json({ error: 'This is a Super Admin account. Change their role first, then delete it.' });
  const typed = String(req.body?.confirm ?? '').trim().toLowerCase();
  if (typed !== target.email.toLowerCase()) return res.status(400).json({ error: 'Type the account’s email address exactly to confirm.' });

  const wallet = await prisma.wallet.findUnique({ where: { userId: target.id } });
  const held = wallet ? wallet.availableKobo + wallet.lockedKobo + wallet.pendingWithdrawKobo : 0n;
  if (held > 0n) return res.status(409).json({ error: `This account still has ${naira(held)} in its Trading Game wallet. It can’t be deleted until that money is withdrawn or settled.` });
  const inMatch = await prisma.gamePlayer.count({ where: { userId: target.id, match: { status: { in: LIVE_MATCH } } } });
  if (inMatch) return res.status(409).json({ error: 'This account is in a Trading Game match. Wait for it to finish, or cancel it, before deleting the account.' });

  await audit(req, 'user.deleted', { targetType: 'user', targetId: target.id, detail: { email: target.email, name: target.name, role: target.role, status: target.status, verification: target.kyc?.status ?? 'none', joined: target.createdAt.toISOString().slice(0, 10) } });
  await revokeUserSessions(target.id);
  await prisma.follow.deleteMany({ where: { targetType: 'user', targetId: target.id } });
  if (target.newsletterContactId) await unsubscribe(target.newsletterContactId).catch(() => {});
  await prisma.user.delete({ where: { id: target.id } });
  forgetUserAccess(target.id);
  res.json({ ok: true });
}));
