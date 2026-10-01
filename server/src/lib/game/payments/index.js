// Real money in and out of Kotka wallets. Whop is the main provider;
// Paystack is optional and switchable in Game settings.
//
// Deposits:    initiated → succeeded | failed | expired
//              Credited once (ledger key deposit:<id>) and only after the
//              provider's API confirms the payment is paid, in NGN, for the
//              exact amount, for this deposit. The browser never confirms.
// Withdrawals: requested → processing → paid
//                        ↘ rejected / cancelled / failed (money goes back)
//              Requesting moves the amount from available to pending, so it
//              can't be staked or withdrawn twice. With manual approval an
//              admin approves each one first.
// Webhooks:    every delivery is recorded (PaymentWebhookEvent) and handled
//              once; providers deliver at least once.

import { prisma } from '../../prisma.js';
import { CANONICAL_ORIGIN } from '../../origins.js';
import { openDetails } from '../../kyc.js';
import { loadGameSettings } from '../config.js';
import { post, walletFor, kobo } from '../wallet.js';
import { GameError, TX } from '../matches.js';
import { assertDepositWithinLimits } from '../limits.js';
import * as whop from './whop.js';
import * as paystack from './paystack.js';

export const PROVIDER_NAMES = { whop: 'Whop', paystack: 'Paystack' };

// Which providers people can use right now.
export async function providers() {
  const s = await loadGameSettings();
  const [w, p] = await Promise.all([whop.whopSettings().catch(() => null), paystack.paystackSettings().catch(() => null)]);
  const list = [];
  const add = (key, cfg) => cfg && list.push({ key, name: PROVIDER_NAMES[key], primary: s.primaryProvider === key });
  if (s.primaryProvider === 'whop') {
    add('whop', w);
    if (s.paystackEnabled) add('paystack', p);
  } else {
    add('paystack', p);
    add('whop', w);
  }
  return { list, whop: w, paystack: p, settings: s };
}

async function configFor(key) {
  const cfg = key === 'whop' ? await whop.whopSettings() : key === 'paystack' ? await paystack.paystackSettings() : null;
  if (!cfg) throw new GameError(`${PROVIDER_NAMES[key] ?? 'That provider'} isn’t set up yet.`, 503, 'provider_unavailable');
  return cfg;
}

async function assertVerified(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { status: true, kyc: { select: { status: true } } } });
  if (!u || u.status !== 'active') throw new GameError('Your account can’t move money right now.', 403);
  if (u.kyc?.status !== 'approved') throw new GameError('Deposits and withdrawals need your identity to be verified first.', 403, 'kyc_required_for_money');
}

// ── Deposits ───────────────────────────────────────────────────────────────

export async function startDeposit(user, { amountKobo, provider }) {
  const { list, settings: s } = await providers();
  if (!s.depositsEnabled) throw new GameError('Deposits are paused right now. Please try again later.', 503, 'deposits_paused');
  await assertVerified(user.id);
  if (!Number.isInteger(amountKobo) || amountKobo < s.minDepositKobo || amountKobo > s.maxDepositKobo) throw new GameError(`Deposit from ₦${(s.minDepositKobo / 100).toLocaleString('en-NG')} to ₦${(s.maxDepositKobo / 100).toLocaleString('en-NG')}.`);
  // The trader's own limits and breaks.
  await assertDepositWithinLimits(user.id, amountKobo);
  const choice = list.find((p) => p.key === (provider ?? list[0]?.key));
  if (!choice) throw new GameError('Deposits aren’t set up yet. Please check back soon.', 503, 'provider_unavailable');
  const cfg = await configFor(choice.key);
  const dep = await prisma.deposit.create({ data: { userId: user.id, provider: choice.key, amountKobo: BigInt(amountKobo) } });
  const redirectUrl = `${CANONICAL_ORIGIN}/app/game/wallet?deposit=${dep.id}`;
  try {
    const r = choice.key === 'whop' ? await whop.createCheckout(cfg, { amountKobo, depositId: dep.id, userId: user.id, redirectUrl }) : await paystack.createCheckout(cfg, { amountKobo, depositId: dep.id, userId: user.id, email: user.email, redirectUrl });
    await prisma.deposit.update({ where: { id: dep.id }, data: { providerRef: r.providerRef, checkoutUrl: r.url } });
    return { deposit: depositView({ ...dep, providerRef: r.providerRef }), checkoutUrl: r.url };
  } catch (err) {
    await prisma.deposit.update({ where: { id: dep.id }, data: { status: 'failed', failureReason: String(err.message).slice(0, 300) } });
    console.error('Deposit checkout failed:', err.message);
    throw new GameError(`We couldn’t start the payment with ${PROVIDER_NAMES[choice.key]}. Please try again in a moment.`, 502, 'provider_error');
  }
}

