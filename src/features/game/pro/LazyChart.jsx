// The chart library is large, so it loads only when a match chart is on screen.
import { lazy, Suspense } from 'react';

const KotkaChart = lazy(() => import('./KotkaChart'));

export default function LazyChart(props) {
  return (
    <Suspense fallback={<div className="animate-pulse rounded-xl border border-ink-100 bg-ink-50 dark:border-ink-800 dark:bg-ink-900" style={{ height: `clamp(400px, 72vh, ${(props.height ?? 560) + 42}px)` }} />}>
      <KotkaChart {...props} />
    </Suspense>
  );
}
