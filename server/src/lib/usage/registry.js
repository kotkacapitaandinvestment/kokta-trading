// What Kotka meters. A feature is what people see (Kotka AI); an action is
// the backend operation that costs something: one model request, one report
// update, one fresh load of a market view. Limits can be set on a feature
// (all its actions together) or on one action ("kotka_ai.chart_analysis").
//
// Actions are fixed here, in code. Routes name their own feature and action;
// nothing a client sends can choose what gets counted.

export const FEATURES = {
  kotka_ai: {
    label: 'Kotka AI',
    unit: ['request', 'requests'],
    provider: 'nvidia',
    actions: {
      chat: 'Chat message',
      chart_analysis: 'Chart reading',
      trade_review: 'Trade review',
      community_summary: 'Community summary',
      community_challenge: 'Challenge a trade idea',
      community_news: 'Explain a news story',
      community_chart: 'Community chart reading',
      community_fact_check: 'Fact-check',
    },
    // Rows copied from the old AI log, which didn't record the action.
    history: { legacy: 'Before per-action tracking' },
  },
  market_intelligence: {
    label: 'Market Intelligence',
    unit: ['view', 'views'],
    actions: {
      market_pulse: 'Prices and volatility',
      economic_calendar: 'Economic calendar',
      crypto_context: 'Crypto overview',
    },
  },
  fundamental_research: {
    label: 'Fundamental Research',
    unit: ['report update', 'report updates'],
    actions: {
      report_update: 'Report update',
    },
  },
};

export const FEATURE_KEYS = Object.keys(FEATURES);

export const isAction = (feature, action) => !!FEATURES[feature]?.actions[action];

// "kotka_ai" or "kotka_ai.chart_analysis" → { feature, action }, or null.
export function parseMeter(meter) {
  if (typeof meter !== 'string') return null;
  const [feature, action, extra] = meter.split('.');
  if (extra !== undefined || !FEATURES[feature]) return null;
  if (action === undefined) return { feature, action: null };
  return isAction(feature, action) ? { feature, action } : null;
}

export const meterOf = (feature, action) => (action ? `${feature}.${action}` : feature);

export function actionLabel(feature, action) {
  const f = FEATURES[feature];
  return f?.actions[action] ?? f?.history?.[action] ?? action;
}

export function meterLabel(meter) {
  const m = parseMeter(meter);
  if (!m) return meter;
  return m.action ? `${FEATURES[m.feature].label}: ${actionLabel(m.feature, m.action)}` : FEATURES[m.feature].label;
}

export const unitWord = (feature, n) => FEATURES[feature].unit[n === 1 ? 0 : 1];
