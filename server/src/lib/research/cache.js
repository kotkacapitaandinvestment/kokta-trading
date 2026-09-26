import { prisma } from '../prisma.js';

// Two-layer cache for raw upstream source data: an in-process map (warm
// serverless instances) in front of the ResearchSourceCache table (shared
// across instances). Only successful fetches are cached — a failed source is
// retried on the next research run instead of pinning a failure.

const memory = new Map();

export const HOUR = 60 * 60 * 1000;

export async function cachedSource(key, ttlMs, fetcher, { bypass = false } = {}) {
  const now = Date.now();

  if (!bypass) {
    const hit = memory.get(key);
    if (hit && hit.expiresAt > now) return { data: hit.payload, fetchedAt: hit.fetchedAt, cached: true };

    const row = await prisma.researchSourceCache.findUnique({ where: { key } }).catch(() => null);
    if (row && row.expiresAt.getTime() > now) {
      memory.set(key, { payload: row.payload, fetchedAt: row.fetchedAt.toISOString(), expiresAt: row.expiresAt.getTime() });
      return { data: row.payload, fetchedAt: row.fetchedAt.toISOString(), cached: true };
    }
  }

  const payload = await fetcher();
  const fetchedAt = new Date();
  const expiresAt = new Date(now + ttlMs);
  memory.set(key, { payload, fetchedAt: fetchedAt.toISOString(), expiresAt: expiresAt.getTime() });
  await prisma.researchSourceCache
    .upsert({
      where: { key },
      update: { payload, fetchedAt, expiresAt },
      create: { key, payload, fetchedAt, expiresAt },
    })
    .catch((err) => console.error('Research cache write failed:', key, err.message));
  return { data: payload, fetchedAt: fetchedAt.toISOString(), cached: false };
}

export async function purgeExpiredSourceCache() {
  const { count } = await prisma.researchSourceCache.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * HOUR) } } });
  return count;
}

export function clearMemoryCache() {
  memory.clear();
}

// Cache-only read: returns { data, fetchedAt, expired } or null, never
// fetching. Expired rows are still returned (flagged) for stale fallbacks.
export async function peekSource(key) {
  const hit = memory.get(key);
  if (hit) return { data: hit.payload, fetchedAt: hit.fetchedAt, expired: hit.expiresAt <= Date.now() };
  const row = await prisma.researchSourceCache.findUnique({ where: { key } }).catch(() => null);
  if (!row) return null;
  return { data: row.payload, fetchedAt: row.fetchedAt.toISOString(), expired: row.expiresAt.getTime() <= Date.now() };
}
