// Append-only record of what people do in Kotka: admin actions, sign-ins,
// account and security changes, verification, and the main user actions
// (trades logged, goals, posts, reports). Admins read it in Admin > Audit Log.
// Never throws: a failed audit write is logged and must not block the action.

import { waitUntil } from '@vercel/functions';
import { prisma } from './prisma.js';
import { clientIp, deviceName } from './requestMeta.js';

export async function audit(req, action, { targetType = null, targetId = null, detail = {}, actor } = {}) {
  try {
    let who = actor ?? req.user ?? null;
    if (!who && req.userId) who = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, email: true } });
    if (who?.id && !who.email) who = { ...who, email: (await prisma.user.findUnique({ where: { id: who.id }, select: { email: true } }))?.email ?? null };
    await prisma.auditLog.create({
      data: {
        actorId: who?.id ?? null,
        actorEmail: who?.email ?? null,
        action,
        targetType,
        targetId,
        detail: { device: deviceName(req) ?? undefined, ...detail },
        ip: clientIp(req),
      },
    });
  } catch (err) {
    console.error(`Audit write failed for ${action}:`, err);
  }
}

// Same record, written after the response so everyday actions stay fast.
export function auditLater(req, action, opts) {
  waitUntil(audit(req, action, opts));
}
