// The ops digest: one email to Super Admins, only when something needs a
// person. Every hour: new errors, payment updates that failed, parts of Kotka
// that are down. Once a day: withdrawals waiting over a day, and disputed
// matches. Nothing new, no email.

import { prisma } from '../prisma.js';
import { hit } from '../rateLimit.js';
import { sendEmail } from '../email/send.js';
import { opsDigestEmail } from '../email/templates.js';
import { supportAddress } from '../appSettings.js';
import { COMPONENTS } from './status.js';

const H = 3600e3;

export async function collectDigest({ daily }) {
  const items = [];
  // Newest first: a new error matters more than an old noisy one (which was in an earlier digest).
  const errors = await prisma.errorGroup.findMany({ where: { status: 'open', alertedAt: null }, orderBy: { firstSeenAt: 'desc' }, take: 15 });
  for (const e of errors) items.push({ kind: 'error', text: `${e.source === 'client' ? 'In the app' : 'On the server'}${e.path ? ` (${e.path})` : ''}: ${e.message} — seen ${e.count} time${e.count === 1 ? '' : 's'}` });
  const failedHooks = await prisma.paymentWebhookEvent.findMany({ where: { status: 'failed', receivedAt: { gte: new Date(Date.now() - 65 * 60e3) } }, take: 10 });
  for (const w of failedHooks) items.push({ kind: 'payment', text: `A ${w.provider} payment update (${w.type}) couldn’t be processed: ${String(w.error ?? '').slice(0, 160)}` });
  const last = await prisma.statusSample.findFirst({ orderBy: { at: 'desc' } });
  if (last && Date.now() - last.at.getTime() < 2 * H) {
    for (const c of COMPONENTS) if (last.checks?.[c.key] === 'down') items.push({ kind: 'down', text: `${c.name} is down (checked ${last.at.toISOString().slice(11, 16)} UTC).` });
  }
  if (daily) {
    const waiting = await prisma.withdrawal.count({ where: { status: 'requested', createdAt: { lt: new Date(Date.now() - 24 * H) } } });
    if (waiting) items.push({ kind: 'money', text: `${waiting} withdrawal${waiting === 1 ? ' has' : 's have'} waited more than a day for review.` });
    const disputed = await prisma.gameMatch.count({ where: { status: 'DISPUTED' } });
    if (disputed) items.push({ kind: 'money', text: `${disputed} disputed match${disputed === 1 ? '' : 'es'} need a decision; the stakes stay locked until then.` });
  }
  return { items, errorIds: errors.map((e) => e.id) };
}

export async function sendOpsDigest() {
  if (await hit('ops:digest', 1, 50 * 60e3)) return { sent: false, reason: 'throttled' };
  const daily = !(await hit('ops:digest-daily', 1, 23 * H));
  const { items, errorIds } = await collectDigest({ daily });
  if (!items.length) return { sent: false, reason: 'nothing new' };
  const admins = await prisma.user.findMany({ where: { role: 'super_admin', status: 'active' }, select: { email: true } });
  const to = [...new Set([...admins.map((a) => a.email), await supportAddress()].filter(Boolean))];
  const mail = opsDigestEmail({ items });
  for (const address of to) await sendEmail({ to: address, ...mail });
  if (errorIds.length) await prisma.errorGroup.updateMany({ where: { id: { in: errorIds } }, data: { alertedAt: new Date() } });
  return { sent: true, to: to.length, items: items.length };
}
