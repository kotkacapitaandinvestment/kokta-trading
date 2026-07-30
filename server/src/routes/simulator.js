import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { decryptSecret } from '../lib/crypto.js';
import { MASSIVE_SYMBOLS, fetchHistoricalBars } from '../lib/massive.js';
import {
  SIMULATOR_TIMEFRAME,
  WARMUP_BAR_COUNT,
  pickFetchWindow,
  pickSessionSlice,
  advanceSession,
  closeTradeManual,
  endSession,
} from '../lib/simulatorEngine.js';

export const simulatorRouter = Router();
simulatorRouter.use(requireAuth);

// Coarser fallbacks if the configured intraday timeframe isn't available for
// a given ticker at request time (rate limit, symbol-specific gap, etc.).
const TIMEFRAME_FALLBACKS = [
  SIMULATOR_TIMEFRAME,
  { multiplier: 1, unit: 'hour' },
  { multiplier: 1, unit: 'day' },
];
const MIN_BARS_REQUIRED = 60;

async function getEnabledIntegration(provider) {
  const row = await prisma.integration.findUnique({ where: { provider } });
  return row && row.enabled && row.secretCipher ? row : null;
}

function toPublicSession(session) {
  const { bars, ...rest } = session;
  return { ...rest, bars: bars.slice(0, session.cursor + 1) };
}

async function loadOwnedSession(id, userId) {
  const session = await prisma.simulatorSession.findUnique({ where: { id } });
  if (!session || session.userId !== userId) return null;
  return session;
}

simulatorRouter.get('/symbols', asyncHandler(async (req, res) => {
  const row = await getEnabledIntegration('massive');
  if (!row) return res.status(503).json({ error: 'Market data provider not configured.' });
  const symbols = Object.entries(MASSIVE_SYMBOLS).map(([symbol, [, market]]) => ({ symbol, market }));
  res.json({ symbols });
}));

simulatorRouter.get('/sessions', asyncHandler(async (req, res) => {
  const sessions = await prisma.simulatorSession.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, symbol: true, ticker: true, timeframeMultiplier: true, timeframeUnit: true,
      startingBalance: true, balance: true, status: true, createdAt: true, completedAt: true,
    },
  });
  res.json({ sessions });
}));

simulatorRouter.get('/sessions/:id', asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  const trades = await prisma.simulatorTrade.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: 'asc' } });
  res.json({ session: toPublicSession(session), trades });
}));

simulatorRouter.post('/sessions', asyncHandler(async (req, res) => {
  const { symbol } = req.body ?? {};
  const entry = MASSIVE_SYMBOLS[symbol];
  if (!entry) return res.status(400).json({ error: 'Unknown or unsupported symbol.' });
  const [ticker] = entry;

  const massiveRow = await getEnabledIntegration('massive');
  if (!massiveRow) return res.status(503).json({ error: 'Market data provider not configured.' });
  const apiKey = decryptSecret(massiveRow.secretCipher);

  let bars = [];
  let usedTimeframe = null;
  for (const timeframe of TIMEFRAME_FALLBACKS) {
    const { from, to } = pickFetchWindow();
    try {
      const fetched = await fetchHistoricalBars(apiKey, ticker, timeframe.multiplier, timeframe.unit, from, to);
      if (fetched.length >= MIN_BARS_REQUIRED) {
        bars = fetched;
        usedTimeframe = timeframe;
        break;
      }
    } catch (err) {
      console.error(`Simulator bar fetch failed for ${ticker} at ${timeframe.multiplier}/${timeframe.unit}:`, err.message);
    }
  }

  if (!bars.length || !usedTimeframe) {
    return res.status(502).json({ error: 'Could not fetch enough real historical data to start a session. Try again shortly.' });
  }

  const sessionBars = pickSessionSlice(bars);
  const cursor = Math.min(WARMUP_BAR_COUNT, sessionBars.length - 1);
  const startingBalance = 10000;

  const session = await prisma.simulatorSession.create({
    data: {
      userId: req.userId,
      symbol,
      ticker,
      timeframeMultiplier: usedTimeframe.multiplier,
      timeframeUnit: usedTimeframe.unit,
      windowStart: new Date(sessionBars[0].t),
      windowEnd: new Date(sessionBars[sessionBars.length - 1].t),
      bars: sessionBars,
      cursor,
      startingBalance,
      balance: startingBalance,
      status: 'active',
    },
  });

  res.status(201).json({ session: toPublicSession(session) });
}));

