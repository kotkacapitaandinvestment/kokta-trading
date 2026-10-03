// The sites Kotka is served from. Used for the cross-site request check,
// CORS, and anywhere the server needs its own public address. Never derived
// from request headers alone.

export const CANONICAL_ORIGIN = 'https://www.kotkafinance.online';

// kokta-trading.vercel.app only redirects pages to the main site now (vercel.json).
const FIXED = ['https://www.kotkafinance.online', 'https://kotkafinance.online'];
const DEV = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://localhost:4000'];

export function allowedOrigins() {
  const extra = [process.env.CLIENT_ORIGIN, process.env.PUBLIC_APP_URL].filter(Boolean).map((o) => o.replace(/\/+$/, ''));
  return new Set([...FIXED, ...extra, ...(process.env.NODE_ENV === 'production' ? [] : DEV)]);
}

// Preview deployments call their own /api, which the same-origin check in
// middleware/security.js already allows; no pattern of *.vercel.app names is
// trusted here, since anyone can create a project with a look-alike name.
export function isAllowedOrigin(origin) {
  if (!origin) return false;
  return allowedOrigins().has(origin);
}

// This server's public origin for building absolute links: the request's host
// only when it is one of ours, otherwise the canonical site.
export function publicOrigin(req) {
  const host = String(req.get('x-forwarded-host') ?? req.get('host') ?? '').split(',')[0].trim().toLowerCase();
  const proto = String(req.get('x-forwarded-proto') ?? req.protocol ?? 'https').split(',')[0].trim();
  const candidate = `${proto === 'http' ? 'http' : 'https'}://${host}`;
  return isAllowedOrigin(candidate) ? candidate : CANONICAL_ORIGIN;
}
