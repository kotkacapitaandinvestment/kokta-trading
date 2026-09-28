import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, clearSessionCookie, forgetUserAccess } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { toPublicUser, PUBLIC_USER_INCLUDE } from '../lib/serialize.js';
import { audit, auditLater } from '../lib/audit.js';
import { initialsFor } from './auth.js';
import { setAvatar } from '../lib/media.js';
import { hashPassword, checkPassword, passwordProblem } from '../lib/passwords.js';
import { listSessions, revokeSession, revokeUserSessions } from '../lib/sessions.js';
import { encryptSecret, decryptSecret } from '../lib/crypto.js';
import { newSecret, verifyCode, otpauthUri, newRecoveryCodes, hashRecovery } from '../lib/totp.js';
import { limit } from '../lib/rateLimit.js';

// The signed-in user's own account: display name, password, sessions,
// two-step verification, deletion.
export const accountRouter = Router();
accountRouter.use(requireAuth);

async function passwordOk(userId, password) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || typeof password !== 'string' || !password) return { user, ok: false };
  return { user, ok: await checkPassword(password, user.passwordHash) };
}

accountRouter.patch('/profile', limit('profile'), asyncHandler(async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) return res.status(400).json({ error: 'Enter your name.' });
  if (name.length > 80) return res.status(400).json({ error: 'Keep your name under 80 characters.' });
  const before = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });
  const user = await prisma.user.update({ where: { id: req.userId }, data: { name, initials: initialsFor(name) }, include: PUBLIC_USER_INCLUDE });
  if (before?.name !== name) auditLater(req, 'account.name_changed', { targetType: 'user', targetId: user.id, actor: user, detail: { from: before?.name, to: name } });
  res.json({ user: toPublicUser(user) });
}));

// Profile photo: { mediaId } from POST /api/media, or { mediaId: null } to remove.
accountRouter.put('/avatar', limit('profile'), asyncHandler(async (req, res) => {
  const mediaId = req.body?.mediaId;
  if (mediaId !== null && typeof mediaId !== 'string') return res.status(400).json({ error: 'Choose a photo to upload.' });
  const { error } = await setAvatar(req.userId, mediaId);
  if (error) return res.status(400).json({ error });
  const user = await prisma.user.findUnique({ where: { id: req.userId }, include: PUBLIC_USER_INCLUDE });
  auditLater(req, mediaId === null ? 'account.photo_removed' : 'account.photo_changed', { targetType: 'user', targetId: user.id, actor: user });
  res.json({ user: toPublicUser(user) });
}));

// Changing the password signs out every other browser; this one stays in.
accountRouter.post('/password', limit('passwordChange'), asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  const { user, ok } = await passwordOk(req.userId, currentPassword);
  if (!user) return res.status(401).json({ error: 'Please sign in again.' });
  if (!ok) return res.status(400).json({ error: 'Your current password is incorrect.' });
  const problem = passwordProblem(newPassword, { email: user.email, name: user.name });
  if (problem) return res.status(400).json({ error: problem });
  if (await checkPassword(newPassword, user.passwordHash)) return res.status(400).json({ error: 'Choose a password you have not used here before.' });
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), sessionsValidAfter: new Date() } });
  const signedOut = await revokeUserSessions(user.id, { except: req.sessionId });
  forgetUserAccess(user.id);
  await audit(req, 'account.password_changed', { targetType: 'user', targetId: user.id, actor: user, detail: { otherSessionsSignedOut: signedOut } });
  res.json({ ok: true, signedOut });
}));

// ── signed-in devices ──────────────────────────────────────────────────────
accountRouter.get('/sessions', asyncHandler(async (req, res) => {
  res.json({ sessions: await listSessions(req.userId, req.sessionId) });
}));

