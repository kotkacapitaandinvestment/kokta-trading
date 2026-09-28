import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { encryptSecret, decryptSecret, maskSecret } from '../lib/crypto.js';
import { nvidiaChatCompletion } from '../lib/nvidia.js';
import { connection, withModelFallback, effectiveModels, checkModelHealth, modelName, VETTED_MODELS } from '../lib/aiModels.js';
import { loadSettings as loadResearchSettings } from '../lib/research/settings.js';
import { paystackTestConnection } from '../lib/paystack.js';
import { finnhubTestConnection } from '../lib/finnhub.js';
import { massiveTestConnection } from '../lib/massive.js';
import { fredTestConnection } from '../lib/research/sources/timeseries.js';
import { cronJobOrgTestConnection } from '../lib/cronJobOrg.js';
import { inboxTestConnection } from '../lib/email/inbox.js';

// Resend: which sending domains are verified.
async function resendTestConnection(key) {
  const r = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Resend API error (${r.status})`);
  const domains = (await r.json()).data ?? [];
  const ours = domains.find((d) => d.name === 'kotkafinance.online');
  if (!ours) return 'Connected, but kotkafinance.online isn’t added in Resend yet, so emails can’t be sent from it.';
  return ours.status === 'verified' ? 'Connected. Sending from no-reply@kotkafinance.online (domain verified).' : `Connected, but kotkafinance.online is “${ours.status}” in Resend. Finish the DNS steps there before emails can go out.`;
}
import { asyncHandler } from '../lib/asyncHandler.js';

export const adminIntegrationsRouter = Router();
adminIntegrationsRouter.use(requireAuth, requireRole('super_admin'));

const CONFIG_KEYS = { nvidia: ['model', 'chatFallbacks', 'visionModel', 'visionFallbacks', 'baseUrl'], paystack: [], finnhub: [], massive: [], fred: [], cronjob: [], resend: [], inbox: ['listId', 'senderEmail'] };

const SERVICE_NAME = { nvidia: 'NVIDIA', paystack: 'Paystack', finnhub: 'Finnhub', massive: 'Massive', fred: 'FRED', cronjob: 'cron-job.org', resend: 'Resend', inbox: 'INBOX' };

const TEST_CONNECTIONS = {
  nvidia: async (row) => {
    const conn = connection(row);
    const chat = await withModelFallback('chat', row, (model, settings) =>
      nvidiaChatCompletion({ ...conn, model, messages: [{ role: 'user', content: 'Reply with the single word: pong' }], maxTokens: 10, topP: settings.topP, extraBody: settings.extraBody, timeoutMs: 30000 }),
    );
    let message = `Connected. Chat works (using ${modelName(chat.model)}${chat.fellBackFrom.length ? ', a backup, because the first choice didn’t respond' : ''}).`;
    try {
      const vision = await withModelFallback('vision', row, (model, settings) =>
        nvidiaChatCompletion({
          ...conn,
          model,
          messages: [{ role: 'user', content: [{ type: 'text', text: 'What color is this image? One word.' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC' } }] }],
          maxTokens: 10,
          topP: settings.topP,
          extraBody: settings.extraBody,
          timeoutMs: 30000,
        }),
      );
      message += ` Chart reading works (using ${modelName(vision.model)}${vision.fellBackFrom.length ? ', a backup' : ''}).`;
    } catch {
      message += ' Chart reading didn’t respond. Kotka will keep trying other models.';
    }
    return message;
  },
  paystack: async (row) => paystackTestConnection(decryptSecret(row.secretCipher)),
  finnhub: async (row) => finnhubTestConnection(decryptSecret(row.secretCipher)),
  massive: async (row) => massiveTestConnection(decryptSecret(row.secretCipher)),
  fred: async (row) => fredTestConnection(decryptSecret(row.secretCipher)),
  cronjob: async (row) => cronJobOrgTestConnection(decryptSecret(row.secretCipher)),
  resend: async (row) => resendTestConnection(decryptSecret(row.secretCipher)),
  inbox: async (row) => inboxTestConnection(row),
};

function toPublicIntegration(row, extras = {}) {
  if (!row) return null;
  return {
    provider: row.provider,
    enabled: row.enabled,
    config: row.config,
    publicKey: row.publicKey,
    maskedSecret: row.secretCipher ? maskSecret(decryptSecret(row.secretCipher)) : null,
    updatedAt: row.updatedAt,
    ...(row.provider === 'nvidia' ? { models: { effective: effectiveModels(row, extras), vetted: VETTED_MODELS } } : {}),
  };
}

async function narrativePreference() {
  return (await loadResearchSettings()).model?.trim() || undefined;
}

adminIntegrationsRouter.get('/', asyncHandler(async (req, res) => {
  // The Web Push keys are generated and managed by the server (lib/push.js).
  const rows = await prisma.integration.findMany({ where: { provider: { not: 'webpush' } } });
  const narrativePreferred = await narrativePreference();
  res.json({ integrations: rows.map((r) => toPublicIntegration(r, { narrativePreferred })) });
}));

adminIntegrationsRouter.put('/:provider', asyncHandler(async (req, res) => {
  const { provider } = req.params;
  if (provider === 'webpush') return res.status(400).json({ error: 'Web Push keys are managed by Kotka and cannot be edited here.' });
  if (!CONFIG_KEYS[provider]) return res.status(404).json({ error: 'That service isn’t one Kotka connects to.' });
  const { publicKey, enabled } = req.body ?? {};
  // Only each service's own settings; server-managed fields (model health,
  // switch history) can't be written from here.
  const allowed = CONFIG_KEYS[provider] ?? [];
  const config = req.body?.config && typeof req.body.config === 'object'
    ? Object.fromEntries(Object.entries(req.body.config).filter(([k, v]) => allowed.includes(k) && (typeof v === 'string' ? v.length <= 1000 : ['number', 'boolean'].includes(typeof v))))
    : undefined;
  if (config?.baseUrl && !/^https:\/\/[a-z0-9.-]+(\/[\w./-]*)?$/i.test(config.baseUrl)) return res.status(400).json({ error: 'The address must start with https://' });
  if (publicKey !== undefined && (typeof publicKey !== 'string' || publicKey.length > 500)) return res.status(400).json({ error: 'That public key doesn’t look right.' });
  const secret = typeof req.body?.secret === 'string' ? req.body.secret.trim() : undefined;

  const existing = await prisma.integration.findUnique({ where: { provider } });
  if (!secret && !existing) {
    return res.status(400).json({ error: 'Paste the access key first.' });
  }

  const row = await prisma.integration.upsert({
    where: { provider },
    update: {
      ...(secret ? { secretCipher: encryptSecret(secret) } : {}),
      ...(publicKey !== undefined ? { publicKey } : {}),
      ...(config ? { config: { ...(existing?.config ?? {}), ...config } } : {}),
      ...(typeof enabled === 'boolean' ? { enabled } : {}),
    },
    create: {
      provider,
      secretCipher: encryptSecret(secret),
      publicKey: publicKey ?? null,
      config: config ?? {},
      enabled: enabled ?? true,
    },
  });

  await audit(req, existing ? 'integration.updated' : 'integration.created', {
    targetType: 'integration',
    targetId: provider,
    detail: { secretChanged: !!secret, ...(typeof enabled === 'boolean' ? { enabled } : {}), ...(config ? { configKeys: Object.keys(config) } : {}) },
  });
  res.json({ integration: toPublicIntegration(row, { narrativePreferred: await narrativePreference() }) });
}));

// Re-tests every candidate model now (the scheduled job does this every 6h).
adminIntegrationsRouter.post('/nvidia/health', asyncHandler(async (req, res) => {
  const narrativePreferred = await narrativePreference();
  const report = await checkModelHealth({ force: true, narrativePreferred });
  const row = await prisma.integration.findUnique({ where: { provider: 'nvidia' } });
  res.json({ report, integration: toPublicIntegration(row, { narrativePreferred }) });
}));

adminIntegrationsRouter.post('/:provider/test', asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const row = await prisma.integration.findUnique({ where: { provider } });
  if (!row || !row.secretCipher) return res.status(404).json({ error: 'Save a key before testing.' });

  const test = TEST_CONNECTIONS[provider];
  if (!test) return res.status(400).json({ error: 'This service can’t be tested from here.' });

  try {
    const sample = await test(row);
    res.json({ ok: true, sample });
  } catch (err) {
    // Provider errors are technical ("… API error (401): {…}"); say what to do instead.
    const status = Number(String(err?.message).match(/\((\d{3})\)|HTTP (\d{3})/)?.slice(1).find(Boolean));
    const name = SERVICE_NAME[provider] ?? 'the service';
    const refused = provider === 'inbox' ? 'INBOX refused the login. Check the INBOX account email and password, save them again and retry.' : `${name} refused the key. Check you copied the whole key, save it again and retry.`;
    const error = status === 401 || status === 403 ? refused : `Couldn’t reach ${name} just now. Try again in a moment.`;
    res.status(502).json({ ok: false, error });
  }
}));
