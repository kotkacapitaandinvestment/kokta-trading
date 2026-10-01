// Sign-up codes. A new account starts with a 6-digit code sent to the email
// address, so the sign-up form answers the same whether or not the address
// already has an account (its owner is told by email instead), and every new
// account starts with a confirmed email.

import crypto from 'node:crypto';
import { prisma } from './prisma.js';

export const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_TRIES = 5;

// Keyed, so a copy of the table alone can't be brute-forced back to codes.
const hash = (email, code) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(`kotka:signup:${email}:${code}`).digest('hex');

// A fresh code for this address; any earlier one stops working.
export async function issueSignupCode(email) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const data = { codeHash: hash(email, code), attempts: 0, expiresAt: new Date(Date.now() + CODE_TTL_MS), createdAt: new Date() };
  await prisma.signupCode.upsert({ where: { email }, update: data, create: { email, ...data } });
  if (Math.random() < 0.05) prisma.signupCode.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
  return code;
}

// 'ok' (and the code is used up), 'wrong', or 'expired' (timed out, used,
// or out of tries). Each try is counted before the code is compared, and
// the code is removed in the same statement that matches it, so parallel
// guesses can't get extra tries and a code can't be used twice.
export async function useSignupCode(email, code) {
  const tried = await prisma.signupCode.updateMany({ where: { email, attempts: { lt: MAX_TRIES }, expiresAt: { gt: new Date() } }, data: { attempts: { increment: 1 } } });
  if (tried.count !== 1) return 'expired';
  if (!/^\d{6}$/.test(String(code))) return 'wrong';
  const used = await prisma.signupCode.deleteMany({ where: { email, codeHash: hash(email, String(code)) } });
  return used.count === 1 ? 'ok' : 'wrong';
}
