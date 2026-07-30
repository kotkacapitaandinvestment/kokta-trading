// Central mock/demo data for the Kotka Trading prototype.
// Replace with real API calls once the backend and data warehouse are wired up.

export const watchlist = [
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', price: 1.0842, change: 0.12, market: 'Forex' },
  { symbol: 'XAU/USD', name: 'Gold Spot', price: 2412.3, change: -0.34, market: 'Metals' },
  { symbol: 'US30', name: 'Dow Jones', price: 39872.5, change: 0.45, market: 'Indices' },
  { symbol: 'NAS100', name: 'Nasdaq 100', price: 18342.1, change: 0.78, market: 'Indices' },
  { symbol: 'BTC/USD', name: 'Bitcoin', price: 67230, change: 1.92, market: 'Crypto' },
  { symbol: 'GBP/JPY', name: 'Pound / Yen', price: 198.44, change: -0.21, market: 'Forex' },
];

export const economicEvents = [
  { time: '08:30', currency: 'USD', impact: 'high', title: 'Non-Farm Payrolls', forecast: '185K', previous: '175K' },
  { time: '10:00', currency: 'EUR', impact: 'medium', title: 'ECB President Speech', forecast: '—', previous: '—' },
  { time: '12:30', currency: 'GBP', impact: 'high', title: 'CPI y/y', forecast: '3.2%', previous: '3.4%' },
  { time: '14:00', currency: 'USD', impact: 'medium', title: 'ISM Services PMI', forecast: '52.1', previous: '51.4' },
];

export const recentTrades = [
  { id: 't1', symbol: 'EUR/USD', direction: 'Long', result: 'win', rr: 2.4, pnl: 340, date: '2026-07-28', session: 'London' },
  { id: 't2', symbol: 'XAU/USD', direction: 'Short', result: 'loss', rr: -1, pnl: -180, date: '2026-07-27', session: 'New York' },
  { id: 't3', symbol: 'NAS100', direction: 'Long', result: 'win', rr: 3.1, pnl: 620, date: '2026-07-27', session: 'New York' },
  { id: 't4', symbol: 'GBP/JPY', direction: 'Short', result: 'breakeven', rr: 0, pnl: 0, date: '2026-07-25', session: 'Tokyo' },
  { id: 't5', symbol: 'BTC/USD', direction: 'Long', result: 'win', rr: 1.8, pnl: 260, date: '2026-07-24', session: 'New York' },
];

export const journalEntries = [
  {
    id: 'j1',
    date: '2026-07-28',
    market: 'EUR/USD',
    session: 'London',
    strategy: 'Liquidity Sweep + FVG',
    direction: 'Long',
    entry: 1.0812,
    stopLoss: 1.079,
    takeProfit: 1.0865,
    risk: 1.0,
    reward: 2.4,
    result: 'win',
    pnl: 340,
    emotionBefore: 'Calm',
    emotionAfter: 'Satisfied',
    confidence: 8,
    mistakes: 'None significant',
    lessons: 'Waited for confirmation candle — patience paid off.',
    checklistComplete: true,
    screenshots: [],
  },
  {
    id: 'j2',
    date: '2026-07-27',
    market: 'XAU/USD',
    session: 'New York',
    strategy: 'Order Block Rejection',
    direction: 'Short',
    entry: 2418.4,
    stopLoss: 2424.0,
    takeProfit: 2402.0,
    risk: 1.0,
    reward: -1.0,
    result: 'loss',
    pnl: -180,
    emotionBefore: 'Anxious',
    emotionAfter: 'Frustrated',
    confidence: 5,
    mistakes: 'Entered before full structure confirmation.',
    lessons: 'Wait for the retest, not just the reaction.',
    checklistComplete: false,
    screenshots: [],
  },
  {
    id: 'j3',
    date: '2026-07-27',
    market: 'NAS100',
    session: 'New York',
    strategy: 'Break of Structure',
    direction: 'Long',
    entry: 18120,
    stopLoss: 18040,
    takeProfit: 18360,
    risk: 1.0,
    reward: 3.1,
    result: 'win',
    pnl: 620,
    emotionBefore: 'Confident',
    emotionAfter: 'Calm',
    confidence: 9,
    mistakes: 'None',
    lessons: 'Letting winners run to target continues to outperform early exits.',
    checklistComplete: true,
    screenshots: [],
  },
];

