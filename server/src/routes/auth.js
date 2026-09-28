import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, clearSessionCookie, sessionUserId } from '../middleware/auth.js';
import { toPublicUser, PUBLIC_USER_INCLUDE } from '../lib/serialize.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { auditLater } from '../lib/audit.js';
import { loadAppSettings } from '../lib/appSettings.js';
import { loginBlocked, signupBlocked, recordAttempt } from '../lib/authThrottle.js';
import { startSession, revokeSession, readToken, hashSid, signPurposeToken, readPurposeToken } from '../lib/sessions.js';
import { hashPassword, checkPassword, needsRehash, passwordProblem, MAX_LENGTH } from '../lib/passwords.js';
import { decryptSecret } from '../lib/crypto.js';
import { verifyCode, hashRecovery } from '../lib/totp.js';
import { hit, LIMITS, memoryHit } from '../lib/rateLimit.js';
import { waitUntil } from '@vercel/functions';
import { sendWelcome, sendPasswordReset, alertPasswordChanged, alertIfNewDevice, emailDomainAcceptsMail } from '../lib/email/notices.js';
import { consumeEmailToken, peekEmailToken } from '../lib/email/tokens.js';
import { subscribe } from '../lib/email/inbox.js';
import { revokeUserSessions } from '../lib/sessions.js';
import { clientIp } from '../lib/requestMeta.js';
import { forgetUserAccess } from '../middleware/auth.js';

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
const WRONG = 'That email and password don’t match. Check them and try again.';
const MFA_TTL_SECONDS = 5 * 60;

authRouter.post('/signup', asyncHandler(async (req, res) => {
  const settings = await loadAppSettings();
  if (!settings.signupsOpen) return res.status(403).json({ error: 'New sign-ups are paused right now. Please check back soon.' });

  const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!name || !email || !password) return res.status(400).json({ error: 'Enter your name, email and a password.' });
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
  const problem = passwordProblem(password, { email, name });
  if (problem) return res.status(400).json({ error: problem, field: 'password' });

  if (await signupBlocked(req)) return res.status(429).json({ error: TOO_MANY });
  await recordAttempt(req, 'signup', email, false);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return res.status(409).json({ error: 'An account with this email already exists. Try signing in instead.' });
  // A quick check that the address can receive email at all (typos like gmial.com).
  if (process.env.KOTKA_TEST_DB !== '1' && !(await emailDomainAcceptsMail(email))) {
    return res.status(400).json({ error: 'That email address can’t receive email. Check it for typos.', field: 'email' });
  }
  const newsletter = req.body?.newsletter === true;

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      initials: initialsFor(name),
      role: 'trader',
      plan: 'Free',
      lastLoginAt: new Date(),
      newsletterOptIn: newsletter,
      newsletterOptInAt: newsletter ? new Date() : null,
      settings: { create: {} },
    },
    include: PUBLIC_USER_INCLUDE,
  });

  await startSession(req, res, user.id);
  auditLater(req, 'auth.signed_up', { targetType: 'user', targetId: user.id, actor: user, detail: newsletter ? { newsletter: true } : undefined });
  res.status(201).json({ user: toPublicUser(user) });
  // Welcome + confirm-your-email, and the newsletter list if they opted in.
  waitUntil(sendWelcome(user).catch((err) => console.error('Welcome email failed:', err.message)));
  if (newsletter) waitUntil(subscribe(user.email).then((id) => id && prisma.user.update({ where: { id: user.id }, data: { newsletterContactId: String(id) } })).catch((err) => console.error('Newsletter sign-up failed:', err.message)));
}));

async function completeSignIn(req, res, user) {
  await recordAttempt(req, 'login', user.email, true);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, include: PUBLIC_USER_INCLUDE });
  const sessionId = await startSession(req, res, updated.id);
  auditLater(req, 'auth.signed_in', { targetType: 'user', targetId: updated.id, actor: updated, detail: user.mfaEnabledAt ? { twoStep: true } : undefined });
  res.json({ user: toPublicUser(updated) });
  waitUntil(alertIfNewDevice(updated, req, sessionId).catch((err) => console.error('New sign-in alert failed:', err.message)));
}

