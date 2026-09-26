import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { forgetUserAccess } from '../middleware/auth.js';
import { kycView, KYC_STATUSES } from '../lib/kyc.js';
import { audit } from '../lib/audit.js';

// Mounted behind requireAuth + requireRole('admin', 'super_admin').
export const adminKycRouter = Router();

const userSelect = { id: true, name: true, email: true, role: true, status: true, createdAt: true };

adminKycRouter.get('/', asyncHandler(async (req, res) => {
  const status = KYC_STATUSES.includes(req.query.status) ? req.query.status : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const where = {
    ...(status ? { status } : {}),
    ...(q ? { user: { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } } : {}),
  };
  const [profiles, grouped, usersWithout] = await Promise.all([
    prisma.kycProfile.findMany({ where, include: { user: { select: userSelect } }, orderBy: { submittedAt: status === 'pending' ? 'asc' : 'desc' }, take: 200 }),
    prisma.kycProfile.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.user.count({ where: { kyc: null, role: { in: ['trader', 'premium'] } } }),
  ]);
  const counts = Object.fromEntries(KYC_STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0]));
  res.json({
    counts: { ...counts, notSubmitted: usersWithout },
    profiles: profiles.map((p) => ({ ...kycView(p), user: p.user })),
  });
}));

// Opening a profile decrypts personal data, so every view is audited.
adminKycRouter.get('/:id', asyncHandler(async (req, res) => {
  const profile = await prisma.kycProfile.findUnique({ where: { id: req.params.id }, include: { user: { select: userSelect } } });
  if (!profile) return res.status(404).json({ error: 'Verification not found.' });
  const reviewer = profile.reviewedById
    ? await prisma.user.findUnique({ where: { id: profile.reviewedById }, select: { name: true, email: true } })
    : null;
  await audit(req, 'kyc.viewed', { targetType: 'kyc', targetId: profile.id, detail: { userEmail: profile.user.email } });
  res.json({ kyc: { ...kycView(profile, { withDetails: true }), reviewNote: profile.reviewNote, reviewer, user: profile.user } });
}));

adminKycRouter.post('/:id/decision', asyncHandler(async (req, res) => {
  const decision = req.body?.decision;
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Decision must be approved or rejected.' });
  if (decision === 'rejected' && !note) return res.status(400).json({ error: 'Tell the trader what to fix. The note is shown to them.' });

  const profile = await prisma.kycProfile.findUnique({ where: { id: req.params.id }, include: { user: { select: userSelect } } });
  if (!profile) return res.status(404).json({ error: 'Verification not found.' });
  if (profile.userId === req.user.id) return res.status(403).json({ error: 'You cannot review your own verification.' });

  const updated = await prisma.kycProfile.update({
    where: { id: profile.id },
    data: { status: decision, reviewNote: note || null, reviewedById: req.user.id, reviewedAt: new Date() },
    include: { user: { select: userSelect } },
  });
  forgetUserAccess(profile.userId);
  await audit(req, `kyc.${decision}`, { targetType: 'kyc', targetId: profile.id, detail: { userEmail: profile.user.email, previous: profile.status, note: note || undefined } });
  res.json({ kyc: { ...kycView(updated, { withDetails: true }), reviewNote: updated.reviewNote, user: updated.user } });
}));
