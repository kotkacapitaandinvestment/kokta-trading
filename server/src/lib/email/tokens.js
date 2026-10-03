// Single-use email links (password reset, email confirmation). The raw
// token only ever exists in the email; the database keeps its SHA-256 hash.

import crypto from 'node:crypto';
import { prisma } from '../prisma.js';

export const TTL = { reset: 30 * 60 * 1000, verify: 48 * 3600 * 1000 };
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// Creates a new link token; older unused ones for the same purpose stop working.
export async function createEmailToken(userId, purpose) {
  const raw = crypto.randomBytes(32).toString('base64url');
  await prisma.emailToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.emailToken.create({ data: { id: hash(raw), userId, purpose, expiresAt: new Date(Date.now() + TTL[purpose]) } });
  if (Math.random() < 0.05) prisma.emailToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86400e3) } } }).catch(() => {});
  return raw;
}

// Uses a token (atomically, once). Returns the user id, or null.
export async function consumeEmailToken(raw, purpose) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{30,60}$/.test(raw)) return null;
  const id = hash(raw);
  const row = await prisma.emailToken.findUnique({ where: { id } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt <= new Date()) return null;
  const used = await prisma.emailToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
  return used.count === 1 ? row.userId : null;
}

// Checks a token without using it. Returns its user (for the reset form and
// the new-password rules), or null.
export async function peekEmailToken(raw, purpose) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{30,60}$/.test(raw)) return null;
  const row = await prisma.emailToken.findUnique({ where: { id: hash(raw) }, include: { user: { select: { id: true, email: true, name: true, emailVerifiedAt: true } } } });
  return row && row.purpose === purpose && !row.usedAt && row.expiresAt > new Date() ? row.user : null;
}

// After a password change, or signing out everywhere, reset links already
// sent stop working (someone who briefly had the inbox can't use one later).
export async function cancelResetLinks(userId) {
  await prisma.emailToken.updateMany({ where: { userId, purpose: 'reset', usedAt: null }, data: { usedAt: new Date() } });
}