authRouter.post('/login', asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  if (await loginBlocked(req, email)) {
    auditLater(req, 'auth.sign_in_blocked', { actor: { id: null, email }, detail: { reason: 'Too many attempts' } });
    return res.status(429).json({ error: TOO_MANY });
  }

  const user = await prisma.user.findUnique({ where: { email }, include: PUBLIC_USER_INCLUDE });
  // Always runs one bcrypt comparison, so timing doesn't reveal whether the email exists.
  const valid = await checkPassword(password.slice(0, MAX_LENGTH), user?.passwordHash);
  if (!valid) {
    await recordAttempt(req, 'login', email, false);
    auditLater(req, 'auth.sign_in_failed', { targetType: user ? 'user' : null, targetId: user?.id ?? null, actor: { id: user?.id ?? null, email }, detail: { reason: user ? 'Wrong password' : 'No account with this email' } });
    return res.status(401).json({ error: WRONG });
  }

  if (user.status !== 'active') {
    auditLater(req, 'auth.sign_in_refused', { targetType: 'user', targetId: user.id, actor: user, detail: { reason: `Account ${user.status}` } });
    return res.status(403).json({ error: user.status === 'banned' ? 'This account has been closed. Contact support for help.' : 'This account has been suspended. Contact support for help.' });
  }

  // Upgrade older, cheaper hashes now that we have the password.
  if (needsRehash(user.passwordHash)) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } }).catch(() => {});
  }

  if (user.mfaEnabledAt && user.mfaSecretCipher) {
    const challenge = signPurposeToken('mfa-login', { sub: user.id }, MFA_TTL_SECONDS);
    return res.json({ mfaRequired: true, challenge });
  }
  await completeSignIn(req, res, user);
}));

// Second step: a 6-digit code from the authenticator app, or a recovery code.
authRouter.post('/login/mfa', asyncHandler(async (req, res) => {
  const claim = readPurposeToken('mfa-login', req.body?.challenge);
  if (!claim) return res.status(401).json({ error: 'That sign-in took too long. Please enter your password again.', code: 'mfa_expired' });
  const [max, windowMs] = LIMITS.mfa;
  if (await hit(`mfa:${claim.sub}`, max, windowMs)) return res.status(429).json({ error: TOO_MANY });

  const user = await prisma.user.findUnique({ where: { id: claim.sub }, include: PUBLIC_USER_INCLUDE });
  if (!user || user.status !== 'active' || !user.mfaEnabledAt || !user.mfaSecretCipher) return res.status(401).json({ error: 'Please sign in again.', code: 'mfa_expired' });

  const code = String(req.body?.code ?? '').trim();
  const step = verifyCode(decryptSecret(user.mfaSecretCipher), code, { lastUsedStep: user.mfaLastUsedStep });
  if (step !== null) {
    // Atomic: only one request can use a given code.
    const used = await prisma.user.updateMany({ where: { id: user.id, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] }, data: { mfaLastUsedStep: step } });
    if (used.count === 1) return completeSignIn(req, res, user);
  } else if (code.length > 6) {
    const h = hashRecovery(code);
    if (user.mfaRecoveryHashes.includes(h)) {
      const used = await prisma.user.updateMany({ where: { id: user.id, mfaRecoveryHashes: { has: h } }, data: { mfaRecoveryHashes: user.mfaRecoveryHashes.filter((x) => x !== h) } });
      if (used.count === 1) {
        auditLater(req, 'auth.recovery_code_used', { targetType: 'user', targetId: user.id, actor: user, detail: { remaining: user.mfaRecoveryHashes.length - 1 } });
        return completeSignIn(req, res, user);
      }
    }
  }
  await recordAttempt(req, 'login', user.email, false);
  auditLater(req, 'auth.sign_in_failed', { targetType: 'user', targetId: user.id, actor: user, detail: { reason: 'Wrong two-step code' } });
  res.status(401).json({ error: 'That code didn’t work. Check your authenticator app and try again.' });
}));

