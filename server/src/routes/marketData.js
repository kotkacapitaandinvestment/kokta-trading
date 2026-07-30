import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { decryptSecret } from '../lib/crypto.js';
import { fetchWatchlistQuotes, fetchEconomicCalendar } from '../lib/finnhub.js';
import { watchlist as mockWatchlist, economicEvents as mockEconomicEvents, marketSentiment as mockSentiment } from '../lib/mockMarketData.js';

export const marketDataRouter = Router();
marketDataRouter.use(requireAuth);

function computeSentiment(items) {
  const live = items.filter((i) => i.live);
  if (live.length === 0) return null;
  const avgChange = live.reduce((s, i) => s + i.change, 0) / live.length;
  // Map an average % change (roughly -2..+2 typical daily range) onto a 0-100 bullish scale.
  const overall = Math.round(Math.max(0, Math.min(100, 50 + avgChange * 15)));
  const breakdown = live.map((i) => ({
    market: i.symbol,
    sentiment: Math.round(Math.max(0, Math.min(100, 50 + i.change * 15))),
  }));
  return { overall, breakdown };
}

marketDataRouter.get('/snapshot', asyncHandler(async (req, res) => {
  const integration = await prisma.integration.findUnique({ where: { provider: 'finnhub' } });
  if (!integration || !integration.enabled || !integration.secretCipher) {
    return res.json({ source: 'mock', watchlist: mockWatchlist, economicEvents: mockEconomicEvents, sentiment: mockSentiment });
  }

  const apiKey = decryptSecret(integration.secretCipher);

  let watchlistResult;
  try {
    watchlistResult = await fetchWatchlistQuotes(apiKey);
  } catch (err) {
    console.error('Finnhub watchlist fetch failed:', err.message);
    watchlistResult = { items: [], anySucceeded: false };
  }

  let economicEvents;
  try {
    economicEvents = await fetchEconomicCalendar(apiKey);
  } catch (err) {
    console.error('Finnhub economic calendar fetch failed:', err.message);
    economicEvents = null;
  }

  if (!watchlistResult.anySucceeded) {
    return res.json({
      source: 'mock',
      watchlist: mockWatchlist,
      economicEvents: economicEvents ?? mockEconomicEvents,
      sentiment: mockSentiment,
    });
  }

  const sentiment = computeSentiment(watchlistResult.items) ?? mockSentiment;

  res.json({
    source: 'finnhub',
    watchlist: watchlistResult.items,
    economicEvents: economicEvents ?? mockEconomicEvents,
    sentiment,
  });
}));
