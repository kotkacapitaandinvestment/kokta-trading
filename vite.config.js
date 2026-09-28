import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `vite preview` serves the production build with the same security headers
// Vercel adds (vercel.json), so the Content Security Policy can be checked
// locally before deploying. The dev server skips them (Vite's hot reload
// needs inline scripts).
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
const siteHeaders = Object.fromEntries((vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? []).map((h) => [h.key, h.value.replace('; upgrade-insecure-requests', '')]));

const api = { target: 'http://localhost:4000', changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': api } },
  preview: { port: 4173, headers: siteHeaders, proxy: { '/api': api, '/achievement': api } },
});
