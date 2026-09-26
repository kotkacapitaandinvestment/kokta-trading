import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { forgetUserAccess } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

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

  if (target.id === actor.id && (role !== undefined || status !== undefined)) {
    return res.status(403).json({ error: 'You cannot change your own role or status.' });
  }
  if (role !== undefined) {
    if (actor.role !== 'super_admin') return res.status(403).json({ error: 'Only a Super Admin can change roles.' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  }
  if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
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
  forgetUserAccess(user.id);
  const changed = {};
  if (status && status !== target.status) changed.status = { from: target.status, to: status };
  if (role && role !== target.role) changed.role = { from: target.role, to: role };
  if (user.plan !== target.plan) changed.plan = { from: target.plan, to: user.plan };
  if (Object.keys(changed).length) await audit(req, 'user.updated', { targetType: 'user', targetId: user.id, detail: { email: user.email, ...changed } });
  res.json({ user: toAdminUser(user) });
}));