// Credits a deposit once. Called only after the provider confirmed it.
async function creditDeposit(depositId, providerPaymentId) {
  return prisma.$transaction(async (tx) => {
    const [d] = await tx.$queryRaw`SELECT * FROM "Deposit" WHERE "id" = ${depositId} FOR UPDATE`;
    if (!d || !d.userId) return { credited: false };
    if (d.status === 'succeeded') return { credited: false, already: true };
    const w = await walletFor(d.userId, tx);
    await post(tx, { walletId: w.id, userId: d.userId, type: 'deposit', amount: kobo(d.amountKobo), available: kobo(d.amountKobo), key: `deposit:${d.id}`, depositId: d.id, reason: `${PROVIDER_NAMES[d.provider]} payment ${providerPaymentId ?? d.providerRef}` });
    await tx.deposit.update({ where: { id: d.id }, data: { status: 'succeeded', providerPaymentId: providerPaymentId ?? d.providerPaymentId, completedAt: new Date() } });
    return { credited: true };
  }, TX);
}

// "Check my payment": asks the provider directly (never trusts the browser).
export async function refreshDeposit(user, depositId) {
  const d = await prisma.deposit.findUnique({ where: { id: depositId } });
  if (!d || d.userId !== user.id) throw new GameError('We couldn’t find that deposit.', 404);
  if (d.status !== 'initiated' || !d.providerRef) return depositView(d);
  if (d.provider === 'paystack') {
    const cfg = await configFor('paystack');
    const t = await paystack.verifyTransaction(cfg, d.providerRef).catch(() => null);
    if (t && paystack.transactionMatches(t, d)) await creditDeposit(d.id, String(t.id));
    else if (t && ['failed', 'abandoned'].includes(t.status) && Date.now() - d.createdAt.getTime() > 30 * 60e3) await prisma.deposit.update({ where: { id: d.id }, data: { status: 'failed', failureReason: `Paystack: ${t.status}` } });
  } else if (d.providerPaymentId) {
    const cfg = await configFor('whop');
    const pmt = await whop.getPayment(cfg, d.providerPaymentId).catch(() => null);
    if (pmt && whop.paymentMatches(pmt, d)) await creditDeposit(d.id, pmt.id);
  }
  // Whop confirms by webhook; until then the deposit waits.
  return depositView(await prisma.deposit.findUnique({ where: { id: d.id } }));
}

export function depositView(d) {
  return { id: d.id, provider: d.provider, providerName: PROVIDER_NAMES[d.provider], amountKobo: kobo(d.amountKobo), status: d.status, failureReason: d.status === 'failed' ? 'The payment didn’t go through.' : null, createdAt: d.createdAt, completedAt: d.completedAt ?? null };
}

// ── Webhooks ───────────────────────────────────────────────────────────────

async function once(provider, eventId, type, fn) {
  const id = `${provider}:${eventId}`;
  try {
    await prisma.paymentWebhookEvent.create({ data: { id, provider, type } });
  } catch (err) {
    if (err.code === 'P2002') {
      const seen = await prisma.paymentWebhookEvent.findUnique({ where: { id } });
      if (seen?.status !== 'failed') return { duplicate: true };
    } else throw err;
  }
  try {
    const outcome = await fn();
    await prisma.paymentWebhookEvent.update({ where: { id }, data: { status: outcome === 'ignored' ? 'ignored' : 'processed', processedAt: new Date(), error: null } });
    return { duplicate: false, outcome };
  } catch (err) {
    await prisma.paymentWebhookEvent.update({ where: { id }, data: { status: 'failed', error: String(err.message).slice(0, 500) } });
    throw err;
  }
}

