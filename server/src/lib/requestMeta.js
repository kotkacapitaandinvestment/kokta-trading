// Client IP as Vercel reports it (it overwrites x-forwarded-for / x-real-ip
// at the edge); falls back to the socket address when running locally.
export function clientIp(req) {
  const real = req.get('x-real-ip');
  if (real) return real.trim().slice(0, 64);
  const fwd = req.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim().slice(0, 64);
  return (req.socket?.remoteAddress ?? '').slice(0, 64) || null;
}
