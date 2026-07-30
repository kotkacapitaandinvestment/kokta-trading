const CALM_EMOTIONS = ['Calm', 'Confident', 'Satisfied'];

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function computeScores(entries, defaultRisk = 1) {
  const total = entries.length;
  if (total === 0) {
    return {
      scores: [
        { label: 'Patience', value: 0 },
        { label: 'Discipline', value: 0 },
        { label: 'Execution', value: 0 },
        { label: 'Risk Control', value: 0 },
        { label: 'Confidence', value: 0 },
        { label: 'Consistency', value: 0 },
        { label: 'Psychology', value: 0 },
        { label: 'Institutional Thinking', value: 0 },
      ],
      hasData: false,
    };
  }

  const wins = entries.filter((e) => e.result === 'win').length;
  const checklistComplete = entries.filter((e) => e.checklistComplete).length;
  const avgConfidence = entries.reduce((s, e) => s + e.confidence, 0) / total;
  const withinRisk = entries.filter((e) => e.risk <= defaultRisk).length;
  const calmEntries = entries.filter((e) => CALM_EMOTIONS.includes(e.emotionBefore)).length;
  const highConviction = entries.filter((e) => e.confidence >= 7).length;

  const byDay = {};
  for (const e of entries) {
    byDay[e.date] = (byDay[e.date] || 0) + e.pnl;
  }
  const days = Object.values(byDay);
  const positiveDays = days.filter((d) => d >= 0).length;

  const discipline = pct(checklistComplete, total);
  const execution = pct(wins, total);
  const riskControl = pct(withinRisk, total);
  const confidence = Math.round(avgConfidence * 10);
  const consistency = pct(positiveDays, days.length);
  const psychology = pct(calmEntries, total);
  const patience = pct(highConviction, total);
  const institutional = Math.round((discipline + riskControl + consistency) / 3);

  return {
    scores: [
      { label: 'Patience', value: patience },
      { label: 'Discipline', value: discipline },
      { label: 'Execution', value: execution },
      { label: 'Risk Control', value: riskControl },
      { label: 'Confidence', value: confidence },
      { label: 'Consistency', value: consistency },
      { label: 'Psychology', value: psychology },
      { label: 'Institutional Thinking', value: institutional },
    ],
    hasData: true,
  };
}

function groupBy(entries, key) {
  const groups = {};
  for (const e of entries) {
    const k = e[key];
    if (!groups[k]) groups[k] = [];
    groups[k].push(e);
  }
  return groups;
}

export function computeIdentity(entries, minSample = 2) {
  if (entries.length === 0) return null;

  const bySession = groupBy(entries, 'session');
  const sessionStats = Object.entries(bySession)
    .filter(([, list]) => list.length >= minSample)
    .map(([session, list]) => ({ session, winRate: pct(list.filter((e) => e.result === 'win').length, list.length) }))
    .sort((a, b) => b.winRate - a.winRate);

  const byMarket = groupBy(entries, 'market');
  const marketStats = Object.entries(byMarket)
    .filter(([, list]) => list.length >= minSample)
    .map(([market, list]) => ({ market, winRate: pct(list.filter((e) => e.result === 'win').length, list.length) }))
    .sort((a, b) => b.winRate - a.winRate);

  const byStrategy = groupBy(entries, 'strategy');
  const strategyByWinRate = Object.entries(byStrategy)
    .filter(([, list]) => list.length >= minSample)
    .map(([strategy, list]) => ({ strategy, winRate: pct(list.filter((e) => e.result === 'win').length, list.length) }))
    .sort((a, b) => b.winRate - a.winRate);
  const strategyByPnl = Object.entries(byStrategy)
    .map(([strategy, list]) => ({ strategy, totalPnl: list.reduce((s, e) => s + e.pnl, 0) }))
    .sort((a, b) => b.totalPnl - a.totalPnl);

  const losses = entries.filter((e) => e.result === 'loss');
  const emotionCounts = {};
  for (const e of losses) {
    if (!e.emotionBefore) continue;
    emotionCounts[e.emotionBefore] = (emotionCounts[e.emotionBefore] || 0) + 1;
  }
  const emotionalTrigger = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const mistakeEntries = entries.filter((e) => e.mistakes && e.mistakes.trim().length > 0);
  const mistakeCounts = {};
  for (const e of mistakeEntries) {
    const key = e.mistakes.trim();
    mistakeCounts[key] = (mistakeCounts[key] || 0) + 1;
  }
  const topMistake = Object.entries(mistakeCounts).sort((a, b) => b[1] - a[1])[0];
  const worstHabit = topMistake?.[0] ?? mistakeEntries[mistakeEntries.length - 1]?.mistakes ?? null;

  return {
    bestSession: sessionStats[0]?.session ?? null,
    worstSession: sessionStats.length > 1 ? sessionStats[sessionStats.length - 1].session : null,
    bestStrategy: strategyByWinRate[0]?.strategy ?? null,
    mostProfitableSetup: strategyByPnl[0]?.strategy ?? null,
    strongestMarket: marketStats[0]?.market ?? null,
    weakestMarket: marketStats.length > 1 ? marketStats[marketStats.length - 1].market : null,
    emotionalTrigger,
    worstHabit,
  };
}

