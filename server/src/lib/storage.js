// File storage for uploads (photos, voice notes, share cards) in Cloudflare
// R2, through its S3 API, when the 'r2' service is connected (Admin →
// Connected services). Files are private: nothing is public in the bucket
// that Kotka relies on; every file is served through Kotka's own routes,
// which check the link token first. Without R2, uploads stay in Postgres.

import { AwsClient } from 'aws4fetch';
import { prisma } from './prisma.js';
import { decryptSecret } from './crypto.js';

let cached = null;
const TTL_MS = 60 * 1000;

// The connected store, or null. Cached for a minute per instance.
export async function objectStore() {
  if (cached && cached.until > Date.now()) return cached.store;
  let store = null;
  try {
    const row = await prisma.integration.findUnique({ where: { provider: 'r2' } });
    const cfg = row?.config ?? {};
    if (row?.enabled && row.secretCipher && cfg.accountId && cfg.accessKeyId && cfg.bucket) {
      store = makeStore({ accountId: cfg.accountId, accessKeyId: cfg.accessKeyId, secretAccessKey: decryptSecret(row.secretCipher), bucket: cfg.bucket, prefix: String(cfg.prefix ?? 'media').replace(/^\/+|\/+$/g, '') });
    }
  } catch (err) {
    console.error('R2 settings could not be read; keeping uploads in the database:', err.message);
  }
  cached = { store, until: Date.now() + TTL_MS };
  return store;
}

export function forgetObjectStore() {
  cached = null;
}

export function makeStore({ accountId, accessKeyId, secretAccessKey, bucket, prefix = 'media' }) {
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' });
  const base = `https://${accountId}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}`;
  const url = (key) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const check = async (r, what) => {
    if (!r.ok) throw Object.assign(new Error(`R2 ${what} failed (${r.status})`), { status: r.status });
    return r;
  };
  return {
    prefix,
    keyFor: (ownerId, id) => `${prefix}/${ownerId}/${id}`,
    async put(key, bytes, contentType) {
      await check(await client.fetch(url(key), { method: 'PUT', body: bytes, headers: { 'Content-Type': contentType, 'Content-Length': String(bytes.length) } }), 'upload');
    },
    async get(key) {
      const r = await client.fetch(url(key), { method: 'GET' });
      if (r.status === 404) return null;
      await check(r, 'download');
      return Buffer.from(await r.arrayBuffer());
    },
    async remove(key) {
      const r = await client.fetch(url(key), { method: 'DELETE' });
      if (r.status !== 404) await check(r, 'delete');
    },
    // Keys under a prefix, 1,000 at a time (for the clean-up of files whose rows are gone).
    async list(after = null) {
      const q = new URLSearchParams({ 'list-type': '2', prefix: `${prefix}/`, 'max-keys': '1000' });
      if (after) q.set('continuation-token', after);
      const r = await check(await client.fetch(`${base}?${q}`, { method: 'GET' }), 'list');
      const xml = await r.text();
      const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((m) => ({ key: /<Key>([^<]+)<\/Key>/.exec(m[1])?.[1].replace(/&amp;/g, '&'), modified: new Date(/<LastModified>([^<]+)<\/LastModified>/.exec(m[1])?.[1] ?? 0) }));
      const next = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] ?? null;
      return { objects, keys: objects.map((o) => o.key), next };
    },
  };
}
