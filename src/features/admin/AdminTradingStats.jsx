import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import AdminTable from './components/AdminTable';
import { api } from '../../lib/api';

const columns = [
  { key: 'market', label: 'Market' },
  { key: 'trades', label: 'Trades logged (30d)', render: (r) => r.trades.toLocaleString() },
  { key: 'winRate', label: 'Platform win rate', render: (r) => `${r.winRate}%` },
];

export default function AdminTradingStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/admin/stats/trading').then(setStats);
  }, []);

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Trading Statistics" description="Aggregate trading activity across all users, by market." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Trades Logged (30d)" value={stats.tradesLogged30d.toLocaleString()} />
        <StatTile label="Platform Win Rate" value={`${stats.winRate}%`} />
        <StatTile label="Avg Risk/Reward" value={stats.avgRR !== null ? `${stats.avgRR}R` : '—'} hint={stats.avgRR === null ? 'No R-multiples logged yet' : undefined} />
        <StatTile label="Checklist Completion" value={`${stats.checklistRate}%`} />
      </div>
      <AdminTable columns={columns} rows={stats.markets} searchKeys={['market']} emptyLabel="No trades logged yet" />
    </div>
  );
}
