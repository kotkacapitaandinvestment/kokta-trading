import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { encryptSecret, decryptSecret, maskSecret } from '../lib/crypto.js';
import { nvidiaChatCompletion, NVIDIA_DEFAULT_BASE_URL, NVIDIA_DEFAULT_MODEL } from '../lib/nvidia.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const adminIntegrationsRouter = Router();
adminIntegrationsRouter.use(requireAuth, requireRole('super_admin'));

function toPublicIntegration(row) {
  if (!row) return null;
  return {
    provider: row.provider,
    model: row.model,
    baseUrl: row.baseUrl,
    enabled: row.enabled,
    maskedKey: maskSecret(decryptSecret(row.apiKeyCipher)),
    updatedAt: row.updatedAt,
  };
}

adminIntegrationsRouter.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.integration.findMany();
  res.json({ integrations: rows.map(toPublicIntegration) });
}));

adminIntegrationsRouter.put('/:provider', asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const { apiKey, model, baseUrl, enabled } = req.body ?? {};

  const existing = await prisma.integration.findUnique({ where: { provider } });
  if (!apiKey && !existing) {
    return res.status(400).json({ error: 'An API key is required to create a new integration.' });
  }

  const row = await prisma.integration.upsert({
    where: { provider },
    update: {
      ...(apiKey ? { apiKeyCipher: encryptSecret(apiKey) } : {}),
      ...(model ? { model } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(typeof enabled === 'boolean' ? { enabled } : {}),
    },
    create: {
      provider,
      apiKeyCipher: encryptSecret(apiKey),
      model: model || NVIDIA_DEFAULT_MODEL,
      baseUrl: baseUrl || NVIDIA_DEFAULT_BASE_URL,
      enabled: enabled ?? true,
    },
  });

  res.json({ integration: toPublicIntegration(row) });
}));

adminIntegrationsRouter.post('/:provider/test', asyncHandler(async (req, res) => {
  const row = await prisma.integration.findUnique({ where: { provider: req.params.provider } });
  if (!row) return res.status(404).json({ error: 'Integration not configured.' });

  try {
    const reply = await nvidiaChatCompletion({
      apiKey: decryptSecret(row.apiKeyCipher),
      baseUrl: row.baseUrl,
      model: row.model,
      messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
      maxTokens: 10,
    });
    res.json({ ok: true, sample: reply });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
}));