export const weeklyPerformance = [
  { day: 'Mon', pnl: 220 },
  { day: 'Tue', pnl: -90 },
  { day: 'Wed', pnl: 340 },
  { day: 'Thu', pnl: 120 },
  { day: 'Fri', pnl: -40 },
  { day: 'Sat', pnl: 0 },
  { day: 'Sun', pnl: 0 },
];

export const equityCurve = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  equity: 10000 + i * 85 + Math.sin(i / 3) * 220 - (i % 7 === 0 ? 180 : 0),
}));

export const strategyPerformance = [
  { strategy: 'Liquidity Sweep', winRate: 68, trades: 42, expectancy: 1.4 },
  { strategy: 'Order Block', winRate: 54, trades: 31, expectancy: 0.6 },
  { strategy: 'Break of Structure', winRate: 71, trades: 28, expectancy: 1.9 },
  { strategy: 'Fair Value Gap', winRate: 61, trades: 22, expectancy: 1.1 },
];

export const sessionPerformance = [
  { session: 'Tokyo', winRate: 48, trades: 18 },
  { session: 'London', winRate: 63, trades: 46 },
  { session: 'New York', winRate: 66, trades: 52 },
];

export const emotionBreakdown = [
  { emotion: 'Calm', value: 38 },
  { emotion: 'Confident', value: 26 },
  { emotion: 'Anxious', value: 18 },
  { emotion: 'Frustrated', value: 11 },
  { emotion: 'Fearful', value: 7 },
];

export const traderDNA = {
  scores: [
    { label: 'Patience', value: 78 },
    { label: 'Discipline', value: 84 },
    { label: 'Execution', value: 71 },
    { label: 'Risk Control', value: 88 },
    { label: 'Confidence', value: 66 },
    { label: 'Consistency', value: 73 },
    { label: 'Psychology', value: 69 },
    { label: 'Institutional Thinking', value: 75 },
  ],
  bestSession: 'New York',
  worstSession: 'Tokyo',
  bestStrategy: 'Break of Structure',
  worstHabit: 'Entering before full confirmation',
  emotionalTrigger: 'Revenge trading after a stop-out',
  mostProfitableSetup: 'Liquidity sweep into FVG continuation',
  weakestMarket: 'GBP/JPY',
  strongestMarket: 'EUR/USD',
};

export const psychologyInsights = [
  'You take 34% larger position sizes after a losing trade — a classic revenge-trading signature. Consider a mandatory cooldown after any stop-out.',
  'Your win rate during the London session (63%) is 15 points higher than Tokyo (48%). Consider concentrating size where your edge is proven.',
  'Trades logged with "Calm" pre-trade emotion have a 2.1x higher expectancy than those logged "Anxious".',
];

export const weeklyGoals = [
  { id: 'g1', label: 'Complete pre-trade checklist on 100% of entries', progress: 80 },
  { id: 'g2', label: 'Keep max daily loss under 2R', progress: 100 },
  { id: 'g3', label: 'Journal every trade within 1 hour of close', progress: 60 },
];

export const marketSentiment = {
  overall: 62, // 0-100 bullish scale
  breakdown: [
    { market: 'EUR/USD', sentiment: 55 },
    { market: 'XAU/USD', sentiment: 71 },
    { market: 'US Indices', sentiment: 64 },
    { market: 'BTC/USD', sentiment: 58 },
  ],
};

export const notifications = [
  { id: 'n1', type: 'checklist', title: 'Checklist reminder', body: 'You have not completed today\'s pre-trade checklist.', time: '08:05', read: false },
  { id: 'n2', type: 'risk', title: 'Risk warning', body: 'You are approaching your daily loss limit (1.6R used of 2R).', time: 'Yesterday', read: false },
  { id: 'n3', type: 'journal', title: 'Journal reminder', body: 'Log your NAS100 trade from this morning before it leaves memory.', time: 'Yesterday', read: true },
  { id: 'n4', type: 'review', title: 'Weekly review ready', body: 'Your week 30 performance report is ready to view.', time: '2 days ago', read: true },
  { id: 'n5', type: 'ai', title: 'Kotka AI insight', body: 'New psychology insight generated from your last 10 trades.', time: '3 days ago', read: true },
];

