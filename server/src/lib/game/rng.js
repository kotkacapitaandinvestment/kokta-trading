// Seeded randomness for the synthetic market. Same inputs, same numbers, on
// every server and every Node version.
import crypto from 'node:crypto';

// The helpers every stream offers, on top of a uniform [0, 1) source.
function stream(next) {
  let spare = null;
  return {
    next,
    // Standard normal (Box-Muller, caching the second value).
    normal() {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return s;
      }
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    },
    between: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

// mulberry32: small and fast, but its 32-bit state can be recovered from a
// few outputs. Only markets made before generator version 3 use it.
export function rng(seed) {
  let a = seed >>> 0;
  return stream(() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

// A cryptographic stream: HMAC-SHA256(secret, "label:counter") blocks, eight
// 32-bit numbers each. However many outputs someone sees (the price history
// on the chart), they learn nothing about the next ones, so the future of a
// match can't be worked out from its past. The secret is 32 random bytes
// kept on the server.
export function secureRng(secretHex, label) {
  const key = Buffer.from(secretHex, 'hex');
  if (key.length < 32) throw new Error('A market secret must be at least 32 bytes.');
  let counter = 0;
  let block = null;
  let pos = 8;
  return stream(() => {
    if (pos >= 8) {
      block = crypto.createHmac('sha256', key).update(`${label}:${counter++}`).digest();
      pos = 0;
    }
    const u = block.readUInt32BE(pos * 4);
    pos += 1;
    return u / 4294967296;
  });
}

export const newMarketSecret = () => crypto.randomBytes(32).toString('hex');

// A stable 32-bit mix of several integers (for per-scenario variant streams).
export function mix(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return h >>> 0;
}
