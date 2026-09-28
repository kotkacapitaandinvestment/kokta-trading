// Request-level protections for the API.

import { isAllowedOrigin } from '../lib/origins.js';

// Security headers on every API response. The web app's own headers
// (including the Content Security Policy) are set in vercel.json.
export function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    // API responses are data; nothing in them should ever run as a page.
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  if (!res.get('Cache-Control')) res.set('Cache-Control', 'no-store');
  next();
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Machine-to-machine endpoints authenticated by their own token, not cookies.
const EXEMPT = [/^\/api\/research\/cron\/?$/];

// Cross-site request forgery: state-changing requests must come from one of
// Kotka's own pages. Browsers always send Origin on these requests, and
// Sec-Fetch-Site when they can't; a cookie-bearing request from another site
// is refused. (Session cookies are also SameSite=Lax.)
export function sameOriginWrites(req, res, next) {
  if (!UNSAFE.has(req.method) || EXEMPT.some((re) => re.test(req.path))) return next();
  const origin = req.get('origin');
  if (origin) {
    // Same-origin requests: the page's origin equals this host.
    const self = `${req.protocol}://${req.get('host')}`;
    if (origin === self || isAllowedOrigin(origin)) return next();
    return res.status(403).json({ error: 'This request came from another website, so it was blocked.', code: 'cross_site' });
  }
  if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'This request came from another website, so it was blocked.', code: 'cross_site' });
  next();
}
