import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { publicOrigin } from '../lib/origins.js';
import { mediaBytes } from '../lib/media.js';

// Public achievement links (no sign-in). They only ever expose the snapshot
// the trader chose when creating the link, and stop working when revoked.
export const publicAchievementsRouter = Router();

// Slugs are 12 random base64url characters; anything else is not a link.
const live = (slug) => (/^[A-Za-z0-9_-]{8,40}$/.test(String(slug)) ? prisma.achievementShare.findFirst({ where: { slug: String(slug), revokedAt: null } }) : null);

publicAchievementsRouter.get('/achievements/:slug', asyncHandler(async (req, res) => {
  const s = await live(req.params.slug);
  if (!s) return res.status(404).json({ error: 'This achievement link is not available. It may have been removed by the trader.' });
  prisma.achievementShare.update({ where: { id: s.id }, data: { views: { increment: 1 } } }).catch(() => {});
  res.set('Cache-Control', 'no-store');
  res.json({ snapshot: s.snapshot, image: s.imageId ? `/api/public/achievements/${s.slug}/image` : null, createdAt: s.createdAt });
}));

publicAchievementsRouter.get('/achievements/:slug/image', asyncHandler(async (req, res) => {
  const s = await live(req.params.slug);
  const m = s?.imageId ? await prisma.media.findUnique({ where: { id: s.imageId } }) : null;
  if (!m) return res.status(404).end();
  // Social apps fetch this image for link previews, so it may be loaded cross-site.
  const bytes = await mediaBytes(m);
  if (!bytes) return res.status(503).end();
  res.set({ 'Content-Type': m.mime, 'Content-Length': String(bytes.length), 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin', 'Content-Security-Policy': "default-src 'none'; sandbox" });
  res.end(bytes);
}));

// ── Link previews ──────────────────────────────────────────────────────────
// Social apps read Open Graph tags from the HTML without running JavaScript,
// so /achievement/:slug is served here: the app shell with this share's tags.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let shell = { html: null, at: 0 };

// The app shell is fetched from Kotka's own site only (see publicOrigin), so a
// forged Host header can't make the server fetch, cache and serve another
// site's HTML.
async function appShell(origin) {
  if (shell.html && Date.now() - shell.at < 5 * 60e3) return shell.html;
  const r = await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(4000), redirect: 'error' });
  if (!r.ok) throw new Error(`index.html ${r.status}`);
  const html = await r.text();
  // Only cache something that is recognisably Kotka's own app shell.
  if (!html.includes('<div id="root"></div>') || html.length > 20_000) throw new Error('unexpected app shell');
  shell = { html, at: Date.now() };
  return shell.html;
}

export const achievementPage = asyncHandler(async (req, res) => {
  const origin = publicOrigin(req);
  const s = await live(req.params.slug);
  const snap = s?.snapshot;
  const title = snap ? `${snap.headline} · Kotka` : 'Kotka achievement';
  const desc = snap ? `${snap.sentence} ${snap.verification === 'verified' ? 'Verified' : 'Self-reported'} on Kotka Trading.` : 'This achievement link is not available.';
  const image = s?.imageId ? `${origin}/api/public/achievements/${s.slug}/image` : `${origin}/icon-512.png`;
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Kotka Trading" />`,
    `<meta property="og:title" content="${esc(snap ? `${snap.eyebrow}: ${snap.headline}` : title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(`${origin}/achievement/${req.params.slug}`)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta name="twitter:card" content="${s?.imageId ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(snap ? snap.headline : title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ].join('\n  ');
  let html;
  try {
    html = (await appShell(origin)).replace(/<title>[\s\S]*?<\/title>/, '').replace(/<meta name="description"[^>]*>/, '').replace('<head>', `<head>\n  ${tags}`);
  } catch {
    // No app shell reachable (e.g. the API running alone): tags still preview.
    html = `<!doctype html><html><head><meta charset="utf-8" />${tags}</head><body><p><a href="/">Open Kotka</a></p></body></html>`;
  }
  res.status(s ? 200 : 404).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' }).send(html);
});