simulatorRouter.post('/sessions/:id/advance', asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.status !== 'active') return res.status(400).json({ error: 'Session is not active.' });

  const openTrade = await prisma.simulatorTrade.findFirst({ where: { sessionId: session.id, status: 'open' } });
  const steps = Math.max(1, Number(req.body?.steps) || 1);
  const prevCursor = session.cursor;
  const toIndex = prevCursor + steps;

  const result = advanceSession(
    { bars: session.bars, cursor: prevCursor, balance: session.balance, openTrade },
    toIndex,
  );

  const reachedEnd = result.cursor >= session.bars.length - 1;
  let finalTrade = result.openTrade;
  let extraClosedTrade = null;
  if (reachedEnd && finalTrade) {
    extraClosedTrade = endSession(finalTrade, session.bars[result.cursor], result.cursor);
    result.balance += extraClosedTrade.pnl;
    finalTrade = null;
  }

  const closedTrades = [...result.closedTrades, ...(extraClosedTrade ? [extraClosedTrade] : [])];

  await prisma.$transaction([
    prisma.simulatorSession.update({
      where: { id: session.id },
      data: {
        cursor: result.cursor,
        balance: result.balance,
        status: reachedEnd ? 'completed' : 'active',
        completedAt: reachedEnd ? new Date() : null,
      },
    }),
    ...closedTrades.map((t) =>
      prisma.simulatorTrade.update({
        where: { id: openTrade.id },
        data: {
          exitPrice: t.exitPrice,
          exitBarIndex: t.exitBarIndex,
          exitAt: t.exitAt,
          pnl: t.pnl,
          result: t.result,
          closeReason: t.closeReason,
          status: 'closed',
        },
      }),
    ),
  ]);

  res.json({
    newBars: session.bars.slice(prevCursor + 1, result.cursor + 1),
    cursor: result.cursor,
    balance: result.balance,
    status: reachedEnd ? 'completed' : 'active',
    closedTrades,
  });
}));

simulatorRouter.post('/sessions/:id/trades', asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.status !== 'active') return res.status(400).json({ error: 'Session is not active.' });

  const { direction, size, stopLoss, takeProfit } = req.body ?? {};
  if (direction !== 'long' && direction !== 'short') {
    return res.status(400).json({ error: 'direction must be "long" or "short".' });
  }
  if (!(Number(size) > 0)) {
    return res.status(400).json({ error: 'size must be a positive number.' });
  }

  const existingOpen = await prisma.simulatorTrade.findFirst({ where: { sessionId: session.id, status: 'open' } });
  if (existingOpen) return res.status(400).json({ error: 'A trade is already open for this session.' });

  const currentBar = session.bars[session.cursor];
  const trade = await prisma.simulatorTrade.create({
    data: {
      sessionId: session.id,
      direction,
      size: Number(size),
      entryPrice: currentBar.c,
      entryBarIndex: session.cursor,
      entryAt: new Date(currentBar.t),
      stopLoss: stopLoss != null ? Number(stopLoss) : null,
      takeProfit: takeProfit != null ? Number(takeProfit) : null,
      status: 'open',
    },
  });

  res.status(201).json({ trade });
}));

simulatorRouter.post('/sessions/:id/trades/:tradeId/close', asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const existing = await prisma.simulatorTrade.findUnique({ where: { id: req.params.tradeId } });
  if (!existing || existing.sessionId !== session.id) return res.status(404).json({ error: 'Trade not found.' });
  if (existing.status !== 'open') return res.status(400).json({ error: 'Trade is already closed.' });

  const currentBar = session.bars[session.cursor];
  const closed = closeTradeManual(existing, currentBar, session.cursor);

  const [trade] = await prisma.$transaction([
    prisma.simulatorTrade.update({
      where: { id: existing.id },
      data: {
        exitPrice: closed.exitPrice,
        exitBarIndex: closed.exitBarIndex,
        exitAt: closed.exitAt,
        pnl: closed.pnl,
        result: closed.result,
        closeReason: closed.closeReason,
        status: 'closed',
      },
    }),
    prisma.simulatorSession.update({
      where: { id: session.id },
      data: { balance: session.balance + closed.pnl },
    }),
  ]);

  res.json({ trade });
}));
