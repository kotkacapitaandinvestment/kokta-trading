// Real functions Kotka AI can call mid-conversation to ground its coaching
// in the trader's actual data instead of only reasoning from chat text.
// Every function here returns real computed/fetched data — never fabricated.

import { prisma } from './prisma.js';
import { computeScores, computeAnalytics, computeIdentity } from './traderMetrics.js';
import { getMarketPulse, getOfficialCalendar } from './marketPulse.js';
import { parseSubject } from './research/currencies.js';
import { latestReport } from './research/engine.js';

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
      name: 'get_fundamental_research',
      description:
        "Get Kotka's latest cached Fundamental Research report for a currency (e.g. EUR) or currency pair (e.g. EURUSD): fundamental score and confidence, factor scores with their evidence, central bank stance, IMF forecast revisions, upcoming catalysts and invalidation conditions — all from official sources (IMF, central banks, statistics offices). Fundamentals are context, never a trade signal.",
      parameters: {
        type: 'object',
        properties: { instrument: { type: 'string', description: 'Currency code (EUR) or pair (EURUSD / EUR/USD).' } },
        required: ['instrument'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_snapshot',
      description:
        'Get end-of-day market context for EUR/USD, GBP/USD, USD/JPY, XAU/USD, NAS100 and BTC/USD: last daily close and its date, the close-to-close change, 14-day ATR and volatility regime, and the 20-day range. These are previous-session closes, not live quotes. Also returns the next 7 days of official USD and EUR releases (FOMC, ECB, BLS, BEA, Eurostat). Unavailable items are marked unavailable; never guess them.',
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
      const [pulse, calendar] = await Promise.all([getMarketPulse(), getOfficialCalendar({ days: 7 })]);
      return {
        note: 'End-of-day data (previous session close), not live quotes.',
        instruments: pulse.instruments.map(({ symbol, available, reason, close, closeDate, changePct, atr, atrPct, regime, range }) =>
          available ? { symbol, close, closeDate, changePct, atr, atrPct, regime, range20d: range } : { symbol, available: false, reason },
        ),
        upcomingOfficialReleases: calendar.events.map((e) => ({ date: e.dateOnly ? e.date.slice(0, 10) : e.date, currency: e.currency, title: e.title, importance: e.importance })),
      };
    }
    case 'get_fundamental_research': {
      const parsed = parseSubject(args?.instrument);
      if (!parsed) return { available: false, reason: 'Unsupported instrument.' };
      const row = await latestReport(parsed.kind, parsed.subject);
      if (!row) return { available: false, reason: `No research report exists yet for ${parsed.subject}. The trader can generate one in Market Intelligence → Fundamental Research.` };
      const r = row.payload;
      return {
        available: true,
        instrument: parsed.subject,
        researchedAt: row.createdAt,
        verdict: r.verdict,
        currencies: [r.base, r.quote].filter(Boolean).map((code) => r.currencies[code]).map((c) => ({
          currency: c.code,
          score: c.score,
          condition: c.condition,
          confidence: c.confidence,
          policy: c.policy ? { rate: c.policy.display, stance: c.policy.stance, realRate: c.policy.realRate } : null,
          factors: Object.values(c.factors).map((f) => ({ factor: f.label, score: f.available ? f.score : null, classification: f.classification, evidence: f.available ? f.rationale : f.unavailableReason })),
        })),
        pairFactors: r.pair?.factors?.map((f) => ({ factor: f.label, favours: f.favors })) ?? null,
        bottomLine: r.narrative?.bottomLine,
        upcomingCatalysts: r.catalysts.items.filter((c) => c.date).slice(0, 5).map((c) => ({ date: c.date.slice(0, 10), event: c.event, currency: c.currency })),
        whatCouldChangeThisView: r.invalidation.map((i) => i.text),
      };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
