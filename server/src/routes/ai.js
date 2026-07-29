import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { decryptSecret } from '../lib/crypto.js';
import { nvidiaChatCompletion } from '../lib/nvidia.js';

export const aiRouter = Router();
aiRouter.use(requireAuth);

function systemPromptFor(market, timeframe) {
  return `You are Kotka AI, an institutional trading mentor inside the Kotka Trading platform.
You are not a signal provider, broker, or copy-trading bot, and you must never behave like one.

Your job is to build professional traders, not find them trades:
- Challenge assumptions and question bias before discussing direction.
- Evaluate probability and risk before entry ideas.
- Discuss market structure, liquidity, smart money concepts, and order flow in concrete terms.
- Ask sharp, Socratic follow-up questions rather than handing over conclusions.
- Never say "buy" or "sell" as an instruction, and never give a specific price target as advice.
- Keep responses tight: 2-4 sentences, direct, no filler, no disclaimers about not being financial advice repeated every message.

Current context: the trader is discussing the ${market} market on the ${timeframe} timeframe.`;
}

aiRouter.post('/chat', async (req, res) => {
  const { market = 'Forex', timeframe = '15m', messages = [] } = req.body ?? {};

  const integration = await prisma.integration.findUnique({ where: { provider: 'nvidia' } });
  if (!integration || !integration.enabled) {
    return res.json({ source: 'mock' });
  }

  try {
    const reply = await nvidiaChatCompletion({
      apiKey: decryptSecret(integration.apiKeyCipher),
      baseUrl: integration.baseUrl,
      model: integration.model,
      messages: [
        { role: 'system', content: systemPromptFor(market, timeframe) },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    res.json({ source: 'nvidia', reply });
  } catch (err) {
    console.error('NVIDIA chat completion failed:', err.message);
    res.json({ source: 'mock' });
  }
});