const WHOP_CLAWBACK = new Set(['refund.created', 'refund.updated', 'dispute.created', 'dispute.updated', 'dispute_alert.created']);

export async function handleWhopWebhook(rawBody, headers) {
  const cfg = await whop.whopSettings();
  if (!cfg?.webhookSecret) return { status: 503, body: { error: 'Whop webhooks aren’t set up.' } };
  const v = whop.verifyWebhook(rawBody, headers, cfg.webhookSecret);
  if (!v.ok) return { status: 401, body: { error: 'Invalid signature.' } };
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { status: 400, body: { error: 'Invalid JSON.' } };
  }
  await once('whop', v.id, event.type ?? 'unknown', async () => {
    const data = event.data ?? {};
    // Payment events carry our metadata on the payment itself; refund and
    // dispute events carry it on the payment they point at.
    const depositId = data.metadata?.kotka_deposit ?? data.payment?.metadata?.kotka_deposit;
    if (event.type === 'payment.succeeded' && depositId) {
      const d = await prisma.deposit.findUnique({ where: { id: String(depositId) } });
      if (!d || d.provider !== 'whop') return 'ignored';
      await prisma.deposit.update({ where: { id: d.id }, data: { providerPaymentId: data.id } });
      // Re-check with the Payments API rather than trusting the payload.
      const pmt = await whop.getPayment(cfg, data.id);
      if (!whop.paymentMatches(pmt, d)) throw new Error(`Whop payment ${data.id} doesn’t match deposit ${d.id}`);
      await creditDeposit(d.id, pmt.id);
      return 'credited';
    }
    if (event.type === 'payment.failed' && depositId) {
      await prisma.deposit.updateMany({ where: { id: String(depositId), status: 'initiated' }, data: { status: 'failed', failureReason: 'Whop: payment failed' } });
      return 'failed';
    }
    // A refund or chargeback on a deposit: freeze the wallet until a person
    // reviews it, so the money can't be staked or withdrawn meanwhile. Event
    // names and shapes are from Whop's API reference (checked 2026-09-30):
    // `data` is the Refund or Dispute, with the original payment in
    // `data.payment` (id and metadata). Whatever the outcome (a refund that
    // failed, a dispute won or lost), a person clears the hold.
    if (WHOP_CLAWBACK.has(event.type) || /refund|dispute|chargeback/.test(event.type ?? '')) {
      const paymentId = data.payment?.id ?? data.payment_id ?? (String(data.id ?? '').startsWith('pay_') ? data.id : null);
      const d = depositId ? await prisma.deposit.findUnique({ where: { id: String(depositId) } }) : paymentId ? await prisma.deposit.findFirst({ where: { provider: 'whop', providerPaymentId: String(paymentId) } }) : null;
      if (!d || d.provider !== 'whop') return 'ignored';
      const what = `${event.type}${data.status ? ` (${data.status})` : ''}${data.amount != null ? `, ${data.amount} ${String(data.currency ?? '').toUpperCase()}`.trimEnd() : ''}`;
      await prisma.deposit.update({ where: { id: d.id }, data: { failureReason: `Whop reported ${what} after payment. Review this deposit.` } });
      await freezeWallet(d.userId, `Whop ${what} on deposit ${d.id}`);
      return 'frozen';
    }
    return 'ignored';
  });
  return { status: 200, body: { received: true } };
}

