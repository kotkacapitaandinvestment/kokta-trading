// INBOX (useinbox.com): newsletter list sync, and transactional backup via
// INBOX Notify. The API only accepts short-lived tokens obtained with the
// INBOX account's login email and password, which a super admin saves in
// Connected services (email as the "public key", password as the secret,
// encrypted like every other key).

import { prisma } from '../prisma.js';
import { decryptSecret } from '../crypto.js';

const API = 'https://useapi.useinbox.com';
let cached = { token: null, until: 0, forRow: null };

export async function inboxRow() {
  const row = await prisma.integration.findUnique({ where: { provider: 'inbox' } });
  return row?.enabled && row.secretCipher && row.publicKey ? row : null;
}

async function token(row, { force = false } = {}) {
  const stamp = `${row.id}:${row.updatedAt?.getTime?.() ?? ''}`;
  if (!force && cached.token && cached.until > Date.now() && cached.forRow === stamp) return cached.token;
  const r = await fetch(`${API}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ EmailAddress: row.publicKey, Password: decryptSecret(row.secretCipher) }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => null);
  if (!j?.resultObject?.access_token) throw Object.assign(new Error(`INBOX sign-in failed (${r.status})`), { status: r.status });
  cached = { token: j.resultObject.access_token, until: Date.now() + (Number(j.resultObject.expires_in) || 3600) * 1000 - 60e3, forRow: stamp };
  return cached.token;
}

async function call(row, method, path, body) {
  let t = await token(row);
  let r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${t}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  if (r.status === 401) {
    t = await token(row, { force: true });
    r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${t}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  }
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.resultStatus === false) throw Object.assign(new Error(`INBOX API error (${r.status})`), { status: r.status });
  return j?.resultObject;
}

// Admin "Test connection": signs in and lists the contact lists and senders.
export async function inboxTestConnection(row) {
  const [lists, senders] = await Promise.all([call(row, 'GET', '/inbox/v1/contactlists'), call(row, 'GET', '/notify/v1/senders').catch(() => null)]);
  const names = (lists?.items ?? []).map((l) => `${l.name ?? l.title ?? 'list'} (${l.id})`);
  const chosen = row.config?.listId;
  const listNote = !names.length ? 'No contact lists yet: create one in INBOX for the newsletter.' : chosen ? (names.some((n) => n.includes(chosen)) ? 'The chosen newsletter list was found.' : 'The list id in settings wasn’t found; pick one of these.') : `Lists: ${names.slice(0, 5).join(', ')}. Paste one list id into the settings.`;
  const senderNote = senders?.items?.length ? `${senders.items.length} Notify sender(s) set up.` : 'No Notify sender set up yet (needed for the email backup).';
  return `Connected. ${listNote} ${senderNote}`;
}

// Adds (or re-adds) someone to the newsletter list. Returns the contact id.
export async function subscribe(email) {
  const row = await inboxRow();
  if (!row?.config?.listId) return null;
  return call(row, 'POST', `/inbox/v1/contactlists/${encodeURIComponent(row.config.listId)}/add`, { email });
}

export async function unsubscribe(contactId) {
  const row = await inboxRow();
  if (!row?.config?.listId || !contactId) return;
  await call(row, 'DELETE', `/inbox/v1/contactlists/${encodeURIComponent(row.config.listId)}/delete/${encodeURIComponent(contactId)}`);
}

// Transactional backup (INBOX Notify). Needs an activated sender address.
export async function sendViaInbox(msg) {
  const row = await inboxRow();
  if (!row?.config?.senderEmail) throw new Error('INBOX Notify is not set up');
  await call(row, 'POST', '/notify/v1/send', {
    from: { name: 'Kotka', email: row.config.senderEmail },
    to: [{ email: msg.to }],
    subject: msg.subject,
    htmlContent: msg.html,
  });
}
