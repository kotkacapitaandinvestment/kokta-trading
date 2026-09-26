// Real functions Kotka AI can call mid-conversation, so it can answer from
// what is actually in Kotka: the trader's own records, Market Intelligence
// (market data, Fundamental Research, crypto context), the official event
// calendar, news, and what the Community is saying. Every function returns
// real stored or fetched data with its date, or says plainly that it is
// unavailable. Nothing here is fabricated or estimated.

import { prisma } from './prisma.js';
import { computeScores, computeAnalytics, computeIdentity } from './traderMetrics.js';
import { instrumentMarketData, getOfficialCalendar } from './marketPulse.js';
import { INSTRUMENTS, instrument as findInstrument, marketStatus } from './instruments.js';
import { parseSubject } from './research/currencies.js';
import { latestReport, latestReportSummaries, reportHistory } from './research/engine.js';
import { CRYPTO, cryptoContext } from './research/crypto.js';
import { sentimentFor, sentimentHistory, SENTIMENT_WINDOW_DAYS } from './community/sentiment.js';
import { announcementsFor } from '../routes/adminAnnouncements.js';
// Same eight conditions the Checklist page shows.
import { CHECKLIST_ITEMS } from '../../../src/features/checklist/items.js';

const DAY = 24 * 60 * 60 * 1000;
const todayStr = () => new Date().toISOString().slice(0, 10);
const round = (v, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v);
const clampInt = (v, lo, hi, dflt) => Math.min(Math.max(Number.parseInt(v, 10) || dflt, lo), hi);
const iso = (d) => (d ? new Date(d).toISOString() : null);

const SUPPORTED = INSTRUMENTS.map((i) => i.symbol).join(', ');

async function getUserEntries(userId) {
  const [allEntries, settings] = await Promise.all([
    prisma.journalEntry.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
    prisma.userSettings.findUnique({ where: { userId }, select: { tradingPreferences: true } }),
  ]);
  const prefs = settings?.tradingPreferences ?? {};
  return {
    entries: allEntries.filter((e) => e.positionStatus !== 'open'),
    openPositions: allEntries.filter((e) => e.positionStatus === 'open'),
    defaultRisk: prefs.defaultRisk ?? 1,
    dailyLossLimit: prefs.dailyLossLimit ?? 2,
    baseCurrency: prefs.baseCurrency ?? 'USD',
  };
}

// Compact market data for one instrument (no raw bar history).
function marketView(inst, d) {
  if (!d?.available) return { symbol: inst.symbol, display: inst.display, market: inst.market, available: false, reason: d?.note ?? d?.reason ?? 'unavailable' };
  const closes = (d.history ?? []).slice(-10).map((h) => ({ date: h.t, close: h.c }));
  return {
    symbol: inst.symbol,
    display: inst.display,
    market: inst.market,
    available: true,
    dataType: 'End-of-day daily close from Massive, not a live quote',
    close: d.close,
    closeDate: d.closeDate,
    changePct: d.changePct,
    lastSession: d.session,
    unusualMove: d.unusualMove,
    atr14: d.atr,
    atr14Pct: d.atrPct,
    volatilityRegime: d.regime,
    range20d: d.range
      ? { high: d.range.high, low: d.range.low, whereTheCloseSits: d.range.position == null ? null : `${Math.round(d.range.position * 100)}% of the way from the 20-day low to the 20-day high (${d.technical?.rangeThird ?? ''})` }
      : null,
    movingAverages: d.technical ? { sma20: d.technical.sma20, sma50: d.technical.sma50, closeVs20d: d.technical.vsSma20, closeVs50d: d.technical.vsSma50 } : null,
    ...(closes.length ? { last10Closes: closes } : {}),
    stale: d.stale || undefined,
  };
}

function performance(history) {
  if (!history?.length) return null;
  const last = history.at(-1);
  const back = (days) => {
    const cutoff = new Date(new Date(last.t).getTime() - days * DAY).toISOString().slice(0, 10);
    let pick = null;
    for (const h of history) if (h.t <= cutoff) pick = h;
    return pick ? round((last.c / pick.c - 1) * 100) : null;
  };
  return { change7dPct: back(7), change30dPct: back(30), change90dPct: back(90) };
}

