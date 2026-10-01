import { Router } from 'express';
import { impersonationError } from '../lib/community/users.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, clearSessionCookie, sessionUserId } from '../middleware/auth.js';
import { toPublicUser, PUBLIC_USER_INCLUDE } from '../lib/serialize.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { auditLater } from '../lib/audit.js';
import { loadAppSettings, supportAddress } from '../lib/appSettings.js';
import { loginBlocked, signupBlocked, recordAttempt } from '../lib/authThrottle.js';
import { startSession, revokeSession, readToken, hashSid, signPurposeToken, readPurposeToken, trustThisDevice, knownDevice } from '../lib/sessions.js';
import { hashPassword, checkPassword, needsRehash, passwordProblem, MAX_LENGTH } from '../lib/passwords.js';
import { decryptSecret } from '../lib/crypto.js';
import { verifyCode, hashRecovery } from '../lib/totp.js';
import { hit, LIMITS, memoryHit } from '../lib/rateLimit.js';
import { waitUntil } from '@vercel/functions';
import { sendWelcome, sendPasswordReset, alertPasswordChanged, alertIfNewDevice, emailDomainAcceptsMail, sendSignupCode, sendAccountExists } from '../lib/email/notices.js';
import { issueSignupCode, useSignupCode } from '../lib/signupCodes.js';
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
const LOCKED = 'Too many attempts on this account. Wait 15 minutes, or reset your password to sign in straight away.';
const WRONG = 'That email and password don’t match. Check them and try again.';
const MFA_TTL_SECONDS = 5 * 60;

// Sign-up is two steps. /signup/start checks the details and emails a
// 6-digit code; /signup creates the account with that code. The answer to
// /signup/start is the same whether or not the address already has an
// account (that address's owner gets an email saying so), so the form can't
// be used to find out who uses Kotka. Every new account starts with its
// email confirmed.
function readSignup(body) {
  const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!name || !email || !password) return { error: 'Enter your name, email and a password.' };
  // Your name is how Community shows you: it can't suggest you work for Kotka.
  const nameProblem = impersonationError(name);
  if (nameProblem) return { error: nameProblem, field: 'name' };
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: 'Enter a valid email address.', field: 'email' };
  const problem = passwordProblem(password, { email, name });
  if (problem) return { error: problem, field: 'password' };
  return { name, email, password };
}

const signupsPaused = async (res) => {
  const settings = await loadAppSettings();
  if (settings.signupsOpen) return false;
  res.status(403).json({ error: 'New sign-ups are paused right now. Please check back soon.' });
  return true;
};

authRouter.post('/signup/start', asyncHandler(async (req, res) => {
  if (await signupsPaused(res)) return;
  const s = readSignup(req.body);
  if (s.error) return res.status(400).json({ error: s.error, field: s.field });
  if (await signupBlocked(req)) return res.status(429).json({ error: TOO_MANY });
  if (await hit(`signup-code:${s.email}`, 5, 3600e3)) return res.status(429).json({ error: 'We’ve sent a few codes to this address already. Check your inbox (and spam), or try again in an hour.' });
  // A quick check that the address can receive email at all (typos like gmial.com).
  if (process.env.KOTKA_TEST_DB !== '1' && !(await emailDomainAcceptsMail(s.email))) {
    return res.status(400).json({ error: 'That email address can’t receive email. Check it for typos.', field: 'email' });
  }
  await recordAttempt(req, 'signup', s.email, false);
  res.json({ ok: true, message: `We’ve sent a 6-digit code to ${s.email}. It works for 15 minutes.` });
  // After the reply, so its timing doesn't depend on whether the address is known.
  waitUntil((async () => {
    const existing = await prisma.user.findUnique({ where: { email: s.email }, select: { id: true, name: true, email: true, status: true } });
    if (existing) {
      if (existing.status === 'active') await sendAccountExists(existing);
      return;
    }
    await sendSignupCode(s.email, await issueSignupCode(s.email));
  })().catch((err) => console.error('Sign-up code email failed:', err.message)));
}));

