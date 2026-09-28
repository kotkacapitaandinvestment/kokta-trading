import { prisma } from '../lib/prisma.js';
import { loadAppSettings, ADMIN_ROLES } from '../lib/appSettings.js';
import { readToken, liveSession, startSession, clearSessionCookie, pruneSessions } from '../lib/sessions.js';
import { memoryHit } from '../lib/rateLimit.js';

export { clearSessionCookie } from '../lib/sessions.js';

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
    select: { status: true, role: true, sessionsValidAfter: true, kyc: { select: { status: true } } },
  });
  const value = { exists: !!user, active: user?.status === 'active', role: user?.role ?? null, kycStatus: user?.kyc?.status ?? 'none', sessionsValidAfter: user?.sessionsValidAfter ?? null };
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

// Cookies issued before revocable sessions carry no `sid`. They are accepted
// once (unless invalidated by a password change) and swapped for a real
// session, so nobody is signed out by the upgrade.
const upgraded = new Map();

const ENDED = 'Your session has ended. Please sign in again.';
const PER_USER_PER_MINUTE = 300;

export function requireAuth(req, res, next) {
  const payload = readToken(req);
  if (!payload) {
    // A cookie that fails verification (tampered, expired, wrong algorithm).
    if (req.cookies?.kotka_session) clearSessionCookie(res);
    return res.status(401).json({ error: req.cookies?.kotka_session ? ENDED : 'Please sign in to continue.' });
  }
  (async () => {
    const access = await accessFor(payload.sub);
    if (!access.exists) {
      clearSessionCookie(res);
      return res.status(401).json({ error: ENDED });
    }
    if (payload.sid) {
      const session = await liveSession(payload);
      if (!session) {
        clearSessionCookie(res);
        return res.status(401).json({ error: ENDED });
      }
      req.sessionId = session.id;
    } else {
      if (access.sessionsValidAfter && payload.iat * 1000 < new Date(access.sessionsValidAfter).getTime()) {
        clearSessionCookie(res);
        return res.status(401).json({ error: ENDED });
      }
      const token = req.cookies.kotka_session;
      if (!upgraded.has(token)) {
        upgraded.set(token, true);
        if (upgraded.size > 5000) upgraded.clear();
        req.sessionId = await startSession(req, res, payload.sub);
      }
    }
    req.userId = payload.sub;
    pruneSessions();
    if (memoryHit(`api:${payload.sub}`, PER_USER_PER_MINUTE, 60e3)) return res.status(429).json({ error: 'You’re going a bit fast. Please wait a moment and try again.', code: 'rate_limited' });
    if (!access.active) {
      clearSessionCookie(res);
      return res.status(403).json({ error: 'This account is paused. Please contact support for help.' });
    }
    if (await kycBlocks(req, access)) {
      return res.status(403).json({ error: 'Verify your identity to continue.', code: 'kyc_required' });
    }
    next();
  })().catch(next);
}

// Role checks always read the role from the database, never from the client
// or the cookie.
export function requireRole(...roles) {
  return (req, res, next) => {
    prisma.user
      .findUnique({ where: { id: req.userId } })
      .then((user) => {
        if (!user || user.status !== 'active' || !roles.includes(user.role)) {
          return res.status(403).json({ error: 'You don’t have access to this.' });
        }
        req.user = user;
        next();
      })
      .catch(next);
  };
}

// The signed-in user's id from the session cookie, or null. For routes that
// don't require sign-in but want to know who is calling (e.g. sign-out).
export function sessionUserId(req) {
  return readToken(req)?.sub ?? null;
}
