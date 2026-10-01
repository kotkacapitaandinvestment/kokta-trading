// Housekeeping that runs from the hourly scheduled job (cron-job.org →
// /api/research/cron). Each task throttles itself, so running the job more
// often never makes a task run more than it should.

import { prisma } from '../prisma.js';
import { hit } from '../rateLimit.js';
import { removeMedia } from '../media.js';
import { objectStore } from '../storage.js';
import { expirePromoCredits } from '../game/promo.js';
import { recordStatusSample } from './status.js';
import { sendOpsDigest } from './alerts.js';

// Uploads nothing points to: attached to a post or message that was never
// sent, or replaced before it was used. Kept for a day, so a draft being
// written isn't broken, then removed. What counts as "used" is every place
// the app stores a media id: profile photos, group and community images,
// achievement share cards, and post and message attachments.
export async function cleanOrphanMedia({ olderThanHours = 24, batch = 500 } = {}) {
  const rows = await prisma.$queryRaw`
    SELECT m.id FROM "Media" m
    WHERE m."createdAt" < now() - make_interval(hours => ${olderThanHours}::int)
      AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."avatarId" = m.id)
      AND NOT EXISTS (SELECT 1 FROM "Conversation" c WHERE c."imageId" = m.id)
      AND NOT EXISTS (SELECT 1 FROM "AchievementShare" a WHERE a."imageId" = m.id)
      AND NOT EXISTS (SELECT 1 FROM "Post" p WHERE p."authorId" = m."ownerId" AND p.attachments @> jsonb_build_array(jsonb_build_object('mediaId', m.id)))
      AND NOT EXISTS (SELECT 1 FROM "Message" g WHERE g."authorId" = m."ownerId" AND g.attachments @> jsonb_build_array(jsonb_build_object('mediaId', m.id)))
    ORDER BY m."createdAt" ASC
    LIMIT ${batch}::int`;
  if (!rows.length) return { removed: 0 };
  return { removed: await removeMedia(rows.map((r) => r.id)) };
}

// Files in R2 whose upload row is gone (an account was deleted, or a delete
// couldn't reach R2 at the time). Only files over a day old, so an upload
// that's still being saved is never touched.
export async function cleanOrphanObjects({ maxPages = 5 } = {}) {
  const store = await objectStore();
  if (!store) return { skipped: 'R2 not connected' };
  let after = null;
  let removed = 0;
  for (let page = 0; page < maxPages; page++) {
    const { objects, next } = await store.list(after);
    const old = objects.filter((o) => o.key && Date.now() - o.modified.getTime() > 24 * 3600e3);
    if (old.length) {
      const known = new Set((await prisma.media.findMany({ where: { storageKey: { in: old.map((o) => o.key) } }, select: { storageKey: true } })).map((m) => m.storageKey));
      for (const o of old) if (!known.has(o.key)) {
        await store.remove(o.key);
        removed += 1;
      }
    }
    if (!next) break;
    after = next;
  }
  return { removed };
}

// Once a day at most, whichever instance gets there first.
const daily = (name) => hit(`ops:${name}`, 1, 23 * 3600e3).then((over) => !over);

export async function runMaintenance() {
  const out = {};
  // Every run: promotional credits past their expiry date leave their wallets.
  out.promoExpired = await expirePromoCredits().catch((err) => ({ error: err.message }));
  // A status sample every run, then the digest (which reads it).
  out.status = await recordStatusSample().catch((err) => ({ error: err.message }));
  out.digest = await sendOpsDigest().catch((err) => ({ error: err.message }));
  if (await daily('orphan-media')) {
    out.orphanMedia = await cleanOrphanMedia().catch((err) => ({ error: err.message }));
    out.orphanFiles = await cleanOrphanObjects().catch((err) => ({ error: err.message }));
  }
  return out;
}
