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

// KLineChart swallows a second click (or tap) that lands within half a
// second of the first unless it's a double-click on the same spot, so quick
// traders lose points while placing a drawing. Treat it as a normal click.
// Fails the build if the library changes and the fix no longer applies.
function klinechartsClickFix() {
  const fixes = [
    ['this._processEvent(compatEvent, this._handler.mouseDoubleClickEvent);\n            }\n            this._resetClickTimeout();', 'this._processEvent(compatEvent, this._handler.mouseDoubleClickEvent);\n            }\n            else if (!this._cancelClick) {\n                this._processEvent(compatEvent, this._handler.mouseClickEvent);\n            }\n            this._resetClickTimeout();'],
    ['this._processEvent(compatEvent, this._handler.doubleTapEvent);\n            }\n            this._resetTapTimeout();', 'this._processEvent(compatEvent, this._handler.doubleTapEvent);\n            }\n            else if (!this._cancelTap) {\n                this._processEvent(compatEvent, this._handler.tapEvent);\n            }\n            this._resetTapTimeout();'],
  ];
  return {
    name: 'klinecharts-click-fix',
    transform(code, id) {
      if (!/klinecharts[\\/]dist[\\/]index\.esm\.js/.test(id)) return null;
      let out = code;
      for (const [from, to] of fixes) {
        if (!out.includes(from)) throw new Error('klinecharts-click-fix: the library changed; review the click fix in vite.config.js');
        out = out.replace(from, to);
      }
      return { code: out, map: null };
    },
  };
}

export default defineConfig({
  plugins: [react(), klinechartsClickFix()],
  // Which build an error came from, for error tracking.
  define: { __KOTKA_RELEASE__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7)) },
  // Served through the plugin pipeline in dev too, so the click fix applies.
  optimizeDeps: { exclude: ['klinecharts'] },
  server: { port: 5173, proxy: { '/api': api } },
  preview: { port: 4173, headers: siteHeaders, proxy: { '/api': api, '/achievement': api } },
});
