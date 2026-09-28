// What a metered operation actually used, collected while it runs: model
// calls and their token counts (from lib/nvidia.js) and upstream data fetches
// versus cache hits (from lib/research/cache.js). settleUsage() writes the
// totals onto the ledger row. Outside a metered operation these are no-ops.

import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

export function withUsageContext(fn) {
  const ctx = { modelCalls: 0, models: [], inputTokens: 0, outputTokens: 0, totalTokens: 0, tokensReported: false, upstream: {}, cacheHits: 0 };
  return store.run(ctx, () => fn(ctx));
}

export const currentUsageContext = () => store.getStore() ?? null;

// usage: the provider's { prompt_tokens, completion_tokens, total_tokens }, if it sent one.
export function noteModelCall(model, usage) {
  const ctx = store.getStore();
  if (!ctx) return;
  ctx.modelCalls += 1;
  if (model && !ctx.models.includes(model)) ctx.models.push(model);
  if (usage && typeof usage === 'object') {
    const input = Number(usage.prompt_tokens) || 0;
    const output = Number(usage.completion_tokens) || 0;
    ctx.inputTokens += input;
    ctx.outputTokens += output;
    ctx.totalTokens += Number(usage.total_tokens) || input + output;
    ctx.tokensReported = true;
  }
}

// Cache keys look like "massive:daily100:C:EURUSD:2026-09-28" or
// "calendar:fomc:2026-09-28"; the source is the first part (two for
// calendars and crypto, e.g. "crypto:cg" for CoinGecko).
// "community:…" keys cache Kotka AI's own answers, not an outside source; the
// model call itself is noted by noteModelCall.
export function noteSourceFetch(key, { cached }) {
  const ctx = store.getStore();
  if (!ctx || String(key).startsWith('community:')) return;
  if (cached) {
    ctx.cacheHits += 1;
    return;
  }
  const parts = String(key).split(':');
  const source = parts[0] === 'calendar' || parts[0] === 'crypto' ? parts.slice(0, 2).join(':') : parts[0];
  ctx.upstream[source] = (ctx.upstream[source] ?? 0) + 1;
}
