import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';

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
  };
}

adminUsersRouter.get('/', asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ users: users.map(toAdminUser) });
}));

adminUsersRouter.patch('/:id', asyncHandler(async (req, res) => {
  const { status, role, plan } = req.body ?? {};
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(status ? { status } : {}),
      ...(role ? { role } : {}),
      ...(plan ? { plan } : {}),
    },
  });
  res.json({ user: toAdminUser(user) });
}));