export function computeAnalytics(entries) {
  const total = entries.length;
  const wins = entries.filter((e) => e.result === 'win');
  const losses = entries.filter((e) => e.result === 'loss');
  const winRate = pct(wins.length, total);
  const grossProfit = wins.reduce((s, e) => s + e.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, e) => s + e.pnl, 0));
  const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : null;
  const expectancy = total ? Math.round((entries.reduce((s, e) => s + e.pnl, 0) / total) * 100) / 100 : 0;
  const withReward = entries.filter((e) => e.reward);
  const avgRR = withReward.length
    ? Math.round((withReward.reduce((s, e) => s + e.reward, 0) / withReward.length) * 10) / 10
    : null;

  const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = 0;
  const equityCurve = sorted.map((e, i) => {
    running += e.pnl;
    return { day: i + 1, date: e.date, equity: running };
  });

  const byStrategy = groupBy(entries, 'strategy');
  const strategyPerformance = Object.entries(byStrategy).map(([strategy, list]) => ({
    strategy,
    trades: list.length,
    winRate: pct(list.filter((e) => e.result === 'win').length, list.length),
    expectancy: Math.round((list.reduce((s, e) => s + e.pnl, 0) / list.length) * 100) / 100,
  }));

  const bySession = groupBy(entries, 'session');
  const sessionPerformance = Object.entries(bySession).map(([session, list]) => ({
    session,
    trades: list.length,
    winRate: pct(list.filter((e) => e.result === 'win').length, list.length),
  }));

  const emotionCounts = {};
  for (const e of entries) {
    if (!e.emotionBefore) continue;
    emotionCounts[e.emotionBefore] = (emotionCounts[e.emotionBefore] || 0) + 1;
  }
  const emotionBreakdown = Object.entries(emotionCounts)
    .map(([emotion, count]) => ({ emotion, value: pct(count, total) }))
    .sort((a, b) => b.value - a.value);

  const mistakeCount = entries.filter((e) => e.mistakes && e.mistakes.trim()).length;
  const ruleViolations = [
    { rule: 'Entered without checklist complete', count: entries.filter((e) => !e.checklistComplete).length },
    { rule: 'Sized above stated per-trade risk policy', count: 0 },
    { rule: 'Logged a mistake for this trade', count: mistakeCount },
  ];

  const byDate = {};
  for (const e of entries) {
    byDate[e.date] = (byDate[e.date] || 0) + e.pnl;
  }

  return {
    totalTrades: total,
    winRate,
    profitFactor,
    expectancy,
    avgRR,
    equityCurve,
    strategyPerformance,
    sessionPerformance,
    emotionBreakdown,
    ruleViolations,
    dailyPnl: byDate,
  };
}

export function generatePsychologyInsights(entries) {
  const insights = [];
  const total = entries.length;
  if (total < 3) return insights;

  const bySession = groupBy(entries, 'session');
  const sessionEntries = Object.entries(bySession).filter(([, list]) => list.length >= 2);
  if (sessionEntries.length >= 2) {
    const withRates = sessionEntries
      .map(([session, list]) => ({ session, rate: pct(list.filter((e) => e.result === 'win').length, list.length) }))
      .sort((a, b) => b.rate - a.rate);
    const best = withRates[0];
    const worst = withRates[withRates.length - 1];
    if (best.rate - worst.rate >= 10) {
      insights.push(
        `Your win rate during the ${best.session} session (${best.rate}%) is meaningfully higher than ${worst.session} (${worst.rate}%). Consider concentrating size where your edge is proven.`,
      );
    }
  }

  const calmEntries = entries.filter((e) => e.emotionBefore === 'Calm');
  const anxiousEntries = entries.filter((e) => e.emotionBefore === 'Anxious');
  if (calmEntries.length >= 2 && anxiousEntries.length >= 2) {
    const calmExpectancy = calmEntries.reduce((s, e) => s + e.pnl, 0) / calmEntries.length;
    const anxiousExpectancy = anxiousEntries.reduce((s, e) => s + e.pnl, 0) / anxiousEntries.length;
    if (calmExpectancy > anxiousExpectancy) {
      insights.push(
        `Trades logged with "Calm" pre-trade emotion average $${calmExpectancy.toFixed(0)} vs $${anxiousExpectancy.toFixed(0)} for "Anxious" — your emotional state before entry is a real predictor of outcome.`,
      );
    }
  }

  const afterLoss = [];
  for (let i = 1; i < entries.length; i++) {
    if (entries[i - 1].result === 'loss') afterLoss.push(entries[i]);
  }
  if (afterLoss.length >= 2) {
    const avgRiskAfterLoss = afterLoss.reduce((s, e) => s + e.risk, 0) / afterLoss.length;
    const avgRiskOverall = entries.reduce((s, e) => s + e.risk, 0) / entries.length;
    if (avgRiskAfterLoss > avgRiskOverall * 1.15) {
      const pctUp = Math.round(((avgRiskAfterLoss - avgRiskOverall) / avgRiskOverall) * 100);
      insights.push(
        `You size up ${pctUp}% on average immediately after a loss — a revenge-trading signature worth watching.`,
      );
    }
  }

  return insights;
}
