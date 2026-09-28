// Sends Kotka's emails: Resend first, INBOX Notify as the backup when Resend
// is down or not set up. Email never blocks the action that triggered it:
// failures are logged and reported to the caller, not thrown.
//
// Keys come from Connected services (Integration rows 'resend' and 'inbox'),
// encrypted at rest.

import { prisma } from '../prisma.js';
import { decryptSecret } from '../crypto.js';
import { sendViaInbox } from './inbox.js';

export const FROM = 'Kotka <no-reply@kotkafinance.online>';

// Tests capture email instead of sending it.
let outbox = null;
export function captureEmails() {
  outbox = [];
  return outbox;
}

async function resendKey() {
  const row = await prisma.integration.findUnique({ where: { provider: 'resend' } });
  return row?.enabled && row.secretCipher ? decryptSecret(row.secretCipher) : null;
}

async function sendViaResend(key, msg) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(msg.idempotencyKey ? { 'Idempotency-Key': msg.idempotencyKey } : {}) },
    body: JSON.stringify({
      from: FROM,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      tags: msg.tag ? [{ name: 'category', value: msg.tag }] : undefined,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Object.assign(new Error(`Resend API error (${r.status})`), { status: r.status });
  return (await r.json().catch(() => ({}))).id ?? null;
}

// msg: { to, subject, html, text, tag, replyTo?, idempotencyKey? }
// Returns { provider } or { error }.
export async function sendEmail(msg) {
  if (!msg?.to || !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(msg.to)) return { error: 'bad address' };
  if (outbox) {
    outbox.push(msg);
    return { provider: 'test' };
  }
  const key = await resendKey().catch(() => null);
  if (key) {
    try {
      await sendViaResend(key, msg);
      return { provider: 'resend' };
    } catch (err) {
      // A rejected message (4xx other than rate limiting) won't fare better elsewhere.
      if (err.status && err.status < 500 && err.status !== 429) {
        console.error('Email not sent (Resend refused it):', err.message, msg.tag);
        return { error: err.message };
      }
      console.error('Resend failed, trying INBOX:', err.message);
    }
  }
  try {
    await sendViaInbox(msg);
    return { provider: 'inbox' };
  } catch (err) {
    console.error('Email not sent:', err.message, msg.tag);
    return { error: err.message };
  }
}
