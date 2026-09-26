// Append-only record of administrative and security-relevant actions.
// Never throws: a failed audit write is logged and must not block the action.

import { prisma } from './prisma.js';
import { clientIp } from './requestMeta.js';

export async function audit(req, action, { targetType = null, targetId = null, detail = {}, actor } = {}) {
  try {
    let who = actor ?? req.user ?? null;
    if (!who && req.userId) who = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, email: true } });
    await prisma.auditLog.create({
      data: {
        actorId: who?.id ?? null,
        actorEmail: who?.email ?? null,
        action,
        targetType,
        targetId,
        detail,
        ip: clientIp(req),
      },
    });
  } catch (err) {
    console.error(`Audit write failed for ${action}:`, err);
  }
}
