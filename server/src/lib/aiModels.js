// Model resilience for every Kotka AI feature.
//
// NVIDIA retires hosted models without notice (meta/llama-3.1-70b-instruct went
// end-of-life on 2026-08-26 and silently broke chat). Instead of pinning one
// model per feature, each call walks an ordered chain:
//   admin-configured model → admin fallbacks → vetted defaults
// A model that answers 410/404 is recorded as retired/unavailable and skipped
// from then on; temporary failures (429/5xx/timeouts) just move this one
// request to the next model. A scheduled health check re-tests everything,
// revives models that come back, and logs every switch for admins.
//
// Only vetted models are ever chosen automatically: models differ in request
// quirks (e.g. reasoning text leaking into replies), so each one below was
// tested live on Kotka's account before being listed.

import { prisma } from './prisma.js';
import { decryptSecret } from './crypto.js';
import { nvidiaChatCompletion, NVIDIA_DEFAULT_BASE_URL } from './nvidia.js';

export const MODEL_PROFILES = {
  // Reasoning is off so thinking text never reaches traders; ~1-3s, tools OK.
  'nvidia/nemotron-3-super-120b-a12b': { extraBody: { chat_template_kwargs: { enable_thinking: false } } },
  'nvidia/nemotron-3-ultra-550b-a55b': { extraBody: { chat_template_kwargs: { enable_thinking: false } } },
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning': { extraBody: { chat_template_kwargs: { enable_thinking: false } } },
  // Rejects any custom top_p; thinking mode intermittently returns no answer.
  'moonshotai/kimi-k3': { topP: null, extraBody: { chat_template_kwargs: { thinking: false } } },
  'meta/llama-3.2-11b-vision-instruct': {},
  'meta/llama-3.2-90b-vision-instruct': {},
};

// Preference order when the configured model is unavailable. Verified
// 2026-09-26: chat models stream and call tools; vision models read images.
export const VETTED_MODELS = {
  chat: ['nvidia/nemotron-3-super-120b-a12b', 'nvidia/nemotron-3-ultra-550b-a55b', 'moonshotai/kimi-k3'],
  vision: ['meta/llama-3.2-11b-vision-instruct', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 'meta/llama-3.2-90b-vision-instruct'],
  narrative: ['moonshotai/kimi-k3', 'nvidia/nemotron-3-super-120b-a12b', 'nvidia/nemotron-3-ultra-550b-a55b'],
};

const CONFIG_KEYS = {
  chat: { primary: 'model', fallbacks: 'chatFallbacks' },
  vision: { primary: 'visionModel', fallbacks: 'visionFallbacks' },
  narrative: { primary: null, fallbacks: null },
};

const DEAD = ['retired', 'unavailable'];
const HEALTH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

export function requestSettings(model) {
  const p = MODEL_PROFILES[model] ?? {};
  return { topP: p.topP === undefined ? 0.9 : p.topP, extraBody: p.extraBody ?? {} };
}

export function classifyModelError(err) {
  const msg = String(err?.message ?? err);
  const status = Number(msg.match(/\((\d{3})\)/)?.[1]) || null;
  if (status === 410 || /end of life|no longer (available|supported)|has been deprecated/i.test(msg)) return { kind: 'retired', status };
  if (status === 404 || /not found for account|model .{0,80}(not found|does not exist)/i.test(msg)) return { kind: 'unavailable', status };
  if (status === 429 || (status && status >= 500) || /timeout|aborted|ECONNRESET|fetch failed|socket/i.test(msg)) return { kind: 'transient', status };
  if (status === 400 || status === 422) return { kind: 'incompatible', status };
  return { kind: 'unknown', status };
}

const splitList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,\n]/)).map((s) => s.trim()).filter(Boolean);

