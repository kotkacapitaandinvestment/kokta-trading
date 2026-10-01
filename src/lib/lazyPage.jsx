import { lazy } from 'react';

const FLAG = 'kotka:page-reload';

// Pages load when first opened, so the first visit downloads far less. After
// a new release the previous page files are gone; a tab opened before it
// reloads once to pick up the new version instead of showing an error. A
// failure the browser has cached (an error page served during an outage)
// is fetched fresh first, so the reload doesn't hit the same cached error.
export function lazyPage(load) {
  return lazy(() =>
    load().then(
      (mod) => {
        try { sessionStorage.removeItem(FLAG); } catch { /* storage blocked */ }
        return mod;
      },
      async (err) => {
        let tried = true;
        try { tried = sessionStorage.getItem(FLAG) === '1'; sessionStorage.setItem(FLAG, '1'); } catch { /* storage blocked */ }
        if (tried || !navigator.onLine) throw err;
        const file = /https?:\/\/[^\s'"]+\.js/.exec(String(err?.message ?? ''))?.[0];
        if (file && new URL(file).origin === window.location.origin) await fetch(file, { cache: 'reload' }).catch(() => {});
        window.location.reload();
        return new Promise(() => {});
      },
    ),
  );
}

export function PageLoading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <div className="h-7 w-56 animate-pulse rounded-md bg-ink-100 dark:bg-ink-800" />
      <div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />
    </div>
  );
}
