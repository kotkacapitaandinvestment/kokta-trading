// Shared input checks. Lengths are checked before any pattern, so a long
// crafted value can never make a regular expression run for long.

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,63}$/;

export function isEmail(value) {
  return typeof value === 'string' && value.length >= 6 && value.length <= 254 && EMAIL_RE.test(value);
}
