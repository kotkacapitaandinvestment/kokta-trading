// Serves the built website (dist/) from this server, for hosts that run Kotka
// as one long-running Node process (Render). On Vercel the platform does
// this instead, and vercel.json stays the one place the page headers live:
// they're read from it here, so both hosts send the same ones.

import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dist = path.join(root, 'dist');

// vercel.json header rules ("/(.*)", "/sw.js", "/assets/(.*)") as matchers.
function headerRules() {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  return (config.headers ?? []).map((rule) => ({
    test: new RegExp(`^${rule.source.split('(.*)').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.*)')}$`),
    headers: rule.headers,
  }));
}

export function serveClient(app) {
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.warn('No dist/index.html: build the site first (npx vite build).');
    return;
  }
  const rules = headerRules();
  const indexHtml = fs.readFileSync(path.join(dist, 'index.html'));

  // Unknown API paths answer as the API does, never with the web page.
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((req, res, next) => {
    for (const r of rules) if (r.test.test(req.path)) for (const h of r.headers) res.setHeader(h.key, h.value);
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=63072000');
    next();
  });
  // Files that exist (hashed assets are cached for a year by the header rules).
  app.use(express.static(dist, { index: false, etag: true, cacheControl: false, setHeaders: (res, file) => {
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600');
  } }));
  // Every other page is the app, which routes itself.
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(indexHtml);
  });
}