export const adminUsers = [
  { id: 'u1', name: 'Alex Morgan', email: 'alex.morgan@example.com', role: 'premium', plan: 'Institutional', status: 'active', joined: '2024-11-02', lastActive: '2026-07-29' },
  { id: 'u2', name: 'Priya Sharma', email: 'priya.sharma@example.com', role: 'trader', plan: 'Free', status: 'active', joined: '2025-02-14', lastActive: '2026-07-28' },
  { id: 'u3', name: 'Marcus Lee', email: 'marcus.lee@example.com', role: 'premium', plan: 'Pro', status: 'active', joined: '2025-01-09', lastActive: '2026-07-27' },
  { id: 'u4', name: 'Sofia Novak', email: 'sofia.novak@example.com', role: 'trader', plan: 'Free', status: 'suspended', joined: '2025-05-30', lastActive: '2026-06-11' },
  { id: 'u5', name: 'James Okafor', email: 'james.okafor@example.com', role: 'admin', plan: 'Institutional', status: 'active', joined: '2024-08-19', lastActive: '2026-07-29' },
  { id: 'u6', name: 'Yuki Tanaka', email: 'yuki.tanaka@example.com', role: 'premium', plan: 'Pro', status: 'active', joined: '2025-03-22', lastActive: '2026-07-26' },
  { id: 'u7', name: 'Liam O\'Brien', email: 'liam.obrien@example.com', role: 'trader', plan: 'Free', status: 'banned', joined: '2025-06-01', lastActive: '2026-05-02' },
];

export const adminSubscriptions = [
  { id: 's1', user: 'Alex Morgan', plan: 'Institutional', amount: 199, status: 'active', renews: '2026-08-15', method: 'Visa •• 4242' },
  { id: 's2', user: 'Marcus Lee', plan: 'Pro', amount: 49, status: 'active', renews: '2026-08-02', method: 'Mastercard •• 1881' },
  { id: 's3', user: 'Yuki Tanaka', plan: 'Pro', amount: 49, status: 'trialing', renews: '2026-08-05', method: 'Visa •• 7710' },
  { id: 's4', user: 'Sofia Novak', plan: 'Free', amount: 0, status: 'suspended', renews: '—', method: '—' },
];

export const supportTickets = [
  { id: 'tk1', user: 'Priya Sharma', subject: 'AI not loading chart uploads', priority: 'high', status: 'open', updated: '2026-07-29' },
  { id: 'tk2', user: 'Marcus Lee', subject: 'Billing question on annual plan', priority: 'medium', status: 'pending', updated: '2026-07-28' },
  { id: 'tk3', user: 'Sofia Novak', subject: 'Account suspended, requesting review', priority: 'high', status: 'open', updated: '2026-07-27' },
  { id: 'tk4', user: 'Liam O\'Brien', subject: 'Refund request', priority: 'low', status: 'closed', updated: '2026-07-20' },
];

export const auditLogs = [
  { id: 'a1', actor: 'James Okafor', action: 'Suspended user Sofia Novak', time: '2026-07-27 14:02' },
  { id: 'a2', actor: 'System', action: 'Feature flag "replay-engine-v2" enabled for Institutional tier', time: '2026-07-26 09:11' },
  { id: 'a3', actor: 'James Okafor', action: 'Issued refund to Liam O\'Brien ($49.00)', time: '2026-07-24 16:40' },
  { id: 'a4', actor: 'System', action: 'Nightly analytics rollup completed (4m12s)', time: '2026-07-24 02:00' },
];

export const announcements = [
  { id: 'an1', title: 'Trader DNA v2 is live', audience: 'All users', published: '2026-07-20', status: 'published' },
  { id: 'an2', title: 'Scheduled maintenance — Aug 3, 02:00 UTC', audience: 'All users', published: '2026-07-28', status: 'scheduled' },
  { id: 'an3', title: 'New Institutional Chaos simulator difficulty', audience: 'Premium', published: '2026-07-15', status: 'published' },
];

export const revenueByMonth = [
  { month: 'Feb', revenue: 18400 },
  { month: 'Mar', revenue: 21200 },
  { month: 'Apr', revenue: 24800 },
  { month: 'May', revenue: 27650 },
  { month: 'Jun', revenue: 31200 },
  { month: 'Jul', revenue: 35480 },
];

export const dauMau = Array.from({ length: 14 }, (_, i) => ({
  day: `D${i + 1}`,
  dau: 1200 + Math.round(Math.sin(i / 2) * 150 + i * 15),
}));

export const aiUsageByModel = [
  { model: 'Kotka Reasoning (default)', requests: 48210, avgCostCents: 1.8 },
  { model: 'Kotka Vision (chart analysis)', requests: 12980, avgCostCents: 4.2 },
  { model: 'Kotka Coaching (psychology)', requests: 9110, avgCostCents: 2.6 },
];
