import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { encryptSecret, decryptSecret, maskSecret } from '../lib/crypto.js';
import { nvidiaChatCompletion } from '../lib/nvidia.js';
import { connection, withModelFallback, effectiveModels, checkModelHealth, VETTED_MODELS } from '../lib/aiModels.js';
import { loadSettings as loadResearchSettings } from '../lib/research/settings.js';
import { paystackTestConnection } from '../lib/paystack.js';
import { finnhubTestConnection } from '../lib/finnhub.js';
import { massiveTestConnection } from '../lib/massive.js';
import { fredTestConnection } from '../lib/research/sources/timeseries.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const adminIntegrationsRouter = Router();
adminIntegrationsRouter.use(requireAuth, requireRole('super_admin'));

const TEST_CONNECTIONS = {
  nvidia: async (row) => {
    const conn = connection(row);
    const chat = await withModelFallback('chat', row, (model, settings) =>
      nvidiaChatCompletion({ ...conn, model, messages: [{ role: 'user', content: 'Reply with the single word: pong' }], maxTokens: 10, topP: settings.topP, extraBody: settings.extraBody, timeoutMs: 30000 }),
    );
    let message = `Chat model ${chat.model} replied: "${String(chat.result).trim()}"${chat.fellBackFrom.length ? ` (fell back from ${chat.fellBackFrom.join(', ')})` : ''}`;
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
      message += ` · Vision model ${vision.model} replied: "${String(vision.result).trim()}"${vision.fellBackFrom.length ? ` (fell back from ${vision.fellBackFrom.join(', ')})` : ''}`;
    } catch (err) {
      message += ` · Vision check FAILED: ${err.message}`;
    }
    return message;
  },
  paystack: async (row) => paystackTestConnection(decryptSecret(row.secretCipher)),
  finnhub: async (row) => finnhubTestConnection(decryptSecret(row.secretCipher)),
  massive: async (row) => massiveTestConnection(decryptSecret(row.secretCipher)),
  fred: async (row) => fredTestConnection(decryptSecret(row.secretCipher)),
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
  const rows = await prisma.integration.findMany();
  const narrativePreferred = await narrativePreference();
  res.json({ integrations: rows.map((r) => toPublicIntegration(r, { narrativePreferred })) });
}));

adminIntegrationsRouter.put('/:provider', asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const { secret, publicKey, config, enabled } = req.body ?? {};

  const existing = await prisma.integration.findUnique({ where: { provider } });
  if (!secret && !existing) {
    return res.status(400).json({ error: 'A secret key is required to create a new integration.' });
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
  if (!row || !row.secretCipher) return res.status(404).json({ error: 'Integration not configured.' });

  const test = TEST_CONNECTIONS[provider];
  if (!test) return res.status(400).json({ error: `No test available for provider "${provider}".` });

  try {
    const sample = await test(row);
    res.json({ ok: true, sample });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
}));