// Ordered candidates for a role, skipping models recorded as dead (unless
// every candidate is dead, in which case all are tried again).
export function modelChain(role, integration, { preferred, ignoreHealth = false } = {}) {
  const cfg = integration?.config ?? {};
  const keys = CONFIG_KEYS[role];
  const primary = preferred ?? (keys.primary ? cfg[keys.primary] : null);
  const list = [...new Set([primary, ...(keys.fallbacks ? splitList(cfg[keys.fallbacks]) : []), ...VETTED_MODELS[role]].filter(Boolean).map((m) => m.trim()))];
  if (ignoreHealth) return list;
  const health = cfg.modelHealth ?? {};
  const alive = list.filter((m) => !DEAD.includes(health[m]?.status));
  // Models that failed the last health check (timeouts, overload) move behind
  // healthy or untested ones but stay in the chain.
  const ordered = [...alive.filter((m) => health[m]?.status !== 'degraded'), ...alive.filter((m) => health[m]?.status === 'degraded')];
  return ordered.length ? ordered : list;
}

export function connection(integration) {
  return { apiKey: decryptSecret(integration.secretCipher), baseUrl: integration.config?.baseUrl || NVIDIA_DEFAULT_BASE_URL };
}

// Read-modify-write so concurrent admin edits to other config keys survive.
async function recordHealth(changes, events) {
  if (!Object.keys(changes).length && !events.length) return;
  const row = await prisma.integration.findUnique({ where: { provider: 'nvidia' } });
  if (!row) return;
  const cfg = row.config ?? {};
  await prisma.integration.update({
    where: { provider: 'nvidia' },
    data: {
      config: {
        ...cfg,
        modelHealth: { ...(cfg.modelHealth ?? {}), ...changes },
        modelEvents: [...events, ...(cfg.modelEvents ?? [])].slice(0, 30),
      },
    },
  });
}

function failureRecords(role, failures, switchedTo) {
  const now = new Date().toISOString();
  const changes = {};
  const events = [];
  for (const f of failures) {
    if (f.kind === 'transient') continue; // not evidence the model is gone
    changes[f.model] = { status: DEAD.includes(f.kind) ? f.kind : 'degraded', httpStatus: f.status, checkedAt: now, error: f.error.slice(0, 200) };
    events.push({
      at: now,
      role,
      model: f.model,
      type: f.kind,
      detail: f.error.slice(0, 200),
      switchedTo,
    });
  }
  return { changes, events };
}

async function noteFailures(role, failures, switchedTo) {
  const { changes, events } = failureRecords(role, failures, switchedTo);
  for (const f of failures) console.warn(`[ai-models] ${role} model ${f.model} failed (${f.kind}${f.status ? ` ${f.status}` : ''}); ${switchedTo ? `using ${switchedTo}` : 'no working fallback'}`);
  await recordHealth(changes, events).catch((err) => console.error('Could not record model health:', err.message));
}

// Runs `run(model, settings)` down the chain until one succeeds. A temporary
// failure with an HTTP status (429, 5xx, empty answer) retries the same model
// once before moving on; timeouts move on straight away.
export async function withModelFallback(role, integration, run, { preferred } = {}) {
  const chain = modelChain(role, integration, { preferred });
  const failures = [];
  let lastError;
  for (const model of chain) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await run(model, requestSettings(model));
        if (failures.length) await noteFailures(role, failures, model);
        return { result, model, fellBackFrom: [...new Set(failures.map((f) => f.model))] };
      } catch (err) {
        const c = classifyModelError(err);
        if (c.kind === 'unknown') throw err; // a bug on our side; don't mask it by switching models
        lastError = err;
        if (c.kind === 'transient' && c.status && attempt === 0) {
          await new Promise((r) => setTimeout(r, c.status === 429 ? 2000 : 300));
          continue;
        }
        failures.push({ model, ...c, error: String(err.message ?? err) });
        break;
      }
    }
  }
  await noteFailures(role, failures, null);
  throw lastError;
}

// Streaming variant: a model is chosen once its stream opens and produces
// something (retirement errors arrive before the first token, so there is no
// partial output). A stream that ends immediately counts as a failed attempt.
export async function openStreamWithFallback(role, integration, makeStream, { preferred } = {}) {
  let chosen;
  const { result } = await withModelFallback(
    role,
    integration,
    async (model, settings) => {
      const gen = makeStream(model, settings);
      const first = await gen.next();
      if (first.done) throw new Error('NVIDIA API error (502): empty response');
      chosen = { model, settings };
      return { gen, first };
    },
    { preferred },
  );
  return { ...result, ...chosen };
}

