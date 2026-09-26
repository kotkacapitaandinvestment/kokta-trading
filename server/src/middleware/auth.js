import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { loadAppSettings, ADMIN_ROLES } from '../lib/appSettings.js';

// Account status (and verification state) is re-checked on every request,
// cached ~60s per instance, so suspending or banning a user takes effect
// without waiting for their session cookie to expire.
const accessCache = new Map();
const ACCESS_TTL_MS = 60 * 1000;

async function accessFor(userId) {
  const hit = accessCache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.value;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, role: true, kyc: { select: { status: true } } },
  });
  const value = { active: user?.status === 'active', role: user?.role ?? null, kycStatus: user?.kyc?.status ?? 'none' };
  accessCache.set(userId, { value, expires: Date.now() + ACCESS_TTL_MS });
  return value;
}

export function forgetUserAccess(userId) {
  accessCache.delete(userId);
}

// Routes a trader can use before submitting identity details: signing in and
// out, the verification form itself, their own account, public app config.
const KYC_EXEMPT = ['/api/auth', '/api/kyc', '/api/account', '/api/app'];

// Traders get full access once details are submitted (pending or approved);
// with no submission, or after a rejection, they must (re)submit first.
async function kycBlocks(req, access) {
  if (ADMIN_ROLES.includes(access.role)) return false;
  if (access.kycStatus === 'pending' || access.kycStatus === 'approved') return false;
  if (KYC_EXEMPT.some((p) => req.originalUrl.startsWith(p))) return false;
  const settings = await loadAppSettings();
  return settings.kycRequired;
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.kotka_session;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  req.userId = payload.sub;
  accessFor(payload.sub)
    .then(async (access) => {
      if (!access.active) {
        res.clearCookie('kotka_session');
        return res.status(403).json({ error: 'This account is not active. Contact support for help.' });
      }
      if (await kycBlocks(req, access)) {
        return res.status(403).json({ error: 'Verify your identity to continue.', code: 'kyc_required' });
      }
      next();
    })
    .catch(next);
}

export function requireRole(...roles) {
  return (req, res, next) => {
    prisma.user
      .findUnique({ where: { id: req.userId } })
      .then((user) => {
        if (!user || user.status !== 'active' || !roles.includes(user.role)) {
          return res.status(403).json({ error: 'You do not have permission to perform this action.' });
        }
        req.user = user;
        next();
      })
      .catch(next);
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

export function clearSessionCookie(res) {
  res.clearCookie('kotka_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
}
