// Revocable sessions.
//
// The session cookie is a signed JWT carrying the user id and a random
// session id (`sid`). Only a SHA-256 hash of the sid is stored (Session.id),
// so a database leak alone can't be turned into working cookies. Signing out,
// changing the password, or being suspended revokes the row, and the cookie
// stops working everywhere within the cache window below.

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma.js';
import { clientIp, deviceName } from './requestMeta.js';

export const COOKIE = 'kotka_session';
export const SESSION_TTL_MS = 7 * 24 * 3600e3;
const CACHE_MS = 30 * 1000;
const TOUCH_MS = 5 * 60 * 1000;

export const hashSid = (sid) => crypto.createHash('sha256').update(String(sid)).digest('hex');

export function cookieOptions(maxAge) {
  return { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', ...(maxAge ? { maxAge } : {}) };
}

// Starts a new session for this browser and sets the cookie. A fresh id on
// every sign-in, so a session id can never be planted in advance.
export async function startSession(req, res, userId) {
  const sid = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { id: hashSid(sid), userId, expiresAt, ip: clientIp(req), device: deviceName(req) } });
  const token = jwt.sign({ sub: userId, sid }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: Math.floor(SESSION_TTL_MS / 1000) });
  res.cookie(COOKIE, token, cookieOptions(SESSION_TTL_MS));
  return hashSid(sid);
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, cookieOptions());
}

// Verifies the cookie's signature and expiry. Returns the payload or null.
export function readToken(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    // Only session tokens: anything carrying a purpose (e.g. a sign-in
    // challenge) is not a session.
    return typeof payload?.sub === 'string' && !payload.purpose ? payload : null;
  } catch {
    return null;
  }
}

// Short-lived, single-purpose tokens (the two-step sign-in challenge) are
// signed with a key derived from JWT_SECRET, so they can never pass as a
// session cookie even if someone puts one there.
const purposeKey = (purpose) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(`kotka:${purpose}`).digest();

export function signPurposeToken(purpose, claims, expiresInSeconds) {
  return jwt.sign({ ...claims, purpose }, purposeKey(purpose), { algorithm: 'HS256', expiresIn: expiresInSeconds });
}

export function readPurposeToken(purpose, token) {
  try {
    const payload = jwt.verify(String(token ?? ''), purposeKey(purpose), { algorithms: ['HS256'] });
    return payload?.purpose === purpose ? payload : null;
  } catch {
    return null;
  }
}

const cache = new Map();

// The live session row for a token's sid, or null if revoked/expired/unknown.
export async function liveSession(payload) {
  const id = hashSid(payload.sid);
  const hit = cache.get(id);
  let row = hit && hit.until > Date.now() ? hit.row : undefined;
  if (row === undefined) {
    row = await prisma.session.findUnique({ where: { id }, select: { id: true, userId: true, expiresAt: true, revokedAt: true, lastSeenAt: true } });
    cache.set(id, { row, until: Date.now() + CACHE_MS });
    if (cache.size > 20_000) cache.clear();
  }
  if (!row || row.revokedAt || row.expiresAt <= new Date() || row.userId !== payload.sub) return null;
  if (Date.now() - new Date(row.lastSeenAt).getTime() > TOUCH_MS) {
    row.lastSeenAt = new Date();
    prisma.session.update({ where: { id }, data: { lastSeenAt: row.lastSeenAt } }).catch(() => {});
  }
  return row;
}

function forget(ids) {
  for (const id of ids) cache.delete(id);
}

export async function revokeSession(id) {
  await prisma.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  forget([id]);
}

// Revokes every session of a user, optionally keeping one (the current).
export async function revokeUserSessions(userId, { except = null } = {}) {
  const rows = await prisma.session.findMany({ where: { userId, revokedAt: null, ...(except ? { id: { not: except } } : {}) }, select: { id: true } });
  if (!rows.length) return 0;
  await prisma.session.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { revokedAt: new Date() } });
  forget(rows.map((r) => r.id));
  return rows.length;
}

export async function listSessions(userId, currentId) {
  const rows = await prisma.session.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' }, take: 50 });
  return rows.map((s) => ({ id: s.id, device: s.device ?? 'Unknown device', createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.id === currentId }));
}

// Old sessions pile up; remove long-expired or revoked rows now and then.
export function pruneSessions() {
  if (Math.random() > 0.01) return;
  prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date(Date.now() - 7 * 24 * 3600e3) } }, { revokedAt: { lt: new Date(Date.now() - 30 * 24 * 3600e3) } }] } }).catch(() => {});
}
