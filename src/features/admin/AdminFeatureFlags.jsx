import clsx from 'clsx';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { usePersistedState } from '../../lib/usePersistedState';

const defaultFlags = [
  { id: 'f1', name: 'Replay Engine v2', description: 'Improved annotation tools and AI critique depth.', tier: 'Institutional', enabled: true },
  { id: 'f2', name: 'Institutional Chaos difficulty', description: 'Simulator difficulty tier with flash-volatility scenarios.', tier: 'Premium', enabled: true },
  { id: 'f3', name: 'Kotka AI Vision (chart uploads)', description: 'Allow image uploads for AI chart analysis.', tier: 'All', enabled: true },
  { id: 'f4', name: 'Correlation matrix (beta)', description: 'Cross-asset correlation view on Market Intelligence.', tier: 'Premium', enabled: false },
  { id: 'f5', name: 'Multi-account journal sync', description: 'Sync journal entries across multiple broker accounts.', tier: 'Institutional', enabled: false },
];

export default function AdminFeatureFlags() {
  const [flags, setFlags] = usePersistedState('admin.featureFlags', defaultFlags);

  const toggle = (id) => setFlags((prev) => prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)));

  return (
    <div>
      <PageHeader eyebrow="Admin" title="Feature Flags" description="Enable or disable platform features per subscription tier." />
      <Card className="divide-y divide-ink-50 dark:divide-ink-800/60">
        {flags.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{f.name}</p>
                <Badge tone="neutral">{f.tier}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-ink-400">{f.description}</p>
            </div>
            <button
              onClick={() => toggle(f.id)}
              className={clsx('h-6 w-11 shrink-0 rounded-full transition-colors', f.enabled ? 'bg-profit-500' : 'bg-ink-200 dark:bg-ink-700')}
            >
              <span className={clsx('block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform', f.enabled ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
          </div>
        ))}
      </Card>
    </div>
  );
}
