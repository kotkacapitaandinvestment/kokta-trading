// Paystack: the optional second provider (switched on in Game settings).
//   Deposits:    hosted checkout (transaction/initialize); credited from a
//                verified charge.success webhook or the return-page check,
//                both re-checked with transaction/verify.
//   Withdrawals: a bank transfer recipient per person (the account name must
//                match their verified legal name, or an admin reviews it),
//                then /transfer from Kotka's Paystack balance.
// Webhooks are signed with HMAC-SHA512 of the raw body using the secret key.

import crypto from 'node:crypto';
import { prisma } from '../../prisma.js';
import { decryptSecret } from '../../crypto.js';
import { ProviderError } from './whop.js';

const API = 'https://api.paystack.co';

export async function paystackSettings() {
  const row = await prisma.integration.findUnique({ where: { provider: 'paystack' } });
  if (!row?.enabled || !row.secretCipher) return null;
  return { secretKey: decryptSecret(row.secretCipher) };
}

async function call(secretKey, method, path, body) {
  let res;
  try {
    res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  } catch (err) {
    throw new ProviderError(`Paystack couldn’t be reached (${err.name === 'TimeoutError' ? 'timed out' : 'network error'}).`, { retryable: true });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.status === false) throw new ProviderError(`Paystack: ${String(data?.message ?? `HTTP ${res.status}`).slice(0, 200)}`, { status: res.status, retryable: res.status >= 500 || res.status === 429 });
  return data.data;
}

export async function createCheckout(cfg, { amountKobo, depositId, userId, email, redirectUrl }) {
  const d = await call(cfg.secretKey, 'POST', '/transaction/initialize', { email, amount: amountKobo, currency: 'NGN', reference: depositId, callback_url: redirectUrl, metadata: { kotka_deposit: depositId, kotka_user: userId } });
  return { providerRef: d.reference, url: d.authorization_url };
}

export const verifyTransaction = (cfg, reference) => call(cfg.secretKey, 'GET', `/transaction/verify/${encodeURIComponent(reference)}`);

export function transactionMatches(tx, deposit) {
  return tx?.status === 'success' && tx.currency === 'NGN' && Number(tx.amount) === Number(deposit.amountKobo) && tx.reference === deposit.providerRef;
}

export function verifyWebhook(rawBody, signature, secretKey) {
  if (!signature || !secretKey) return false;
  const expected = Buffer.from(crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex'));
  const got = Buffer.from(String(signature));
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

let banks = null;
export async function listBanks(cfg) {
  if (banks && banks.expires > Date.now()) return banks.list;
  const d = await call(cfg.secretKey, 'GET', '/bank?country=nigeria&currency=NGN&perPage=200');
  const list = d.filter((b) => b.active !== false).map((b) => ({ code: b.code, name: b.name }));
  banks = { list, expires: Date.now() + 12 * 3600e3 };
  return list;
}

export async function resolveAccount(cfg, { accountNumber, bankCode }) {
  const d = await call(cfg.secretKey, 'GET', `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);
  return d.account_name;
}

export async function createRecipient(cfg, { name, accountNumber, bankCode }) {
  const d = await call(cfg.secretKey, 'POST', '/transferrecipient', { type: 'nuban', name, account_number: accountNumber, bank_code: bankCode, currency: 'NGN' });
  return { code: d.recipient_code, bankName: d.details?.bank_name ?? null };
}

export async function transfer(cfg, { recipient, amountKobo, withdrawalId }) {
  const d = await call(cfg.secretKey, 'POST', '/transfer', { source: 'balance', amount: amountKobo, recipient, reference: withdrawalId, reason: 'Kotka wallet withdrawal' });
  return { providerRef: d.transfer_code ?? d.reference, status: d.status };
}
