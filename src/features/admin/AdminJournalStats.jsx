import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import { api } from '../../lib/api';

export default function AdminJournalStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/admin/stats/journal').then(setStats);
  }, []);

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Journal Statistics" description="How consistently the platform's traders are journaling, and what they're logging." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Entries Logged (30d)" value={stats.entriesLogged30d.toLocaleString()} />
        <StatTile label="Entries per Active User" value={stats.entriesPerActiveUser} />
        <StatTile label="Avg Confidence" value={`${stats.avgConfidence}/10`} />
        <StatTile label="Mistakes Logged" value={`${stats.mistakeLoggedRate}%`} hint="of entries note a mistake" />
      </div>
      <Card>
        <CardHeader title="Pre-Trade Emotion Breakdown" subtitle="Last 30 days, across all traders" />
        <CardBody className="space-y-3">
          {stats.emotions.length === 0 ? (
            <p className="text-sm text-ink-400">No journal entries logged yet.</p>
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
