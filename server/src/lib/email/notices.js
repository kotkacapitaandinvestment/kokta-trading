// The account emails Kotka sends, in one place: what to send, when, and the
// links inside. Callers run these after responding (waitUntil), so email
// never slows down or breaks sign-up, sign-in or settings.

import dns from 'node:dns/promises';
import { prisma } from '../prisma.js';
import { CANONICAL_ORIGIN } from '../origins.js';
import { loadAppSettings } from '../appSettings.js';
import { deviceName, clientIp } from '../requestMeta.js';
import { sendEmail } from './send.js';
import { createEmailToken } from './tokens.js';
import { welcomeEmail, verifyEmail, passwordResetEmail, passwordChangedEmail, newSignInEmail, twoStepEmail } from './templates.js';

async function send(user, tpl, extra = {}) {
  const settings = await loadAppSettings().catch(() => ({}));
  return sendEmail({ to: user.email, ...tpl, replyTo: settings.supportEmail || undefined, ...extra });
}

export async function sendWelcome(user) {
  const token = await createEmailToken(user.id, 'verify');
  return send(user, welcomeEmail({ name: user.name, verifyUrl: `${CANONICAL_ORIGIN}/verify-email?token=${token}` }));
}

export async function sendVerification(user) {
  const token = await createEmailToken(user.id, 'verify');
  return send(user, verifyEmail({ name: user.name, verifyUrl: `${CANONICAL_ORIGIN}/verify-email?token=${token}` }));
}

export async function sendPasswordReset(user) {
  const token = await createEmailToken(user.id, 'reset');
  return send(user, passwordResetEmail({ name: user.name, resetUrl: `${CANONICAL_ORIGIN}/reset-password?token=${token}` }));
}

export function alertPasswordChanged(user, req, via) {
  return send(user, passwordChangedEmail({ name: user.name, device: deviceName(req), via }));
}

export function alertTwoStep(user, on) {
  return send(user, twoStepEmail({ name: user.name, on }));
}

// A sign-in from a device not seen on this account in the last 90 days.
// Only once there is some history, so nobody gets an alert for every
// device the first time sessions are recorded.
export async function alertIfNewDevice(user, req, sessionId) {
  const device = deviceName(req);
  const since = new Date(Date.now() - 90 * 86400e3);
  const history = await prisma.session.findMany({ where: { userId: user.id, id: { not: sessionId }, createdAt: { gte: since } }, select: { device: true }, take: 200 });
  if (!history.length || history.some((s) => s.device === device)) return null;
  return send(user, newSignInEmail({ name: user.name, device, ip: clientIp(req) }));
}

// Does the address's domain accept email? Refuses only when the domain
// clearly has no mail servers; any lookup trouble lets the sign-up through.
export async function emailDomainAcceptsMail(email) {
  const domain = String(email).split('@')[1];
  if (!domain) return false;
  try {
    const mx = await Promise.race([dns.resolveMx(domain), new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), 3000))]);
    return mx.length > 0;
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
      // No MX: mail can still go to the domain's A record, but a domain with neither can't receive.
      try {
        return (await dns.resolve4(domain)).length > 0;
      } catch {
        return false;
      }
    }
    return true;
  }
}
