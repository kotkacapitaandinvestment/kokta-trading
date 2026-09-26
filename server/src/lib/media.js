// Media uploads (images, voice notes) stored in Postgres. There is no file
// store on this deployment yet; if one is added (e.g. Vercel Blob), only
// saveMedia/serveMedia need to change. Clients compress before upload, and
// Vercel caps request bodies at ~4.5 MB.

import crypto from 'node:crypto';
import { prisma } from './prisma.js';

export const MAX_BYTES = { image: 2.5 * 1024 * 1024, audio: 2.5 * 1024 * 1024 };

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
  const match = typeof dataUrl === 'string' ? /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl) : null;
  if (!match) return { error: 'Upload must be a base64 data URL.' };
  const buf = Buffer.from(match[2], 'base64');
  const type = sniff(buf);
  if (!type) return { error: 'Only PNG, JPEG, WebP or GIF images and WebM, Ogg or MP4 audio are supported.' };
  if (buf.length > MAX_BYTES[type.kind]) return { error: `That file is too large (max ${Math.round(MAX_BYTES[type.kind] / 1024 / 1024 * 10) / 10} MB).` };
  const int = (v, max) => (Number.isInteger(v) && v > 0 && v <= max ? v : null);
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
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  });
  res.end(Buffer.from(m.data));
}