accountRouter.delete('/sessions/:id', limit('sessions'), asyncHandler(async (req, res) => {
  const s = await prisma.session.findFirst({ where: { id: String(req.params.id), userId: req.userId, revokedAt: null }, select: { id: true, device: true } });
  if (!s) return res.status(404).json({ error: 'That device is already signed out.' });
  await revokeSession(s.id);
  auditLater(req, 'account.session_revoked', { targetType: 'user', targetId: req.userId, detail: { device: s.device } });
  if (s.id === req.sessionId) clearSessionCookie(res);
  res.json({ ok: true });
}));

accountRouter.post('/sessions/revoke-others', limit('sessions'), asyncHandler(async (req, res) => {
  const n = await revokeUserSessions(req.userId, { except: req.sessionId });
  await prisma.user.update({ where: { id: req.userId }, data: { sessionsValidAfter: new Date() } });
  forgetUserAccess(req.userId);
  auditLater(req, 'account.sessions_revoked', { targetType: 'user', targetId: req.userId, detail: { count: n } });
  res.json({ signedOut: n });
}));

// ── two-step verification (authenticator app) ─────────────────────────────
// 1. setup (password required): a new secret is stored, not yet active.
// 2. enable: the first code from the app proves it was saved; recovery codes
//    are shown once.
// 3. disable: password and a current code (or a recovery code).
accountRouter.post('/mfa/setup', limit('mfaSetup'), asyncHandler(async (req, res) => {
  const { user, ok } = await passwordOk(req.userId, req.body?.password);
  if (!user) return res.status(401).json({ error: 'Please sign in again.' });
  if (!ok) return res.status(400).json({ error: 'Your password is incorrect.' });
  if (user.mfaEnabledAt) return res.status(409).json({ error: 'Two-step verification is already on.' });
  const secret = newSecret();
  await prisma.user.update({ where: { id: user.id }, data: { mfaSecretCipher: encryptSecret(secret), mfaLastUsedStep: null } });
  res.json({ secret, uri: otpauthUri(secret, user.email) });
}));

accountRouter.post('/mfa/enable', limit('mfa'), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user?.mfaSecretCipher || user.mfaEnabledAt) return res.status(400).json({ error: 'Start the setup again.' });
  const step = verifyCode(decryptSecret(user.mfaSecretCipher), req.body?.code);
  if (step === null) return res.status(400).json({ error: 'That code didn’t match. Check the time on your phone and try the newest code.' });
  const codes = newRecoveryCodes();
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabledAt: new Date(), mfaLastUsedStep: step, mfaRecoveryHashes: codes.map(hashRecovery) } });
  // Other browsers signed in with only a password are signed out.
  await revokeUserSessions(user.id, { except: req.sessionId });
  forgetUserAccess(user.id);
  await audit(req, 'account.mfa_enabled', { targetType: 'user', targetId: user.id, actor: user });
  res.json({ recoveryCodes: codes });
}));

accountRouter.post('/mfa/disable', limit('mfa'), asyncHandler(async (req, res) => {
  const { user, ok } = await passwordOk(req.userId, req.body?.password);
  if (!user) return res.status(401).json({ error: 'Please sign in again.' });
  if (!user.mfaEnabledAt) return res.json({ ok: true });
  if (!ok) return res.status(400).json({ error: 'Your password is incorrect.' });
  const code = String(req.body?.code ?? '').trim();
  const good = verifyCode(decryptSecret(user.mfaSecretCipher), code, { lastUsedStep: user.mfaLastUsedStep }) !== null || user.mfaRecoveryHashes.includes(hashRecovery(code));
  if (!good) return res.status(400).json({ error: 'That code didn’t work.' });
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabledAt: null, mfaSecretCipher: null, mfaLastUsedStep: null, mfaRecoveryHashes: [] } });
  await audit(req, 'account.mfa_disabled', { targetType: 'user', targetId: user.id, actor: user });
  res.json({ ok: true });
}));

// Permanent: cascades to the journal, AI history, settings and verification.
accountRouter.delete('/', limit('accountDelete'), asyncHandler(async (req, res) => {
  const { user, ok } = await passwordOk(req.userId, req.body?.password);
  if (!user) return res.status(401).json({ error: 'Please sign in again.' });
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
