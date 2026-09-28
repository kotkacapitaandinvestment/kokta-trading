// Web-layer protections: security headers, cross-site request forgery,
// CORS, body size, uploads (type sniffing, metadata stripping, size caps),
// and the public achievement page's handling of forged Host headers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, makeUser, signIn } from './helpers.js';

let base, alice, aliceC;
before(async () => {
  base = await startServer();
  alice = await makeUser('Alice');
  aliceC = await signIn(alice);
});
after(stopServer);

// A minimal JPEG whose EXIF block carries a fake GPS marker.
function jpegWithExif() {
  const exif = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x10]), Buffer.from('Exif\0\0GPS-SPOT', 'latin1')]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x10, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), exif, sof, sos, Buffer.alloc(32, 0x55), Buffer.from([0xff, 0xd9])]);
}

function pngHeader(width, height) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'latin1');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8;
  ihdr[17] = 6;
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  return Buffer.concat([sig, ihdr, iend]);
}

const dataUrl = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;

test('API responses carry security headers and no framework banner', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.match(r.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
});

test('state-changing requests from other websites are refused', async () => {
  assert.equal((await aliceC.post('/api/community/me/preferences', {}, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await aliceC.put('/api/settings', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await aliceC.put('/api/settings', {}, { Origin: 'https://www.kotkafinance.online' })).status, 200);
  assert.equal((await aliceC.put('/api/settings', {}, { Origin: base })).status, 200, 'same origin is fine');
});

test('CORS never grants other websites access', async () => {
  const evil = await fetch(`${base}/api/auth/me`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const ours = await fetch(`${base}/api/auth/me`, { method: 'OPTIONS', headers: { Origin: 'https://www.kotkafinance.online', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(ours.headers.get('access-control-allow-origin'), 'https://www.kotkafinance.online');
});

test('oversized request bodies are refused politely', async () => {
  const r = await aliceC.post('/api/journal', { date: '2026-09-01', market: 'x', strategy: 'y', lessons: 'z'.repeat(2_000_000) });
  assert.equal(r.status, 413);
  assert.equal(typeof r.json.error, 'string');
});

test('uploads: only real images or audio, whatever the label says', async () => {
  const svg = await aliceC.post('/api/media', { dataUrl: dataUrl('image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')) });
  assert.equal(svg.status, 400);
  const html = await aliceC.post('/api/media', { dataUrl: dataUrl('image/png', Buffer.from('<html><script>alert(document.cookie)</script></html>')) });
  assert.equal(html.status, 400);
  const bomb = await aliceC.post('/api/media', { dataUrl: dataUrl('image/png', pngHeader(100000, 100000)) });
  assert.equal(bomb.status, 400, 'huge canvases are refused');
});

test('uploads: photo metadata is removed and files are served inert', async () => {
  const r = await aliceC.post('/api/media', { dataUrl: dataUrl('image/jpeg', jpegWithExif()) });
  assert.equal(r.status, 201);
  assert.equal(r.json.media.width, 16);
  const file = await fetch(`${base}${r.json.media.url}`, { headers: { Cookie: aliceC.cookie } });
  const bytes = Buffer.from(await file.arrayBuffer());
  assert.ok(!bytes.includes(Buffer.from('GPS-SPOT')), 'EXIF block stripped');
  assert.equal(file.headers.get('content-type'), 'image/jpeg');
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
  assert.match(file.headers.get('content-security-policy') ?? '', /sandbox/);
  // A wrong token doesn't reveal the file.
  const guess = await fetch(`${base}/api/media/${r.json.media.id}/wrong-token`, { headers: { Cookie: aliceC.cookie } });
  assert.equal(guess.status, 404);
});

test('achievement pages ignore forged Host headers', async () => {
  const r = await fetch(`${base}/achievement/abcdefghijkl`, { headers: { 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'https' } });
  const html = await r.text();
  assert.ok(!html.includes('evil.example'));
  assert.match(html, /og:url" content="https:\/\/www\.kotkafinance\.online\//);
});
