// Password hashing and rules.
//
// bcrypt at cost 12 (about 0.3 s per check). Older cost-10 hashes are
// upgraded the next time the person signs in. Unknown emails are checked
// against a fixed dummy hash so a failed sign-in takes the same time either
// way and doesn't reveal whether an account exists.

import bcrypt from 'bcryptjs';

export const HASH_COST = 12;
const DUMMY_HASH = '$2a$12$NFVEINHqNCOCacSVsSsYAu37X2PhNxKqGF4TWIBU89RPrX/DlO87a';
export const MIN_LENGTH = 8;
export const MAX_LENGTH = 200;

export const hashPassword = (password) => bcrypt.hash(password, HASH_COST);

// Compares against the user's hash, or the dummy when there is no user.
export async function checkPassword(password, hash) {
  const ok = await bcrypt.compare(String(password ?? '').slice(0, MAX_LENGTH), hash ?? DUMMY_HASH);
  return !!hash && ok;
}

export function needsRehash(hash) {
  const cost = Number(String(hash).split('$')[2]);
  return !Number.isFinite(cost) || cost < HASH_COST;
}

// The most commonly breached passwords (and trading-flavoured variants).
const COMMON = new Set(
  `password password1 password12 password123 passw0rd 12345678 123456789 1234567890 12341234 11111111 00000000 87654321
  qwerty123 qwertyuiop 1q2w3e4r 1qaz2wsx abc12345 abcd1234 iloveyou letmein1 welcome1 welcome123 admin123 administrator
  sunshine princess football baseball superman trustno1 whatever monkey123 dragon123 master123 starwars computer
  internet michelle jennifer shadow12 freedom1 changeme secret123 p@ssw0rd p@ssword trader123 trading1 trading123
  forex123 forextrader bitcoin1 bitcoin123 crypto123 kotka123 kotkatrading qwerty12 asdfghjk zxcvbnm1 aaaaaaaa`.split(/\s+/),
);

// Returns an error message, or null when the password is acceptable.
export function passwordProblem(password, { email = '', name = '' } = {}) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
  if (password.length > MAX_LENGTH) return 'That password is too long.';
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'That password is too common. Try a few unrelated words together.';
  if (/^(.)\1+$/.test(password)) return 'Avoid repeating one character.';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && lower.includes(local)) return 'Don’t use your email address in your password.';
  const first = String(name).trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (first.length >= 4 && lower === first + lower.slice(first.length) && /^\d*$/.test(lower.slice(first.length))) return 'Don’t use just your name and numbers.';
  return null;
}