export async function handlePaystackWebhook(rawBody, signature) {
  const cfg = await paystack.paystackSettings();
  if (!cfg) return { status: 503, body: { error: 'Paystack isn’t set up.' } };
  if (!paystack.verifyWebhook(rawBody, signature, cfg.secretKey)) return { status: 401, body: { error: 'Invalid signature.' } };
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { status: 400, body: { error: 'Invalid JSON.' } };
  }
  const data = event.data ?? {};
  const eventId = `${event.event}:${data.id ?? data.reference ?? data.transfer_code}`;
  await once('paystack', eventId, event.event ?? 'unknown', async () => {
    if (event.event === 'charge.success') {
      const d = await prisma.deposit.findFirst({ where: { provider: 'paystack', providerRef: String(data.reference) } });
      if (!d) return 'ignored';
      const t = await paystack.verifyTransaction(cfg, d.providerRef);
      if (!paystack.transactionMatches(t, d)) throw new Error(`Paystack transaction ${data.reference} doesn’t match deposit ${d.id}`);
      await creditDeposit(d.id, String(t.id));
      return 'credited';
    }
    // A refund or chargeback on a Paystack deposit: hold the wallet for review.
    if (/^(charge\.dispute|refund)\./.test(event.event ?? '')) {
      const ref = data.transaction?.reference ?? data.transaction_reference ?? data.reference;
      const d = ref ? await prisma.deposit.findFirst({ where: { provider: 'paystack', providerRef: String(ref) } }) : null;
      if (!d) return 'ignored';
      await prisma.deposit.update({ where: { id: d.id }, data: { failureReason: `Paystack reported ${event.event} after payment. Review this deposit.` } });
      await freezeWallet(d.userId, `Paystack ${event.event} on deposit ${d.id}`);
      return 'frozen';
    }
    if (['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(event.event)) {
      const w = await prisma.withdrawal.findUnique({ where: { id: String(data.reference) } });
      if (!w || w.provider !== 'paystack') return 'ignored';
      if (event.event === 'transfer.success') await markPaid(w.id);
      else await markFailed(w.id, `Paystack: ${event.event.replace('transfer.', 'transfer ')}`);
      return 'updated';
    }
    return 'ignored';
  });
  return { status: 200, body: { received: true } };
}

// ── Payout accounts ────────────────────────────────────────────────────────

const words = (s) => String(s ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);

// The bank account name should belong to the verified person.
async function nameMatches(userId, accountName) {
  const k = await prisma.kycProfile.findUnique({ where: { userId } });
  if (!k) return false;
  const d = openDetails(k.detailsCipher);
  const legal = new Set(words([d.firstName, d.middleName, d.lastName].join(' ')));
  const hits = words(accountName).filter((w) => legal.has(w)).length;
  return hits >= 2;
}

export async function payoutStatus(user) {
  const { list, settings: s } = await providers();
  const accounts = await prisma.payoutAccount.findMany({ where: { userId: user.id } });
  return {
    providers: list,
    withdrawalsEnabled: s.withdrawalsEnabled,
    approval: s.withdrawalApproval,
    accounts: accounts.map((a) => ({ provider: a.provider, providerName: PROVIDER_NAMES[a.provider], bankName: a.bankName, accountLast4: a.accountLast4, accountName: a.accountName, nameMatchesId: a.nameMatchesId, createdAt: a.createdAt })),
  };
}

// Whop: create the connected account if needed, then send the person to
// Whop to finish identity checks and choose where to be paid.
export async function whopOnboardingLink(user, use = 'account_onboarding') {
  await assertVerified(user.id);
  const cfg = await configFor('whop');
  let acct = await prisma.payoutAccount.findUnique({ where: { userId_provider: { userId: user.id, provider: 'whop' } } });
  if (!acct) {
    const id = await whop.createConnectedAccount(cfg, { userId: user.id, name: user.name, email: user.email });
    if (!id) throw new GameError('Whop didn’t return an account. Please try again.', 502, 'provider_error');
    acct = await prisma.payoutAccount.create({ data: { userId: user.id, provider: 'whop', externalId: id } });
  }
  const back = `${CANONICAL_ORIGIN}/app/game/wallet?payout=whop`;
  return whop.accountLink(cfg, { accountId: acct.externalId, use: use === 'payouts_portal' ? 'payouts_portal' : 'account_onboarding', returnUrl: back, refreshUrl: back });
}

export async function paystackBanks() {
  return paystack.listBanks(await configFor('paystack'));
}

