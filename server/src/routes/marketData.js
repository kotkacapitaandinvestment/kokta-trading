import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { decryptSecret } from '../lib/crypto.js';
import { fetchWatchlistQuotes, fetchEconomicCalendar } from '../lib/finnhub.js';
import { fetchMassiveQuotes } from '../lib/massive.js';
import { watchlist as mockWatchlist, economicEvents as mockEconomicEvents, marketSentiment as mockSentiment } from '../lib/mockMarketData.js';

export const marketDataRouter = Router();
marketDataRouter.use(requireAuth);

function computeSentiment(liveItems) {
  const avgChange = liveItems.reduce((s, i) => s + i.change, 0) / liveItems.length;
  const overall = Math.round(Math.max(0, Math.min(100, 50 + avgChange * 15)));
  const breakdown = liveItems.map((i) => ({
    market: i.symbol,
    sentiment: Math.round(Math.max(0, Math.min(100, 50 + i.change * 15))),
  }));
  return { overall, breakdown };
}

async function getEnabledIntegration(provider) {
  const row = await prisma.integration.findUnique({ where: { provider } });
  return row && row.enabled && row.secretCipher ? row : null;
}

marketDataRouter.get('/snapshot', asyncHandler(async (req, res) => {
  const [massiveRow, finnhubRow] = await Promise.all([
    getEnabledIntegration('massive'),
    getEnabledIntegration('finnhub'),
  ]);

  let massiveItems = [];
  if (massiveRow) {
    try {
      massiveItems = await fetchMassiveQuotes(decryptSecret(massiveRow.secretCipher));
    } catch (err) {
      console.error('Massive watchlist fetch failed:', err.message);
    }
  }

  let finnhubItems = [];
  if (finnhubRow) {
    try {
      const result = await fetchWatchlistQuotes(decryptSecret(finnhubRow.secretCipher));
      finnhubItems = result.items;
    } catch (err) {
      console.error('Finnhub watchlist fetch failed:', err.message);
    }
  }

  // Prefer Massive per-symbol (broader free-tier coverage), fall back to Finnhub, then sample data.
  const watchlist = mockWatchlist.map((mockItem) => {
    const fromMassive = massiveItems.find((i) => i.symbol === mockItem.symbol && i.live);
    if (fromMassive) return { ...fromMassive, source: 'massive' };
    const fromFinnhub = finnhubItems.find((i) => i.symbol === mockItem.symbol && i.live);
    if (fromFinnhub) return { ...fromFinnhub, source: 'finnhub' };
    return { ...mockItem, live: false };
  });

  let economicEvents = null;
  if (finnhubRow) {
    try {
      economicEvents = await fetchEconomicCalendar(decryptSecret(finnhubRow.secretCipher));
    } catch (err) {
      console.error('Finnhub economic calendar fetch failed:', err.message);
    }
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