function eventView(e) {
  return {
    title: e.title,
    currency: e.currency,
    importance: e.importance,
    scheduledAt: e.dateOnly ? iso(e.scheduledAt).slice(0, 10) : iso(e.scheduledAt),
    referencePeriod: e.referencePeriod ?? undefined,
    previous: e.previous ?? undefined,
    forecast: e.forecast ?? undefined,
    actual: e.actual ?? undefined,
    valuesNote: e.valuesNote ?? undefined,
    source: e.sourceName ?? e.source,
    link: `/app/community/events/${e.id}`,
  };
}

function newsView(n) {
  return {
    headline: n.headline,
    provider: n.provider,
    official: n.official || undefined,
    publishedAt: iso(n.publishedAt),
    summary: n.summary ? n.summary.slice(0, 280) : undefined,
    markets: n.instruments,
    link: `/app/community/news/${n.id}`,
  };
}

async function activeIdeas(symbol, take = 5) {
  const ideas = await prisma.tradeIdea.findMany({
    where: { instrument: symbol, status: { in: ['open', 'updated'] }, post: { deletedAt: null, removedAt: null } },
    orderBy: { createdAt: 'desc' },
    take,
    include: { post: { select: { id: true, commentCount: true, reactionCount: true, author: { select: { username: true } } } } },
  });
  return ideas.map((i) => ({
    author: i.post.author?.username ? `@${i.post.author.username}` : 'a trader',
    direction: i.direction,
    timeframe: i.timeframe,
    entry: i.entry,
    stop: i.stop,
    target: i.target,
    riskReward: i.riskReward,
    thesis: i.thesis.slice(0, 300),
    status: i.status,
    postedAt: iso(i.createdAt),
    comments: i.post.commentCount,
    link: `/app/community/ideas/${i.post.id}`,
  }));
}

// Condensed Fundamental Research report: everything the report page shows
// that matters for a question, without source plumbing.
function researchView(row, history) {
  const r = row.payload;
  const codes = [r.base, r.quote].filter(Boolean);
  const cur = (code) => {
    const c = r.currencies[code];
    const cb = r.centralBanks?.[code];
    return {
      currency: code,
      name: c.name,
      score: c.score,
      condition: c.condition,
      band: c.band,
      confidence: c.confidence,
      direction: r.directions?.[code] ? { label: r.directions[code].label, change1m: r.directions[code].change1m, change3m: r.directions[code].change3m } : undefined,
      centralBank: cb ? { name: cb.name, rate: cb.rate, stance: cb.stance, realRate: cb.realRate, rationale: cb.rationale, latestStatement: cb.statement ? { title: cb.statement.title, publishedAt: cb.statement.publishedAt } : undefined } : undefined,
      policy: c.policy ? { lastChange: c.policy.lastChange, change6mBp: c.policy.cum6m, change12mBp: c.policy.cum12m } : undefined,
      factors: Object.values(c.factors).map((f) => ({ factor: f.label, score: f.available ? f.score : null, weight: f.weight, evidence: f.available ? f.rationale : f.unavailableReason })),
      strongestPositive: c.strongestPositive?.label ?? c.strongestPositive ?? undefined,
      strongestNegative: c.strongestNegative?.label ?? c.strongestNegative ?? undefined,
      imfForecastVintage: r.imfView?.[code]?.vintage,
      whatChanged: r.whatChanged?.[code]?.items?.slice(0, 6).map((i) => i.text),
      trend: r.trends?.[code]?.points?.map((p) => ({ month: p.label, score: p.score })),
    };
  };
  const ageHours = round((Date.now() - new Date(row.createdAt).getTime()) / 3600e3, 1);
  return {
    available: true,
    instrument: r.subject,
    kind: r.kind,
    researchedAt: iso(row.createdAt),
    ageHours,
    verdict: r.verdict,
    sinceLastResearch: r.sinceLastResearch ?? undefined,
    pairDirection: r.kind === 'pair' && r.directions?.[r.subject] ? { label: r.directions[r.subject].label, change1m: r.directions[r.subject].change1m, change3m: r.directions[r.subject].change3m } : undefined,
    pairTrend: r.kind === 'pair' ? r.trends?.[r.subject]?.points?.map((p) => ({ month: p.label, score: p.score })) : undefined,
    currencies: codes.map(cur),
    pairFactors: r.pair?.factors?.map((f) => ({ factor: f.label, favours: f.favors, weight: f.weight })),
    differentials: r.pair?.differentials,
    narrative: r.narrative
      ? {
          bottomLine: r.narrative.bottomLine,
          why: r.narrative.why?.map((w) => w.text),
          favoursBase: r.narrative.relativeView?.favorsBase,
          favoursQuote: r.narrative.relativeView?.favorsQuote,
          biggestRisk: r.narrative.biggestRisk,
        }
      : undefined,
    upcomingCatalysts: r.catalysts?.items
      ?.filter((c) => c.date && new Date(c.date).getTime() >= Date.now() - DAY)
      .slice(0, 8)
      .map((c) => ({ date: c.dateOnly ? c.date.slice(0, 10) : c.date, event: c.event, currency: c.currency, context: c.scenarios?.context })),
    whatCouldChangeThisView: r.invalidation?.map((i) => i.text),
    dataFreshness: r.dataFreshness?.notes?.map((n) => n.text),
    scoreHistoryAcrossRuns: history?.slice(-10).map((h) => ({ at: iso(h.createdAt), score: h.score, condition: h.condition })),
    howToRead: r.kind === 'pair'
      ? 'Relative score 0-100: 50 = evenly matched; 58+ favours the base (first) currency, 42 or less the quote. Confidence = completeness, recency and consistency of evidence, not strength. Fundamentals are context, not a trade signal.'
      : 'Score 0-100 from official data: 60+ STRONG, 40-59 NEUTRAL, under 40 WEAK. Confidence = completeness, recency and consistency of evidence. Fundamentals are context, not a trade signal.',
  };
}

