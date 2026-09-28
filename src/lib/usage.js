import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { PERIOD_ADJ, periodWord, unitWord, whenItResets } from './usageText';

export { whenItResets, unitWord, periodWord, refusalText, isRefusal } from './usageText';

// Usage limits are counted and enforced by the server; this only shows them.

// One line about a feature's usage when it's worth mentioning: past the
// warning point, or used up. Otherwise null.
export function usageNote(usage) {
  if (!usage || usage.exempt) return null;
  if (usage.paused) return { tone: 'neutral', text: `${usage.label} is temporarily unavailable. Please try again later.` };
  const h = usage.headline;
  if (h && h.remaining === 0) return { tone: 'loss', text: `You’ve reached your ${PERIOD_ADJ[h.period]} ${usage.label} limit. It resets ${whenItResets(h.resetAt)}.` };
  if (usage.status === 'warning' && h) {
    if (h.remaining <= Math.max(1, Math.floor(h.limit * 0.1))) return { tone: 'warning', text: `You have ${h.remaining} ${usage.label} ${unitWord(usage, h.remaining)} left ${periodWord(h.period)}.` };
    return { tone: 'warning', text: `You’ve used ${h.used} of ${h.limit} ${usage.label} ${unitWord(usage, h.limit)} ${periodWord(h.period)}.` };
  }
  return null;
}

// A feature's own action limit that's used up (e.g. chart readings), if any.
export function actionReached(usage, action) {
  const a = usage?.actions?.find((x) => x.action === action);
  return a?.headline && a.headline.remaining === 0 ? a : null;
}

// The signed-in person's usage for one feature, from /api/usage.
export function useFeatureUsage(feature) {
  const [usage, setUsage] = useState(null);
  const refresh = useCallback(() => {
    api
      .get('/usage')
      .then((r) => setUsage(r.features.find((f) => f.feature === feature) ?? null))
      .catch(() => {});
  }, [feature]);
  useEffect(refresh, [refresh]);
  return { usage, refresh };
}

// A fresh key for each attempt, so a double-send isn't counted twice.
export function requestKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