// ── password reset by email ────────────────────────────────────────────────
// The answer is the same whether or not the email has an account, and the
// email is sent after responding, so neither the reply nor its timing reveals
// who has an account.
const RESET_SENT = 'If that email has a Kotka account, we’ve sent a link to reset the password. It works for 30 minutes. Check your spam folder too.';

authRouter.post('/password-reset', asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter the email address you signed up with.' });
  if (memoryHit(`reset-ip:${clientIp(req)}`, 10, 3600e3) || (await hit(`reset:${email}`, 3, 3600e3))) {
    return res.status(429).json({ error: 'We’ve sent a few reset emails already. Please check your inbox (and spam), or try again in an hour.' });
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, status: true } });
  res.json({ ok: true, message: RESET_SENT });
  if (user && user.status === 'active') {
    auditLater(req, 'auth.password_reset_requested', { targetType: 'user', targetId: user.id, actor: user });
    waitUntil(sendPasswordReset(user).catch((err) => console.error('Reset email failed:', err.message)));
  }
}));

authRouter.get('/password-reset/check', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ valid: !!(await peekEmailToken(req.query.token, 'reset')) });
}));

authRouter.post('/password-reset/confirm', asyncHandler(async (req, res) => {
  const token = req.body?.token;
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const owner = await peekEmailToken(token, 'reset');
  if (!owner) return res.status(400).json({ error: 'This reset link has expired or was already used. Ask for a new one.', code: 'link_expired' });
  // Check the new password before using up the link, so a weak one can be retried.
  const problem = passwordProblem(password, { email: owner.email, name: owner.name });
  if (problem) return res.status(400).json({ error: problem, field: 'password' });
  const userId = await consumeEmailToken(token, 'reset');
  if (!userId) return res.status(400).json({ error: 'This reset link has expired or was already used. Ask for a new one.', code: 'link_expired' });
  const user = await prisma.user.update({
    where: { id: userId },
    // Following the link proves the person reads this inbox.
    data: { passwordHash: await hashPassword(password), sessionsValidAfter: new Date(), emailVerifiedAt: owner.emailVerifiedAt ?? new Date() },
  });
  await revokeUserSessions(user.id);
  forgetUserAccess(user.id);
  await recordAttempt(req, 'login', user.email, true);
  auditLater(req, 'auth.password_reset', { targetType: 'user', targetId: user.id, actor: user });
  res.json({ ok: true, message: 'Your password has been changed and every device was signed out. Sign in with your new password.' });
  waitUntil(alertPasswordChanged(user, req, 'reset').catch(() => {}));
}));

// ── email confirmation ────────────────────────────────────────────────────
authRouter.post('/verify-email', asyncHandler(async (req, res) => {
  const userId = await consumeEmailToken(req.body?.token, 'verify');
  if (!userId) return res.status(400).json({ error: 'This confirmation link has expired or was already used. You can send a new one from Settings.', code: 'link_expired' });
  const user = await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  auditLater(req, 'account.email_verified', { targetType: 'user', targetId: user.id, actor: user });
  res.json({ ok: true });
}));

authRouter.post('/logout', asyncHandler(async (req, res) => {
  const payload = readToken(req);
  const id = sessionUserId(req);
  if (payload?.sid) await revokeSession(hashSid(payload.sid));
  if (id) auditLater(req, 'auth.signed_out', { targetType: 'user', targetId: id, actor: { id, email: null } });
  clearSessionCookie(res);
  res.json({ ok: true });
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, include: PUBLIC_USER_INCLUDE });
  if (!user) return res.status(401).json({ error: 'Please sign in again.' });
  res.json({ user: toPublicUser(user) });
}));