export async function setPaystackAccount(user, { bankCode, accountNumber }) {
  await assertVerified(user.id);
  if (!/^\d{10}$/.test(String(accountNumber ?? ''))) throw new GameError('Enter your 10-digit account number.');
  if (!/^\d{3,6}$/.test(String(bankCode ?? ''))) throw new GameError('Choose your bank.');
  const cfg = await configFor('paystack');
  const name = await paystack.resolveAccount(cfg, { accountNumber, bankCode }).catch(() => null);
  if (!name) throw new GameError('We couldn’t find that account. Check the number and bank.');
  const matches = await nameMatches(user.id, name);
  const r = await paystack.createRecipient(cfg, { name, accountNumber, bankCode });
  const data = { externalId: r.code, bankName: r.bankName, accountLast4: String(accountNumber).slice(-4), accountName: name, nameMatchesId: matches };
  await prisma.payoutAccount.upsert({ where: { userId_provider: { userId: user.id, provider: 'paystack' } }, update: data, create: { userId: user.id, provider: 'paystack', ...data } });
  return { accountName: name, nameMatchesId: matches };
}

// ── Withdrawals ────────────────────────────────────────────────────────────

// A wallet on hold: no stakes and no withdrawals until an admin clears it.
export async function freezeWallet(userId, reason) {
  if (!userId) return;
  const w = await walletFor(userId);
  await prisma.wallet.update({ where: { id: w.id }, data: { frozenAt: new Date(), frozenReason: String(reason).slice(0, 300) } });
}

export async function requestWithdrawal(user, { amountKobo, provider }) {
  const { list, settings: s } = await providers();
  if (!s.withdrawalsEnabled) throw new GameError('Withdrawals are paused right now. Your balance is safe; please try again later.', 503, 'withdrawals_paused');
  await assertVerified(user.id);
  const held = await prisma.wallet.findUnique({ where: { userId: user.id }, select: { frozenAt: true } });
  if (held?.frozenAt) throw new GameError('Your wallet is on hold while a payment is reviewed, so withdrawals are paused. Contact support to clear it.', 403, 'wallet_frozen');
  if (!Number.isInteger(amountKobo) || amountKobo < s.minWithdrawalKobo) throw new GameError(`The smallest withdrawal is ₦${(s.minWithdrawalKobo / 100).toLocaleString('en-NG')}.`);
  const key = provider ?? list[0]?.key;
  if (!list.some((p) => p.key === key)) throw new GameError('Withdrawals aren’t set up yet. Please check back soon.', 503, 'provider_unavailable');
  const acct = await prisma.payoutAccount.findUnique({ where: { userId_provider: { userId: user.id, provider: key } } });
  if (!acct) throw new GameError(key === 'whop' ? 'Set up your Whop payout account first.' : 'Add the bank account to pay into first.', 400, 'payout_account_required');
  const w = await prisma.$transaction(async (tx) => {
    const wd = await tx.withdrawal.create({ data: { userId: user.id, provider: key, amountKobo: BigInt(amountKobo), payoutAccountId: acct.id } });
    const wallet = await walletFor(user.id, tx);
    await post(tx, { walletId: wallet.id, userId: user.id, type: 'withdrawal_hold', amount: amountKobo, available: -amountKobo, pending: amountKobo, key: `withdrawal_hold:${wd.id}`, withdrawalId: wd.id });
    return wd;
  }, TX);
  // A bank name that doesn't match the verified name always waits for a
  // person, and so does money that came in within the last 72 hours (a card
  // payment can still be charged back).
  const recent = await prisma.deposit.count({ where: { userId: user.id, status: 'succeeded', createdAt: { gte: new Date(Date.now() - 72 * 3600e3) } } });
  if (s.withdrawalApproval === 'automatic' && acct.nameMatchesId !== false && !recent) await processWithdrawal(w.id, null).catch((err) => console.error('Automatic withdrawal failed:', err.message));
  return withdrawalView(await prisma.withdrawal.findUnique({ where: { id: w.id } }));
}

