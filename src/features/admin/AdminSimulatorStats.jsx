import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import AdminTable from './components/AdminTable';
import { api } from '../../lib/api';

const columns = [
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'sessions', label: 'Sessions (30d)', render: (r) => r.sessions.toLocaleString() },
  { key: 'avgScore', label: 'Avg overall score', render: (r) => `${r.avgScore}/100` },
];

export default function AdminSimulatorStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/admin/stats/simulator').then(setStats);
  }, []);

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Simulator Statistics" description="Engagement and scoring distribution across simulator difficulty levels." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Sessions (30d)" value={stats.sessions30d.toLocaleString()} />
        <StatTile label="Avg Score" value={`${stats.avgScore}/100`} />
        <StatTile label="Most Played" value={stats.mostPlayed ?? '—'} />
      </div>
      <AdminTable
        columns={columns}
        rows={stats.difficulties}
        searchKeys={['difficulty']}
        emptyLabel="No simulator sessions logged yet"
      />
    </div>
  );
}
