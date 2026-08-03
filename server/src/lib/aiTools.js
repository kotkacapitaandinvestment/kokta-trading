// Real functions Kotka AI can call mid-conversation to ground its coaching
// in the trader's actual data instead of only reasoning from chat text.
// Every function here returns real computed/fetched data — never fabricated.

import { prisma } from './prisma.js';
import { computeScores, computeAnalytics, computeIdentity } from './traderMetrics.js';
import { getMarketSnapshot } from './marketSnapshot.js';

async function getUserEntries(userId) {
  const allEntries = await prisma.journalEntry.findMany({ where: { userId }, orderBy: { date: 'asc' } });
  const entries = allEntries.filter((e) => e.positionStatus !== 'open');
  const openPositions = allEntries.filter((e) => e.positionStatus === 'open');
  return { entries, openPositions };
}

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_trader_stats',
      description:
        "Get the trader's real behavioral scores (Discipline, Execution, Risk Control, Confidence, Consistency, Psychology, Patience, Institutional Thinking, each 0-100), win rate, profit factor, expectancy, and identity facts (best/worst session, best strategy, emotional trigger before losses), all computed from their actual logged journal trades.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_trades',
      description:
        "Get the trader's most recently logged closed trades, with real market, direction, strategy, session, result, P&L, R-multiple, confidence, and their own recorded mistakes/lessons text.",
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'How many recent trades to return. Default 5, max 20.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_open_positions',
      description: "Get the trader's currently open (not yet closed) logged positions, with entry, stop loss, take profit, and risk.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_snapshot',
      description:
        'Get real live prices and daily change for the tracked watchlist (EUR/USD, GBP/JPY, XAU/USD, NAS100, BTC/USD), current volatility (ATR) readings and regime, and derived market sentiment. Each item is labeled live or sample depending on whether real data was actually available.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

export async function executeToolCall(name, args, userId) {
  switch (name) {
    case 'get_trader_stats': {
      const { entries } = await getUserEntries(userId);
      const { scores, hasData } = computeScores(entries);
      const identity = computeIdentity(entries);
      const analytics = computeAnalytics(entries);
      return {
        hasData,
        scores,
        identity,
        winRate: analytics.winRate,
        profitFactor: analytics.profitFactor,
        expectancy: analytics.expectancy,
        avgRR: analytics.avgRR,
        totalTrades: analytics.totalTrades,
      };
    }
    case 'get_recent_trades': {
      const limit = Math.min(Math.max(Number(args?.limit) || 5, 1), 20);
      const { entries } = await getUserEntries(userId);
      const recent = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
      return recent.map((e) => ({
        date: e.date,
        market: e.market,
        direction: e.direction,
        strategy: e.strategy,
        session: e.session,
        result: e.result,
        pnl: e.pnl,
        reward: e.reward,
        confidence: e.confidence,
        mistakes: e.mistakes,
        lessons: e.lessons,
      }));
    }
    case 'get_open_positions': {
      const { openPositions } = await getUserEntries(userId);
      return openPositions.map((e) => ({
        market: e.market,
        direction: e.direction,
        entry: e.entry,
        stopLoss: e.stopLoss,
        takeProfit: e.takeProfit,
        risk: e.risk,
        date: e.date,
      }));
    }
    case 'get_market_snapshot': {
      const snapshot = await getMarketSnapshot();
      return {
        watchlist: snapshot.watchlist.map((w) => ({ symbol: w.symbol, price: w.price, change: w.change, live: w.live })),
        sentiment: snapshot.sentiment,
        sentimentLive: snapshot.sentimentLive,
        volatility: snapshot.volatility,
      };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