// Sends an approved withdrawal to the provider.
export async function processWithdrawal(id, adminId) {
  const w = await prisma.withdrawal.findUnique({ where: { id } });
  if (!w) throw new GameError('We couldn’t find that withdrawal.', 404);
  const moved = await prisma.withdrawal.updateMany({ where: { id, status: 'requested' }, data: { status: 'processing', reviewedBy: adminId, reviewedAt: adminId ? new Date() : null } });
  if (!moved.count) throw new GameError('That withdrawal has already been handled.', 409);
  const acct = await prisma.payoutAccount.findUnique({ where: { id: w.payoutAccountId } });
  try {
    const cfg = await configFor(w.provider);
    const r = w.provider === 'whop' ? await whop.transfer(cfg, { destinationId: acct.externalId, amountKobo: kobo(w.amountKobo), withdrawalId: w.id }) : await paystack.transfer(cfg, { recipient: acct.externalId, amountKobo: kobo(w.amountKobo), withdrawalId: w.id });
    await prisma.withdrawal.update({ where: { id }, data: { providerRef: r.providerRef } });
    if (r.status === 'succeeded' || r.status === 'success') await markPaid(id);
    else if (r.status === 'failed') await markFailed(id, `${PROVIDER_NAMES[w.provider]} refused the transfer.`);
    // Anything else (processing, pending, otp) is settled by webhook or the admin.
  } catch (err) {
    // Only a definite refusal returns the money; a timeout may still go through.
    if (err.retryable) {
      await prisma.withdrawal.update({ where: { id }, data: { failureReason: `Couldn’t confirm with ${PROVIDER_NAMES[w.provider]}: ${String(err.message).slice(0, 200)}. Check the provider before retrying.` } });
    } else {
      await markFailed(id, String(err.message).slice(0, 300));
    }
    throw err instanceof GameError ? err : new GameError(`${PROVIDER_NAMES[w.provider]} didn’t accept the transfer: ${err.message}`, 502, 'provider_error');
  }
  return withdrawalView(await prisma.withdrawal.findUnique({ where: { id } }));
}

export async function markPaid(id) {
  await prisma.$transaction(async (tx) => {
    const [w] = await tx.$queryRaw`SELECT * FROM "Withdrawal" WHERE "id" = ${id} FOR UPDATE`;
    if (!w || w.status === 'paid' || !['processing', 'requested'].includes(w.status)) return;
    const wallet = await walletFor(w.userId, tx);
    await post(tx, { walletId: wallet.id, userId: w.userId, type: 'withdrawal_paid', amount: kobo(w.amountKobo), pending: -kobo(w.amountKobo), key: `withdrawal_paid:${w.id}`, withdrawalId: w.id });
    await tx.withdrawal.update({ where: { id }, data: { status: 'paid', completedAt: new Date(), failureReason: null } });
  }, TX);
}

// Returns the money to the person's available balance.
export async function markFailed(id, reason, status = 'failed', actor = null) {
  await prisma.$transaction(async (tx) => {
    const [w] = await tx.$queryRaw`SELECT * FROM "Withdrawal" WHERE "id" = ${id} FOR UPDATE`;
    if (!w || !['processing', 'requested'].includes(w.status)) return;
    const wallet = await walletFor(w.userId, tx);
    await post(tx, { walletId: wallet.id, userId: w.userId, type: 'withdrawal_release', amount: kobo(w.amountKobo), available: kobo(w.amountKobo), pending: -kobo(w.amountKobo), key: `withdrawal_release:${w.id}`, withdrawalId: w.id, reason });
    await tx.withdrawal.update({ where: { id }, data: { status, failureReason: reason, completedAt: new Date(), ...(actor ? { reviewedBy: actor, reviewedAt: new Date(), reviewNote: reason } : {}) } });
  }, TX);
}

export async function cancelWithdrawal(user, id) {
  const w = await prisma.withdrawal.findUnique({ where: { id } });
  if (!w || w.userId !== user.id) throw new GameError('We couldn’t find that withdrawal.', 404);
  if (w.status !== 'requested') throw new GameError('That withdrawal is already being processed.', 409);
  await markFailed(id, 'Cancelled by you', 'cancelled');
  return withdrawalView(await prisma.withdrawal.findUnique({ where: { id } }));
}

export function withdrawalView(w) {
  return { id: w.id, provider: w.provider, providerName: PROVIDER_NAMES[w.provider], amountKobo: kobo(w.amountKobo), status: w.status, failureReason: ['failed', 'rejected'].includes(w.status) ? w.failureReason : null, createdAt: w.createdAt, completedAt: w.completedAt };
}
