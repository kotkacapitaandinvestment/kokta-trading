import { NotebookPen } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import { api } from '../../lib/api';
import EmptyState from '../../components/ui/EmptyState';
import LoadError from './components/LoadError';

export default function AdminJournalStats() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/admin/stats/journal').then(setStats).catch((err) => setError(err.message));
  }, []);

  if (error) return <LoadError message={error} />;
  if (!stats) return <div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Journal Statistics" description="How often traders write in their journals, and what they note down." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Entries, last 30 days" value={stats.entriesLogged30d.toLocaleString()} />
        <StatTile label="Entries per journaling trader" value={stats.entriesPerActiveUser} />
        <StatTile label="Average confidence" value={`${stats.avgConfidence}/10`} hint="How sure traders felt before the trade, 1 to 10" />
        <StatTile label="Entries noting a mistake" value={`${stats.mistakeLoggedRate}%`} />
      </div>
      <Card>
        <CardHeader title="How traders felt before trading" subtitle="Last 30 days, all traders" />
        <CardBody className="space-y-3">
          {stats.emotions.length === 0 ? (
            <EmptyState size="inline" icon={NotebookPen} title="No journal entries yet" description="This fills in once traders start logging trades in their journals." />
          ) : (
            stats.emotions.map((e) => (
              <div key={e.emotion}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-ink-600 dark:text-ink-300">{e.emotion}</span>
                  <span className="font-medium text-ink-400">{e.pct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div className="h-full rounded-full bg-accent-500" style={{ width: `${e.pct}%` }} />
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
