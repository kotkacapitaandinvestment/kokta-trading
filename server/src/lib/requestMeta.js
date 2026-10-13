// Client IP as Vercel reports it (it overwrites x-forwarded-for / x-real-ip
// at the edge); falls back to the socket address when running locally.
// The visitor's IP, from the header our host sets (never one a visitor could
// send themselves): on Vercel, x-real-ip; elsewhere (Render), the last
// x-forwarded-for entry, which the host's own proxy appends.
export function clientIp(req) {
  if (process.env.VERCEL) {
    const real = req.get('x-real-ip');
    if (real) return real.trim().slice(0, 64);
  }
  const fwd = req.get('x-forwarded-for');
  if (fwd) return (process.env.VERCEL ? fwd.split(',')[0] : fwd.split(',').at(-1)).trim().slice(0, 64);
  return (req.socket?.remoteAddress ?? '').slice(0, 64) || null;
}

// "Chrome on macOS" from the user agent, for activity records people read.
export function deviceName(req) {
  const ua = String(req.get('user-agent') ?? '');
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : null;
  return os ? `${browser} on ${os}` : browser;
}
