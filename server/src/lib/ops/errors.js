// Kotka's own error tracking: errors from people's browsers and from the
// server, grouped by what they are. Before anything is stored, the text is
// cleaned of what could identify someone or unlock something: email
// addresses, long numbers, tokens and query strings.

import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
import { hit, memoryHit } from '../rateLimit.js';

const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

export function scrub(text) {
  // Capped first: the patterns below must never see a huge input.
  return String(text ?? '')
    .slice(0, 10000)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/\?[^\s)'"]*/g, '') // query strings (reset links carry tokens there)
    .replace(/\b(?:eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g, '<jwt>')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<token>')
    .replace(/\b\d{6,}\b/g, '<n>');
}

// Ids in paths become placeholders, so /api/game/matches/abc123 and
// /api/game/matches/def456 are one route.
export function routeOf(path) {
  return scrub(String(path ?? '').split('?')[0])
    .replace(/\/c[a-z0-9]{20,}(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:n')
    .slice(0, 200);
}

// Same kind of error → same fingerprint: the message with its variable parts
// taken out, and the first line of the stack that points into Kotka's code.
function fingerprintOf(source, message, stack) {
  const shape = message.replace(/<[a-z]+>/g, '').replace(/\d+/g, '#').replace(/(["'`]).*?\1/g, '$1…$1').slice(0, 200);
  const frame = String(stack ?? '').split('\n').map((l) => l.trim()).find((l) => /^at |@/.test(l) && !/node_modules|node:internal/.test(l)) ?? '';
  const where = frame.replace(/:\d+:\d+\)?$/, '').replace(/https?:\/\/[^/]+/, '').replace(/-[A-Za-z0-9_]{8}\.js/, '.js');
  return crypto.createHash('sha256').update(`${source}|${shape}|${where}`).digest('hex').slice(0, 32);
}

/**
 * Records one error. source: 'client' | 'server'. Never throws: error
 * tracking must not create errors of its own.
 */
export async function recordError({ source, message, stack, path, release, userId = null, sample = null }) {
  try {
    // Links are dropped from messages: anyone can report an error, and the
    // newest ones are emailed to staff, so they must not carry a link to click.
    const msg = scrub(message).replace(/\b(?:https?:\/\/|www\.)\S+/gi, '<link>').trim().slice(0, MAX_MESSAGE) || 'Unknown error';
    const st = stack ? scrub(stack).split('\n').slice(0, 25).join('\n').slice(0, MAX_STACK) : null;
    const fingerprint = fingerprintOf(source, msg, st);
    // A burst of the same error from one instance counts, but writes at most once a second.
    if (memoryHit(`errgroup:${fingerprint}`, 1, 1000)) return null;
    // Errors anyone can report make at most 100 new kinds an hour, across all
    // servers, so the table can't be flooded with made-up ones.
    if (source === 'client' && !(await prisma.errorGroup.findUnique({ where: { fingerprint }, select: { id: true } })) && (await hit('telemetry:new-kinds', 100, 3600e3))) return null;
    const now = new Date();
    return await prisma.errorGroup.upsert({
      where: { fingerprint },
      update: { count: { increment: 1 }, lastSeenAt: now, lastUserId: userId, sample: sample ?? undefined, release: release ?? undefined, message: msg, stack: st ?? undefined, path: path ? routeOf(path) : undefined, ...(await reopenIfResolved(fingerprint)) },
      create: { fingerprint, source, message: msg, stack: st, path: path ? routeOf(path) : null, release: release ?? null, sample, lastUserId: userId },
      select: { id: true },
    });
  } catch (err) {
    console.error('Error tracking failed:', err.message);
    return null;
  }
}

// A resolved error that comes back is open again (muted ones stay muted).
async function reopenIfResolved(fingerprint) {
  const g = await prisma.errorGroup.findUnique({ where: { fingerprint }, select: { status: true } });
  return g?.status === 'resolved' ? { status: 'open', alertedAt: null } : {};
}

export function errorGroupView(g, { withStack = false } = {}) {
  return {
    id: g.id,
    source: g.source,
    message: g.message,
    path: g.path,
    release: g.release,
    count: g.count,
    status: g.status,
    firstSeenAt: g.firstSeenAt,
    lastSeenAt: g.lastSeenAt,
    sample: g.sample,
    ...(withStack ? { stack: g.stack } : {}),
  };
}
