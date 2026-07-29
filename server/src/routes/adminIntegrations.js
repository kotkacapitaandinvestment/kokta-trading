import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { encryptSecret, decryptSecret, maskSecret } from '../lib/crypto.js';
import { nvidiaChatCompletion } from '../lib/nvidia.js';
import { paystackTestConnection } from '../lib/paystack.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const adminIntegrationsRouter = Router();
adminIntegrationsRouter.use(requireAuth, requireRole('super_admin'));

const TEST_CONNECTIONS = {
  nvidia: async (row) => {
    const reply = await nvidiaChatCompletion({
      apiKey: decryptSecret(row.secretCipher),
      baseUrl: row.config?.baseUrl,
      model: row.config?.model,
      messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
      maxTokens: 10,
    });
    return `Model replied: "${reply.trim()}"`;
  },
  paystack: async (row) => paystackTestConnection(decryptSecret(row.secretCipher)),
};

function toPublicIntegration(row) {
  if (!row) return null;
  return {
    provider: row.provider,
    enabled: row.enabled,
    config: row.config,
    publicKey: row.publicKey,
    maskedSecret: row.secretCipher ? maskSecret(decryptSecret(row.secretCipher)) : null,
    updatedAt: row.updatedAt,
  };
}

adminIntegrationsRouter.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.integration.findMany();
  res.json({ integrations: rows.map(toPublicIntegration) });
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

  res.json({ integration: toPublicIntegration(row) });
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
