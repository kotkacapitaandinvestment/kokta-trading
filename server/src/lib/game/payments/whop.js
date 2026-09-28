// Whop: Kotka's main payment provider.
//   Deposits:    a one-time checkout in NGN (checkout configuration). Credited
//                only from a verified payment.succeeded webhook, re-checked
//                against the Payments API.
//   Withdrawals: each person gets a Whop connected account (they finish
//                identity checks and choose where to be paid on Whop's own
//                hosted pages). Kotka transfers the approved amount to that
//                account; they withdraw it from Whop's payout portal.
// Settings live in the "whop" integration: API key (encrypted), company id,
// webhook secret (encrypted). Docs: https://docs.whop.com/

import crypto from 'node:crypto';
import { prisma } from '../../prisma.js';
import { decryptSecret } from '../../crypto.js';

export const WHOP_API = 'https://api.whop.com/api/v1';

export class ProviderError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

export async function whopSettings() {
  const row = await prisma.integration.findUnique({ where: { provider: 'whop' } });
  if (!row?.enabled || !row.secretCipher || !row.config?.companyId) return null;
  let webhookSecret = null;
  try {
    webhookSecret = row.config.webhookSecretCipher ? decryptSecret(row.config.webhookSecretCipher) : null;
  } catch {
    webhookSecret = null;
  }
  return { apiKey: decryptSecret(row.secretCipher), companyId: row.config.companyId, webhookSecret };
}

async function call(apiKey, method, path, body) {
  let res;
  try {
    res = await fetch(`${WHOP_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new ProviderError(`Whop couldn’t be reached (${err.name === 'TimeoutError' ? 'timed out' : 'network error'}).`, { retryable: true });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.message ?? `HTTP ${res.status}`;
    throw new ProviderError(`Whop: ${String(msg).slice(0, 200)}`, { status: res.status, retryable: res.status >= 500 || res.status === 429 });
  }
  return data;
}

const naira = (kobo) => Math.round(kobo) / 100;
const absolute = (url) => (url?.startsWith('/') ? `https://whop.com${url}` : url);

export async function createCheckout(cfg, { amountKobo, depositId, userId, redirectUrl }) {
  const r = await call(cfg.apiKey, 'POST', '/checkout_configurations', {
    mode: 'payment',
    currency: 'ngn',
    plan: { company_id: cfg.companyId, currency: 'ngn', plan_type: 'one_time', initial_price: naira(amountKobo), title: 'Kotka wallet deposit', visibility: 'hidden' },
    metadata: { kotka_deposit: depositId, kotka_user: userId },
    redirect_url: redirectUrl,
  });
  return { providerRef: r.id, url: absolute(r.purchase_url) };
}

export const getPayment = (cfg, id) => call(cfg.apiKey, 'GET', `/payments/${encodeURIComponent(id)}`);

// A Whop payment matches a deposit when it's paid, in NGN, for the amount.
export function paymentMatches(payment, deposit) {
  const paid = payment?.status === 'paid' && (!payment.substatus || payment.substatus === 'succeeded');
  const amount = Math.round(Number(payment?.subtotal ?? payment?.total ?? 0) * 100);
  return paid && String(payment.currency).toLowerCase() === 'ngn' && amount === Number(deposit.amountKobo) && payment.metadata?.kotka_deposit === deposit.id;
}

/**
 * Standard Webhooks signature, as Whop uses it: HMAC-SHA256 of
 * "{webhook-id}.{webhook-timestamp}.{raw body}", base64, in webhook-signature
 * as "v1,<sig>" (several may be listed). Whop keys the HMAC with the ws_…
 * secret exactly as given. Deliveries older than 5 minutes are refused.
 */
export function verifyWebhook(rawBody, headers, secret, { toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000) } = {}) {
  const id = headers['webhook-id'];
  const ts = headers['webhook-timestamp'];
  const sigHeader = headers['webhook-signature'];
  if (!secret || !id || !ts || !sigHeader) return { ok: false, reason: 'missing signature headers' };
  if (!/^\d+$/.test(String(ts)) || Math.abs(nowSec - Number(ts)) > toleranceSec) return { ok: false, reason: 'timestamp outside tolerance' };
  const signed = `${id}.${ts}.${rawBody.toString('utf8')}`;
  const keys = [Buffer.from(secret, 'utf8')];
  // Plain Standard Webhooks secrets (whsec_<base64>) are keyed by the decoded bytes.
  if (secret.startsWith('whsec_')) keys.push(Buffer.from(secret.slice(6), 'base64'));
  const expected = keys.map((k) => crypto.createHmac('sha256', k).update(signed).digest());
  for (const part of String(sigHeader).split(' ')) {
    const [ver, sig] = part.split(',');
    if (ver !== 'v1' || !sig) continue;
    const got = Buffer.from(sig, 'base64');
    if (expected.some((e) => e.length === got.length && crypto.timingSafeEqual(e, got))) return { ok: true, id };
  }
  return { ok: false, reason: 'signature mismatch' };
}

// A connected account under Kotka's company, for one person's payouts.
export async function createConnectedAccount(cfg, { userId, name, email }) {
  const r = await call(cfg.apiKey, 'POST', '/companies', { title: `${String(name).slice(0, 48)} (Kotka)`, email, parent_company_id: cfg.companyId, metadata: { kotka_user: userId } });
  return r.id ?? r.account?.id;
}

// use: 'account_onboarding' (identity checks and where to be paid) or 'payouts_portal'.
export async function accountLink(cfg, { accountId, use, returnUrl, refreshUrl }) {
  const r = await call(cfg.apiKey, 'POST', '/account_links', { account_id: accountId, use_case: use, return_url: returnUrl, refresh_url: refreshUrl });
  return { url: r.url, expiresAt: r.expires_at ?? null };
}

// Moves an approved withdrawal from Kotka's Whop balance to the person's account.
export async function transfer(cfg, { destinationId, amountKobo, withdrawalId }) {
  const r = await call(cfg.apiKey, 'POST', '/transfers', {
    origin_id: cfg.companyId,
    destination_id: destinationId,
    amount: naira(amountKobo),
    currency: 'ngn',
    type: 'ledger',
    idempotence_key: withdrawalId,
    notes: 'Kotka wallet withdrawal',
    metadata: { kotka_withdrawal: withdrawalId },
  });
  return { providerRef: r.id, status: r.status };
}

export async function testConnection(apiKey, companyId) {
  if (!companyId?.startsWith('biz_')) return 'Add your Whop company id (it starts with biz_) and save, then test again.';
  const c = await call(apiKey, 'GET', `/companies/${encodeURIComponent(companyId)}`);
  return `Connected to Whop as “${c.title ?? companyId}”.`;
}