const fn = (name, description, properties = {}, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export const TOOL_DEFINITIONS = [
  // ── The trader's own records ─────────────────────────────────────────────
  fn('get_today_status', "The trader's status today: pre-trade checklist items ticked and still open, risk used on today's losing trades vs their daily loss limit, whether they have journaled today, discipline score, days-within-limit streak, their risk settings, and recent Kotka announcements."),
  fn(
    'get_trader_stats',
    "The trader's behavioural scores (Discipline, Execution, Risk Control, Confidence, Consistency, Psychology, Patience, Institutional Thinking, 0-100), win rate, profit factor, expectancy and identity facts (best/worst session, best strategy, emotion before losses), computed from their logged journal trades.",
  ),
  fn(
    'get_recent_trades',
    "The trader's most recent closed journal trades with market, direction, strategy, session, result, P&L, R, confidence, emotions and their own mistakes/lessons notes. Optional market filter.",
    { limit: { type: 'integer', description: 'How many trades (default 8, max 30).' }, market: { type: 'string', description: 'Only this market, e.g. EURUSD or XAUUSD.' } },
  ),
  fn('get_open_positions', "The trader's currently open logged positions with entry, stop, target and risk."),

  // ── Market Intelligence ──────────────────────────────────────────────────
  fn(
    'get_market_snapshot',
    `End-of-day overview of every market Kotka covers (${SUPPORTED}): last daily close and date, change, 14-day ATR and volatility regime, 20-day range, position vs 20/50-day averages, and whether each market is open now. Plus the next 7 days of official USD/EUR releases. Previous-session closes, not live quotes.`,
  ),
  fn(
    'get_instrument_context',
    'Everything Kotka has on ONE market, as on its market room and Market Intelligence page: end-of-day price structure with 7/30/90-day performance and the last 10 closes, market hours, the Fundamental Research verdict for it, community sentiment and its 7-day history, upcoming events for its currencies, the latest tagged news, and active community trade ideas.',
    { symbol: { type: 'string', description: `One of: ${SUPPORTED}.` } },
    ['symbol'],
  ),
  fn(
    'list_research_coverage',
    "Kotka's latest Fundamental Research for every currency and pair it covers, in one list: score, condition, confidence, 1m/3m direction and when it was researched. Use it to compare or rank currencies (strongest/weakest) or to see what exists before opening one report.",
  ),
  fn(
    'get_fundamental_research',
    'The full latest Fundamental Research report for a currency (EUR) or pair (EURUSD): verdict, confidence, direction, change since last research, monthly score trend, per-currency factor scores with their evidence, central bank rate/stance/latest statement, what changed recently, pair differentials (rates, growth, inflation, fiscal, current account), the written bottom line and reasons, biggest risk, upcoming catalysts, and what would change the view. From official sources (IMF, central banks, statistics offices).',
    { instrument: { type: 'string', description: 'Currency code (USD) or pair (EURUSD / EUR/USD).' } },
    ['instrument'],
  ),
  fn(
    'get_crypto_context',
    'Bitcoin or Ether context from Market Intelligence (they have no issuing economy, so no fundamental score): price structure and performance, CoinGecko market data (market cap, volume, supply, dominance, all-time high), Bitcoin network activity (hash rate, transactions), the US dollar research summary, upcoming US releases, crypto news and community sentiment.',
    { symbol: { type: 'string', description: 'BTCUSD or ETHUSD.' } },
    ['symbol'],
  ),
  fn(
    'get_economic_calendar',
    'Scheduled official releases and central-bank meetings from the Kotka calendar (Fed, ECB, BLS, BEA, Eurostat), with previous/forecast/actual where recorded. Upcoming by default; set includePast for recent results.',
    {
      days: { type: 'integer', description: 'Days ahead (default 7, max 45).' },
      currency: { type: 'string', description: 'Only this currency, e.g. USD or EUR.' },
      highOnly: { type: 'boolean', description: 'Only high-importance events.' },
      includePast: { type: 'boolean', description: 'Also include the last 7 days.' },
    },
  ),
  fn(
    'get_market_news',
    'Recent market news stored in Kotka (wire stories and official Fed/ECB releases), newest first, optionally only for one market or currency.',
    { market: { type: 'string', description: 'A market (EURUSD) or currency (JPY).' }, limit: { type: 'integer', description: 'Default 8, max 20.' } },
  ),
  fn(
    'get_community_view',
    `What Kotka Community traders think about a market: sentiment split (views from the last ${SENTIMENT_WINDOW_DAYS} days) and its trend, discussion activity today, and active trade ideas with their thesis. These are unvetted opinions of other traders, never signals.`,
    { symbol: { type: 'string', description: `One of: ${SUPPORTED}.` } },
    ['symbol'],
  ),
];

// Human-readable line for the chat while a tool runs.
export function toolStatus(name, args = {}) {
  const what = args.symbol || args.instrument || args.market;
  const label = what ? findInstrument(what)?.display ?? String(what).toUpperCase() : null;
  return (
    {
      get_today_status: 'Checking your day',
      get_trader_stats: 'Reading your trading stats',
      get_recent_trades: 'Reading your journal',
      get_open_positions: 'Checking open positions',
      get_market_snapshot: 'Scanning the markets',
      get_instrument_context: `Looking at ${label ?? 'the market'}`,
      list_research_coverage: 'Reading research coverage',
      get_fundamental_research: `Reading ${label ?? ''} research`.replace('  ', ' '),
      get_crypto_context: `Looking at ${label ?? 'crypto'}`,
      get_economic_calendar: 'Checking the calendar',
      get_market_news: 'Reading the news',
      get_community_view: `Checking what traders think${label ? ` of ${label}` : ''}`,
    }[name] ?? 'Looking that up'
  );
}

export async function executeToolCall(name, args, userId) {
  switch (name) {
    case 'get_today_status': {
      const [ctx, day, user] = await Promise.all([
        getUserEntries(userId),
        prisma.checklistDay.findUnique({ where: { userId_date: { userId, date: todayStr() } } }),
        prisma.user.findUnique({ where: { id: userId }, select: { role: true, name: true } }),
      ]);
      const ticked = day?.items ?? {};
      const today = ctx.entries.filter((e) => e.date === todayStr());
      const riskUsed = today.filter((e) => e.result === 'loss').reduce((s, e) => s + e.risk, 0);
      const days = [...new Set(ctx.entries.map((e) => e.date))].sort().reverse();
      let streak = 0;
      for (const d of days) {
        const loss = ctx.entries.filter((e) => e.date === d && e.result === 'loss').reduce((s, e) => s + e.risk, 0);
        if (loss <= ctx.dailyLossLimit) streak += 1;
        else break;
      }
      const { scores } = computeScores(ctx.entries, ctx.defaultRisk);
      const announcements = await announcementsFor(user?.role ?? 'trader', { sinceDays: 14 });
      return {
        date: todayStr(),
        checklist: {
          done: CHECKLIST_ITEMS.filter((i) => ticked[i.id]).map((i) => i.label),
          open: CHECKLIST_ITEMS.filter((i) => !ticked[i.id]).map((i) => i.label),
        },
        riskUsedToday: riskUsed,
        dailyLossLimit: ctx.dailyLossLimit,
        limitReached: riskUsed >= ctx.dailyLossLimit,
        tradesJournaledToday: today.length,
        openPositions: ctx.openPositions.length,
        disciplineScore: scores.find((s) => s.label === 'Discipline')?.value ?? 0,
        daysWithinLossLimitStreak: streak,
        settings: { riskPerTradePct: ctx.defaultRisk, dailyLossLimitR: ctx.dailyLossLimit, baseCurrency: ctx.baseCurrency },
        recentAnnouncements: announcements.slice(0, 3).map((a) => ({ title: a.title, body: a.body, publishedAt: iso(a.publishedAt) })),
      };
    }
    case 'get_trader_stats': {
      const { entries, defaultRisk } = await getUserEntries(userId);
      const { scores, hasData } = computeScores(entries, defaultRisk);
      const analytics = computeAnalytics(entries, defaultRisk);
      return {
        hasData,
        totalTrades: analytics.totalTrades,
        scores,
        identity: computeIdentity(entries),
        winRate: analytics.winRate,
        profitFactor: analytics.profitFactor,
        expectancy: analytics.expectancy,
        avgRR: analytics.avgRR,
      };
    }
    case 'get_recent_trades': {
      const limit = clampInt(args?.limit, 1, 30, 8);
      const market = args?.market ? String(args.market).toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
      const { entries } = await getUserEntries(userId);
      return [...entries]
        .filter((e) => !market || String(e.market).toUpperCase().replace(/[^A-Z0-9]/g, '') === market)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, limit)
        .map((e) => ({
          date: e.date,
          market: e.market,
          direction: e.direction,
          strategy: e.strategy,
          session: e.session,
          result: e.result,
          pnl: e.pnl,
          riskPct: e.risk,
          reward: e.reward,
          confidence: e.confidence,
          emotionBefore: e.emotionBefore,
          emotionAfter: e.emotionAfter,
          checklistComplete: e.checklistComplete,
          mistakes: e.mistakes || undefined,
          lessons: e.lessons || undefined,
        }));
    }
    case 'get_open_positions': {
      const { openPositions } = await getUserEntries(userId);
      return openPositions.map((e) => ({ market: e.market, direction: e.direction, entry: e.entry, stopLoss: e.stopLoss, takeProfit: e.takeProfit, riskPct: e.risk, openedOn: e.date }));
    }

    case 'get_market_snapshot': {
      // Cached bars only (no provider calls), so this never trips the rate limit.
      const [rows, calendar] = await Promise.all([
        Promise.all(INSTRUMENTS.map(async (inst) => ({ inst, d: await instrumentMarketData(inst.symbol, { fetch: false }) }))),
        getOfficialCalendar({ days: 7 }).catch(() => ({ events: [] })),
      ]);
      return {
        note: 'End-of-day data (previous session close), not live quotes. Items not loaded today are marked unavailable.',
        markets: rows.map(({ inst, d }) => {
          const { last10Closes, ...view } = marketView(inst, d); // eslint-disable-line no-unused-vars
          return { ...view, marketHours: marketStatus(inst)?.label };
        }),
        upcomingOfficialReleases: calendar.events.map((e) => ({ date: e.dateOnly ? e.date.slice(0, 10) : e.date, currency: e.currency, title: e.title, importance: e.importance })),
      };
    }
    case 'get_instrument_context': {
      const inst = findInstrument(args?.symbol);
      if (!inst) return { available: false, reason: `Kotka doesn't cover that market. Covered: ${SUPPORTED}.` };
      const [data, research, sentiment, sentHist, events, news, ideas, messages24h] = await Promise.all([
        instrumentMarketData(inst.symbol, { fetch: true }),
        inst.research ? latestReport('pair', inst.research) : null,
        sentimentFor(inst.symbol),
        sentimentHistory(inst.symbol, 7),
        prisma.marketEvent.findMany({ where: { cancelled: false, currency: { in: inst.currencies }, scheduledAt: { gte: new Date(Date.now() - 6 * 3600e3), lte: new Date(Date.now() + 10 * DAY) } }, orderBy: { scheduledAt: 'asc' }, take: 8 }),
        prisma.newsItem.findMany({ where: { instruments: { has: inst.symbol } }, orderBy: { publishedAt: 'desc' }, take: 5 }),
        activeIdeas(inst.symbol, 3),
        prisma.message.count({ where: { conversation: { kind: 'room', instrument: inst.symbol }, deletedAt: null, createdAt: { gte: new Date(Date.now() - DAY) } } }).catch(() => null),
      ]);
      const v = research?.payload?.verdict;
      return {
        symbol: inst.symbol,
        display: inst.display,
        name: inst.name,
        market: inst.market,
        marketHours: marketStatus(inst),
        price: { ...marketView(inst, data), performance: data?.available ? performance(data.history) : undefined },
        fundamentalResearch: research
          ? { verdict: v, researchedAt: iso(research.createdAt), bottomLine: research.payload.narrative?.bottomLine, more: 'Call get_fundamental_research for the full report.' }
          : inst.market === 'Crypto'
            ? { available: false, reason: 'Crypto has no issuing economy, so it has no fundamental score. Call get_crypto_context.' }
            : { available: false, reason: inst.research ? 'Not researched yet.' : `${inst.display} has no Fundamental Research report; its driver is the US dollar (see USD research).` },
        communitySentiment: { ...sentiment, windowDays: SENTIMENT_WINDOW_DAYS, trend: sentHist.slice(-6), note: 'Opinions of Kotka traders, not a signal.' },
        roomMessagesLast24h: messages24h,
        upcomingEvents: events.map(eventView),
        latestNews: news.map(newsView),
        activeTradeIdeas: ideas,
        link: `/app/community/markets/${inst.symbol}`,
      };
    }
    case 'list_research_coverage': {
      const map = await latestReportSummaries();
      const rows = [...map.values()];
      const view = (r) => ({ subject: r.subject, score: r.score, condition: r.condition, confidence: r.confidence, direction: r.direction, researchedAt: iso(r.createdAt) });
      const currencies = rows.filter((r) => r.kind === 'currency').sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map(view);
      const pairs = rows.filter((r) => r.kind === 'pair').sort((a, b) => a.subject.localeCompare(b.subject)).map(view);
      return {
        currenciesStrongestFirst: currencies,
        pairs,
        notResearched: INSTRUMENTS.filter((i) => i.research && !map.has(`pair:${i.research}`)).map((i) => i.symbol),
        howToRead: 'Currency score 0-100 (60+ STRONG, under 40 WEAK). Pair score is relative: 50 even, 58+ favours the base, 42 or less the quote. Direction is the 1-3 month change in score. Context, not a signal.',
      };
    }
    case 'get_fundamental_research': {
      const parsed = parseSubject(args?.instrument);
      if (!parsed) return { available: false, reason: 'Kotka researches these currencies: USD, EUR, GBP, JPY, AUD, CAD, CHF, NZD, and pairs of them.' };
      const [row, history] = await Promise.all([latestReport(parsed.kind, parsed.subject), reportHistory(parsed.kind, parsed.subject, 10)]);
      if (!row) return { available: false, reason: `No research report exists yet for ${parsed.subject}. The trader can generate one in Market Intelligence.` };
      return researchView(row, history);
    }
    case 'get_crypto_context': {
      const inst = findInstrument(args?.symbol);
      if (!inst || !CRYPTO[inst.symbol]) return { available: false, reason: 'Crypto context covers BTCUSD and ETHUSD.' };
      const c = await cryptoContext(inst.symbol);
      const { history, ...market } = c.market ?? {}; // eslint-disable-line no-unused-vars
      const unwrap = (s) => (s ? (s.ok ? { ...s.data, source: s.name, fetchedAt: s.fetchedAt } : { available: false, source: s.name, reason: s.error }) : { available: false, reason: 'Not covered for this asset.' });
      return {
        symbol: c.symbol,
        asset: c.asset,
        note: `${c.asset} is not given a fundamental score: it has no issuing economy. This is the verified context that exists.`,
        price: market,
        marketData: unwrap(c.coin),
        cryptoMarket: unwrap(c.global),
        network: (() => {
          const n = unwrap(c.network);
          const m = n.minutesBetweenBlocks;
          return typeof m === 'number' ? { ...n, blockTimeVsTarget: m < 10 ? `faster than the 10-minute design target (${m} min)` : m > 10 ? `slower than the 10-minute design target (${m} min)` : 'on the 10-minute target', trendNote: 'This is a single snapshot; Kotka has no history for these network figures, so it cannot say whether activity is rising or falling.' } : n;
        })(),
        usDollarResearch: c.dollar,
        upcomingUsHighImportance: c.events,
        news: c.news.map((n) => ({ headline: n.headline, provider: n.provider, publishedAt: iso(n.publishedAt) })),
        communitySentiment: c.sentiment,
      };
    }
    case 'get_economic_calendar': {
      const days = clampInt(args?.days, 1, 45, 7);
      const currency = args?.currency ? String(args.currency).toUpperCase().slice(0, 3) : null;
      const from = args?.includePast ? new Date(Date.now() - 7 * DAY) : new Date(Date.now() - 3 * 3600e3);
      const events = await prisma.marketEvent.findMany({
        where: { cancelled: false, scheduledAt: { gte: from, lte: new Date(Date.now() + days * DAY) }, ...(currency ? { currency } : {}), ...(args?.highOnly ? { importance: 'High' } : {}) },
        orderBy: { scheduledAt: 'asc' },
        take: 40,
      });
      return {
        now: new Date().toISOString(),
        coverage: 'Official schedules for USD (Fed, BLS, BEA) and EUR (ECB, Eurostat). Other economies are not in the calendar yet. Forecasts are only shown where an admin recorded them with a source.',
        events: events.map(eventView),
      };
    }
    case 'get_market_news': {
      const limit = clampInt(args?.limit, 1, 20, 8);
      const key = args?.market ? String(args.market).toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
      const inst = key ? findInstrument(key) : null;
      const where = inst ? { instruments: { has: inst.symbol } } : key && key.length === 3 ? { currencies: { has: key } } : {};
      const news = await prisma.newsItem.findMany({ where, orderBy: { publishedAt: 'desc' }, take: limit });
      return { filter: inst?.symbol ?? key ?? 'all', news: news.map(newsView) };
    }
    case 'get_community_view': {
      const inst = findInstrument(args?.symbol);
      if (!inst) return { available: false, reason: `Kotka doesn't cover that market. Covered: ${SUPPORTED}.` };
      const [sentiment, hist, ideas, messages24h] = await Promise.all([
        sentimentFor(inst.symbol),
        sentimentHistory(inst.symbol, 7),
        activeIdeas(inst.symbol, 6),
        prisma.message.count({ where: { conversation: { kind: 'room', instrument: inst.symbol }, deletedAt: null, createdAt: { gte: new Date(Date.now() - DAY) } } }).catch(() => null),
      ]);
      return {
        symbol: inst.symbol,
        note: 'Unvetted opinions of Kotka traders. Not a signal and not verified by Kotka.',
        sentiment: { ...sentiment, windowDays: SENTIMENT_WINDOW_DAYS, trend: hist },
        roomMessagesLast24h: messages24h,
        activeTradeIdeas: ideas,
        link: `/app/community/markets/${inst.symbol}`,
      };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// Keeps a tool result inside the model's context budget.
export function serializeToolResult(result, max = 14000) {
  const text = JSON.stringify(result);
  if (text.length <= max) return text;
  return JSON.stringify({ truncated: true, note: 'Result shortened to fit; ask for a narrower question if a detail is missing.', data: text.slice(0, max) });
}
