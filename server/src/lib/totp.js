// Time-based one-time passwords (RFC 6238, SHA-1, 6 digits, 30 s), the
// codes authenticator apps (Google Authenticator, Authy, 1Password) show.
// Built on node:crypto; no third-party dependency.

import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { decryptSecret } from './crypto.js';
import { hit } from './rateLimit.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(crypto.randomBytes(20));
export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

export function codeAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const n = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

// Returns the matching time step (allowing one step of clock drift either
// way), or null. Steps at or before `lastUsedStep` are refused, so a code
// can't be replayed.
export function verifyCode(secret, code, { lastUsedStep = null, now = Date.now() } = {}) {
  const digits = String(code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const step = currentStep(now);
  for (const s of [step, step - 1, step + 1]) {
    if (lastUsedStep !== null && s <= lastUsedStep) continue;
    const expected = codeAt(secret, s);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(digits))) return s;
  }
  return null;
}

export function otpauthUri(secret, account, issuer = 'Kotka') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

// Recovery codes: 10 one-time codes like "k7m2-x9qp-4r8t", stored as SHA-256.
export function newRecoveryCodes(n = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const pick = () => Array.from(crypto.randomBytes(12), (b) => chars[b % chars.length]).join('');
  return Array.from({ length: n }, () => pick().replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3'));
}
export const hashRecovery = (code) => crypto.createHash('sha256').update(String(code).trim().toLowerCase().replace(/\s+/g, '')).digest('hex');

// A fresh authenticator code for a money action (withdrawals, payout
// details). Only the app's 6-digit code counts here, not recovery codes, and
// each code works once. Returns null when it's good, or { status, error, code }.
export async function confirmWithTwoStep(userId, rawCode) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, mfaEnabledAt: true, mfaSecretCipher: true, mfaLastUsedStep: true } });
  if (!user?.mfaEnabledAt || !user.mfaSecretCipher) {
    return { status: 403, code: 'two_step_required', error: 'Turn on two-step verification in Settings → Security first. It keeps your money safe even if someone learns your password.' };
  }
  // Its own budget, separate from sign-in, so a busy day of payouts can't lock anyone out of signing in.
  if (await hit(`mfa-money:${user.id}`, 10, 15 * 60e3)) return { status: 429, code: 'rate_limited', error: 'Too many codes tried. Please wait a few minutes and try again.' };
  if (!String(rawCode ?? '').trim()) return { status: 400, code: 'two_step_code', error: 'Enter the 6-digit code from your authenticator app.' };
  const step = verifyCode(decryptSecret(user.mfaSecretCipher), rawCode, { lastUsedStep: user.mfaLastUsedStep });
  if (step !== null) {
    const used = await prisma.user.updateMany({ where: { id: user.id, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] }, data: { mfaLastUsedStep: step } });
    if (used.count === 1) return null;
  }
  return { status: 400, code: 'two_step_code', error: 'That code didn’t work. Check your authenticator app and try again.' };
}