// First model in each chain that is not recorded as dead.
export function effectiveModels(integration, { narrativePreferred } = {}) {
  return {
    chat: modelChain('chat', integration)[0] ?? null,
    vision: modelChain('vision', integration)[0] ?? null,
    narrative: modelChain('narrative', integration, { preferred: narrativePreferred })[0] ?? null,
  };
}

async function probe(model, role, conn) {
  const s = requestSettings(model);
  const started = Date.now();
  const messages =
    role === 'vision'
      ? [{ role: 'user', content: [{ type: 'text', text: 'What colour is this image? One word.' }, { type: 'image_url', image_url: { url: PIXEL } }] }]
      : [{ role: 'user', content: 'Reply with the single word: pong' }];
  const reply = await nvidiaChatCompletion({ ...conn, model, messages, maxTokens: 20, temperature: 0.2, topP: s.topP, extraBody: s.extraBody, timeoutMs: 30000 });
  if (!String(reply ?? '').trim()) throw new Error('NVIDIA API error (502): empty reply');
  return Date.now() - started;
}

// Re-tests every candidate model. Throttled unless forced; safe to call from
// the scheduled job on every run.
export async function checkModelHealth({ force = false, narrativePreferred } = {}) {
  const row = await prisma.integration.findUnique({ where: { provider: 'nvidia' } });
  if (!row?.enabled || !row.secretCipher) return { skipped: 'NVIDIA integration is not configured.' };
  const cfg = row.config ?? {};
  if (!force && cfg.modelHealthCheckedAt && Date.now() - new Date(cfg.modelHealthCheckedAt).getTime() < HEALTH_INTERVAL_MS) {
    return { skipped: 'Checked recently.', checkedAt: cfg.modelHealthCheckedAt };
  }

  const conn = connection(row);
  const before = effectiveModels(row, { narrativePreferred });
  const targets = [];
  for (const role of ['chat', 'narrative', 'vision']) {
    for (const model of modelChain(role, row, { preferred: role === 'narrative' ? narrativePreferred : undefined, ignoreHealth: true })) {
      const kind = role === 'vision' ? 'vision' : 'text';
      if (!targets.some((t) => t.model === model && t.kind === kind)) targets.push({ model, kind });
    }
  }

  const now = new Date().toISOString();
  const changes = {};
  const events = [];
  const previous = cfg.modelHealth ?? {};
  for (const t of targets) {
    let entry;
    try {
      const ms = await probe(t.model, t.kind === 'vision' ? 'vision' : 'chat', conn);
      entry = { status: 'ok', latencyMs: ms, checkedAt: now };
    } catch (err) {
      const c = classifyModelError(err);
      entry = { status: DEAD.includes(c.kind) ? c.kind : 'degraded', httpStatus: c.status, checkedAt: now, error: String(err.message).slice(0, 200) };
    }
    const prev = previous[t.model]?.status;
    if (prev && prev !== entry.status && (DEAD.includes(prev) || DEAD.includes(entry.status))) {
      events.push({ at: now, role: t.kind === 'vision' ? 'vision' : 'text', model: t.model, type: entry.status === 'ok' ? 'recovered' : entry.status, detail: entry.error ?? 'Health check passed.' });
    }
    changes[t.model] = entry;
    await new Promise((r) => setTimeout(r, 300)); // stay under the account's rate limit
  }

  const next = { ...row, config: { ...cfg, modelHealth: { ...previous, ...changes } } };
  const after = effectiveModels(next, { narrativePreferred });
  for (const role of Object.keys(after)) {
    if (before[role] !== after[role]) events.push({ at: now, role, model: before[role], type: 'switched', detail: `Health check moved ${role} to ${after[role] ?? 'no working model'}.`, switchedTo: after[role] });
  }

  const fresh = await prisma.integration.findUnique({ where: { provider: 'nvidia' } });
  const freshCfg = fresh?.config ?? cfg;
  await prisma.integration.update({
    where: { provider: 'nvidia' },
    data: {
      config: {
        ...freshCfg,
        modelHealth: { ...(freshCfg.modelHealth ?? {}), ...changes },
        modelHealthCheckedAt: now,
        modelEvents: [...events, ...(freshCfg.modelEvents ?? [])].slice(0, 30),
      },
    },
  });
  return { checkedAt: now, results: changes, effective: after, events };
}
