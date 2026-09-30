// Media uploads (images, voice notes) stored in Postgres. There is no file
// store on this deployment yet; if one is added (e.g. Vercel Blob), only
// saveMedia/serveMedia need to change. Clients compress before upload, and
// Vercel caps request bodies at ~4.5 MB.

import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { cleanImage } from './imageSafety.js';

export const MAX_BYTES = { image: 2.5 * 1024 * 1024, audio: 2.5 * 1024 * 1024 };
// Storage per person: what they can add in a day, and keep in all.
const DAILY_BYTES = 40 * 1024 * 1024;
const TOTAL_BYTES = 400 * 1024 * 1024;

// Identify the file from its bytes, not from what the client claims.
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { kind: 'image', mime: 'image/png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', mime: 'image/jpeg' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { kind: 'image', mime: 'image/webp' };
  if (buf.toString('ascii', 0, 4) === 'GIF8') return { kind: 'image', mime: 'image/gif' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: 'audio', mime: 'audio/webm' };
  if (buf.toString('ascii', 0, 4) === 'OggS') return { kind: 'audio', mime: 'audio/ogg' };
  if (buf.toString('ascii', 4, 8) === 'ftyp') return { kind: 'audio', mime: 'audio/mp4' };
  return null;
}

export function mediaUrl(m) {
  return m ? `/api/media/${m.id}/${m.token}` : null;
}

// Returns { media } or { error }.
export async function saveMedia(ownerId, { dataUrl, width, height, durationMs }) {
  if (typeof dataUrl === 'string' && dataUrl.length > 4_000_000) return { error: 'That file is too large. Try a smaller one.' };
  const match = typeof dataUrl === 'string' ? /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl) : null;
  if (!match) return { error: 'Upload must be a base64 data URL.' };
  let buf = Buffer.from(match[2], 'base64');
  const type = sniff(buf);
  if (!type) return { error: 'Only PNG, JPEG, WebP or GIF images and WebM, Ogg or MP4 audio are supported.' };
  if (buf.length > MAX_BYTES[type.kind]) return { error: `That file is too large (max ${Math.round(MAX_BYTES[type.kind] / 1024 / 1024 * 10) / 10} MB).` };
  const int = (v, max) => (Number.isInteger(v) && v > 0 && v <= max ? v : null);
  // Images: real size from the file itself, and location/camera metadata removed.
  if (type.kind === 'image') {
    const clean = cleanImage(buf, type.mime);
    if (clean.error) return { error: clean.error };
    buf = clean.bytes;
    width = clean.width;
    height = clean.height;
  }
  const [today, total] = await Promise.all([
    prisma.media.aggregate({ where: { ownerId, createdAt: { gte: new Date(Date.now() - 86400e3) } }, _sum: { size: true } }),
    prisma.media.aggregate({ where: { ownerId }, _sum: { size: true } }),
  ]);
  if ((today._sum.size ?? 0) + buf.length > DAILY_BYTES) return { error: 'You’ve uploaded a lot today. Try again tomorrow.' };
  if ((total._sum.size ?? 0) + buf.length > TOTAL_BYTES) return { error: 'Your uploads are full. Delete some older posts or messages with images, then try again.' };
  const media = await prisma.media.create({
    data: {
      ownerId,
      token: crypto.randomBytes(18).toString('base64url'),
      kind: type.kind,
      mime: type.mime,
      size: buf.length,
      width: type.kind === 'image' ? int(width, 20000) : null,
      height: type.kind === 'image' ? int(height, 20000) : null,
      durationMs: type.kind === 'audio' ? int(durationMs, 10 * 60 * 1000) : null,
      data: buf,
    },
    select: { id: true, token: true, kind: true, mime: true, size: true, width: true, height: true, durationMs: true },
  });
  return { media: { ...media, url: mediaUrl(media) } };
}

// A post or message is gone (deleted, or removed by a moderator): its images
// and voice notes go too, so the files stop being reachable at their links.
export async function dropAttachedMedia(ownerId, attachments) {
  const ids = (Array.isArray(attachments) ? attachments : []).filter((a) => a && (a.type === 'image' || a.type === 'audio') && a.mediaId).map((a) => String(a.mediaId));
  if (!ids.length || !ownerId) return 0;
  const r = await prisma.media.deleteMany({ where: { id: { in: ids }, ownerId } }).catch(() => ({ count: 0 }));
  return r.count;
}

// Validates an attachment's media reference belongs to the sender.
export async function ownedMedia(ownerId, ids) {
  if (!ids.length) return new Map();
  const rows = await prisma.media.findMany({ where: { id: { in: ids }, ownerId }, select: { id: true, token: true, kind: true, mime: true, width: true, height: true, durationMs: true } });
  return new Map(rows.map((m) => [m.id, m]));
}

export async function serveMedia(req, res) {
  const m = await prisma.media.findUnique({ where: { id: req.params.id } });
  const ok = m && m.token.length === req.params.token.length && crypto.timingSafeEqual(Buffer.from(m.token), Buffer.from(req.params.token));
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.set({
    'Content-Type': m.mime,
    'Content-Length': String(m.size),
    // A day, not a year: removed or deleted uploads drop out of caches soon.
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    // Opened directly, an upload is inert: no scripts, no plugins, no forms.
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
  });
  res.end(Buffer.from(m.data));
}

// Profile photo URL. The avatar id is in the query so a new photo is a new
// URL and nobody keeps seeing the old one from cache.
export function avatarUrl(user) {
  return user?.avatarId ? `/api/media/avatar/${user.id}?v=${user.avatarId.slice(-8)}` : null;
}

// Set (or clear, with null) a user's profile photo. The photo must be an
// image the user uploaded; the replaced photo is deleted so old avatars
// don't pile up in the database.
export async function setAvatar(userId, mediaId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, avatarId: true } });
  if (!user) return { error: 'Account not found.' };
  let next = null;
  if (mediaId !== null) {
    const m = await prisma.media.findFirst({ where: { id: String(mediaId), ownerId: userId, kind: 'image' }, select: { id: true } });
    if (!m) return { error: 'Upload the photo again.' };
    next = m.id;
  }
  if (next === user.avatarId) return { avatarId: next };
  await prisma.user.update({ where: { id: userId }, data: { avatarId: next }, select: { id: true } });
  if (user.avatarId) await prisma.media.deleteMany({ where: { id: user.avatarId, ownerId: userId } });
  return { avatarId: next };
}
