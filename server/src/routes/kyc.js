import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, forgetUserAccess } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { loadAppSettings } from '../lib/appSettings.js';
import { validateKycDetails, sealDetails, kycView } from '../lib/kyc.js';
import { audit } from '../lib/audit.js';

export const kycRouter = Router();
kycRouter.use(requireAuth);

kycRouter.get('/', asyncHandler(async (req, res) => {
  const [profile, settings] = await Promise.all([
    prisma.kycProfile.findUnique({ where: { userId: req.userId } }),
    loadAppSettings(),
  ]);
  res.json({ kyc: kycView(profile, { withDetails: true }), required: settings.kycRequired });
}));

// Submit or correct details. Approved profiles are locked; changing verified
// details goes through support so a reviewed identity can't be swapped.
kycRouter.post('/', asyncHandler(async (req, res) => {
  const existing = await prisma.kycProfile.findUnique({ where: { userId: req.userId } });
  if (existing?.status === 'approved') {
    return res.status(409).json({ error: 'Your identity is already verified. Contact support to change verified details.' });
  }
  const { details, errors } = validateKycDetails(req.body ?? {});
  if (errors) return res.status(400).json({ error: 'Some details need attention.', fields: errors });

  const data = { detailsCipher: sealDetails(details), country: details.country, status: 'pending', reviewNote: null, reviewedById: null, reviewedAt: null, submittedAt: new Date() };
  const profile = await prisma.kycProfile.upsert({
    where: { userId: req.userId },
    update: data,
    create: { userId: req.userId, ...data },
  });
  forgetUserAccess(req.userId);
  await audit(req, existing ? 'kyc.resubmitted' : 'kyc.submitted', { targetType: 'kyc', targetId: profile.id, detail: { country: details.country } });
  res.status(existing ? 200 : 201).json({ kyc: kycView(profile, { withDetails: true }) });
}));