authRouter.post('/signup', asyncHandler(async (req, res) => {
  if (await signupsPaused(res)) return;
  const s = readSignup(req.body);
  if (s.error) return res.status(400).json({ error: s.error, field: s.field });
  const code = String(req.body?.code ?? '').replace(/\s+/g, '');
  if (!code) return res.status(400).json({ error: 'Enter the 6-digit code we emailed you.', field: 'code', code: 'code_required' });
  if (await signupBlocked(req)) return res.status(429).json({ error: TOO_MANY });

  const result = await useSignupCode(s.email, code);
  if (result === 'expired') return res.status(400).json({ error: 'That code has expired or was used up. Send a new one and try again.', field: 'code', code: 'code_expired' });
  if (result === 'wrong') return res.status(400).json({ error: 'That code isn’t right. Check the email and try again.', field: 'code', code: 'code_wrong' });

  // Only possible in a race: codes are never sent to addresses with an account.
  const existing = await prisma.user.findUnique({ where: { email: s.email }, select: { id: true } });
  if (existing) return res.status(409).json({ error: 'This email already has a Kotka account. Sign in instead.' });
  const newsletter = req.body?.newsletter === true;

  const user = await prisma.user.create({
    data: {
      name: s.name,
      email: s.email,
      passwordHash: await hashPassword(s.password),
      initials: initialsFor(s.name),
      role: 'trader',
      plan: 'Free',
      lastLoginAt: new Date(),
      // The code proved this person reads the inbox.
      emailVerifiedAt: new Date(),
      newsletterOptIn: newsletter,
      newsletterOptInAt: newsletter ? new Date() : null,
      settings: { create: {} },
    },
    include: PUBLIC_USER_INCLUDE,
  });

  await startSession(req, res, user.id);
  trustThisDevice(res, user.id);
  auditLater(req, 'auth.signed_up', { targetType: 'user', targetId: user.id, actor: user, detail: newsletter ? { newsletter: true } : undefined });
  res.status(201).json({ user: toPublicUser(user) });
  waitUntil(sendWelcome(user).catch((err) => console.error('Welcome email failed:', err.message)));
  if (newsletter) waitUntil(subscribe(user.email).then((id) => id && prisma.user.update({ where: { id: user.id }, data: { newsletterContactId: String(id) } })).catch((err) => console.error('Newsletter sign-up failed:', err.message)));
}));

async function completeSignIn(req, res, user) {
  await recordAttempt(req, 'login', user.email, true);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, include: PUBLIC_USER_INCLUDE });
  const sessionId = await startSession(req, res, updated.id);
  trustThisDevice(res, updated.id);
  auditLater(req, 'auth.signed_in', { targetType: 'user', targetId: updated.id, actor: updated, detail: user.mfaEnabledAt ? { twoStep: true } : undefined });
  res.json({ user: toPublicUser(updated) });
  waitUntil(alertIfNewDevice(updated, req, sessionId).catch((err) => console.error('New sign-in alert failed:', err.message)));
}

authRouter.post('/login', asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  // On a device this account already signs in from, only that device's own
  // attempts count; elsewhere, failures per email and per network do.
  const device = knownDevice(req);
  const trusted = device ? (await prisma.user.findUnique({ where: { email }, select: { id: true } }))?.id === device.sub : false;
  if (trusted ? await hit(`login-device:${device.d}`, 20, 15 * 60e3) : await loginBlocked(req, email)) {
    auditLater(req, 'auth.sign_in_blocked', { actor: { id: null, email }, detail: { reason: 'Too many attempts', knownDevice: trusted } });
    return res.status(429).json({ error: trusted ? TOO_MANY : LOCKED });
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
    const support = await supportAddress();
    return res.status(403).json({ error: user.status === 'banned' ? `This account has been closed. If you think this is a mistake, email ${support}.` : `This account has been suspended. For help, email ${support}.` });
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
