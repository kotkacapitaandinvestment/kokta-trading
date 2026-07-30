import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { decryptSecret } from '../lib/crypto.js';
import { fetchWatchlistQuotes, fetchEconomicCalendar } from '../lib/finnhub.js';
import { watchlist as mockWatchlist, economicEvents as mockEconomicEvents, marketSentiment as mockSentiment } from '../lib/mockMarketData.js';

export const marketDataRouter = Router();
marketDataRouter.use(requireAuth);

const mockBySymbol = Object.fromEntries(mockWatchlist.map((w) => [w.symbol, w]));

function computeSentiment(liveItems) {
  const avgChange = liveItems.reduce((s, i) => s + i.change, 0) / liveItems.length;
  const overall = Math.round(Math.max(0, Math.min(100, 50 + avgChange * 15)));
  const breakdown = liveItems.map((i) => ({
    market: i.symbol,
    sentiment: Math.round(Math.max(0, Math.min(100, 50 + i.change * 15))),
  }));
  return { overall, breakdown };
}

marketDataRouter.get('/snapshot', asyncHandler(async (req, res) => {
  const integration = await prisma.integration.findUnique({ where: { provider: 'finnhub' } });
  if (!integration || !integration.enabled || !integration.secretCipher) {
    return res.json({
      watchlist: mockWatchlist,
      economicEvents: mockEconomicEvents,
      economicEventsLive: false,
      sentiment: mockSentiment,
      sentimentLive: false,
    });
  }

  const apiKey = decryptSecret(integration.secretCipher);

  let fetched;
  try {
    fetched = await fetchWatchlistQuotes(apiKey);
  } catch (err) {
    console.error('Finnhub watchlist fetch failed:', err.message);
    fetched = { items: [] };
  }

  // Merge: use the real quote where Finnhub returned one, otherwise fall back to that
  // symbol's illustrative value (still labeled live:false so the UI can be honest about it).
  const watchlist = mockWatchlist.map((mockItem) => {
    const real = fetched.items.find((i) => i.symbol === mockItem.symbol && i.live);
    return real ?? { ...mockItem, live: false };
  });

  let economicEvents = null;
  try {
    economicEvents = await fetchEconomicCalendar(apiKey);
  } catch (err) {
    console.error('Finnhub economic calendar fetch failed:', err.message);
  }

  const liveItems = watchlist.filter((w) => w.live);
  const sentimentLive = liveItems.length >= 2;
  const sentiment = sentimentLive ? computeSentiment(liveItems) : mockSentiment;

  res.json({
    watchlist,
    economicEvents: economicEvents?.length ? economicEvents : mockEconomicEvents,
    economicEventsLive: !!economicEvents?.length,
    sentiment,
    sentimentLive,
  });
}));
