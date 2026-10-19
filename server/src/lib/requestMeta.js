// Client IP as Vercel reports it (it overwrites x-forwarded-for / x-real-ip
// at the edge); falls back to the socket address when running locally.
// The visitor's IP, from what our host sets (never a header a visitor could
// send themselves):
// - Vercel: x-real-ip.
// - Render: CF-Connecting-IP, set by Render's Cloudflare edge, which refuses
//   requests that bring their own. (In x-forwarded-for the real address is
//   third from the end: whatever the visitor sent, the visitor, Cloudflare,
//   Render's internal proxy.)
// - Anywhere else (local runs): the connection's own address.
export function clientIp(req) {
  const fwd = String(req.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  let ip = null;
  if (process.env.VERCEL) ip = req.get('x-real-ip') ?? fwd[0];
  else if (process.env.RENDER) ip = req.get('cf-connecting-ip') ?? (fwd.length >= 3 ? fwd.at(-3) : null);
  ip = ip ?? req.socket?.remoteAddress ?? null;
  return ip ? String(ip).trim().slice(0, 64) : null;
}

// "Chrome on macOS" from the user agent, for activity records people read.
export function deviceName(req) {
  const ua = String(req.get('user-agent') ?? '');
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : null;
  return os ? `${browser} on ${os}` : browser;
}
