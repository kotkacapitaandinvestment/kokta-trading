import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import AdminTable from './components/AdminTable';
import LoadError from './components/LoadError';
import { api } from '../../lib/api';

const columns = [
  { key: 'market', label: 'Market' },
  { key: 'trades', label: 'Trades logged, last 30 days', render: (r) => r.trades.toLocaleString() },
  { key: 'winRate', label: 'Win rate, all traders', render: (r) => `${r.winRate}%` },
];

export default function AdminTradingStats() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/admin/stats/trading').then(setStats).catch((err) => setError(err.message));
  }, []);

  if (error) return <LoadError message={error} />;
  if (!stats) return <div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Trading Statistics" description="Trades that all traders logged in their journals over the last 30 days, by market." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Trades logged, last 30 days" value={stats.tradesLogged30d.toLocaleString()} />
        <StatTile label="Win rate, all traders" value={`${stats.winRate}%`} />
        <StatTile label="Average reward vs risk" value={stats.avgRR !== null ? `${stats.avgRR}R` : '–'} hint={stats.avgRR === null ? 'No reward-to-risk figures logged yet' : 'What traders made for each 1 they risked (1R = the amount risked)'} />
        <StatTile label="Checklist finished" value={`${stats.checklistRate}%`} hint="Trades where the pre-trade checklist was completed" />
      </div>
      <AdminTable columns={columns} rows={stats.markets} searchKeys={['market']} emptyLabel="No trades logged yet" />
    </div>
  );
}
