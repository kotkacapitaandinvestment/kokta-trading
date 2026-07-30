import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import AdminTable from './components/AdminTable';
import { api } from '../../lib/api';

const columns = [
  { key: 'symbol', label: 'Symbol' },
  { key: 'sessions', label: 'Sessions (30d)', render: (r) => r.sessions.toLocaleString() },
  { key: 'trades', label: 'Trades', render: (r) => r.trades.toLocaleString() },
  { key: 'winRate', label: 'Win rate', render: (r) => `${r.winRate}%` },
  { key: 'avgPnl', label: 'Avg P&L', render: (r) => `${r.avgPnl >= 0 ? '+' : ''}${r.avgPnl.toFixed(2)}` },
];

export default function AdminSimulatorStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/admin/stats/simulator').then(setStats);
  }, []);

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Simulator Statistics" description="Real practice-trading engagement and performance across symbols." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Sessions (30d)" value={stats.sessions30d.toLocaleString()} />
        <StatTile label="Avg Win Rate" value={`${stats.avgWinRate}%`} />
        <StatTile label="Most Traded Symbol" value={stats.mostTradedSymbol ?? '—'} />
        <StatTile label="Total Simulated P&L" value={`${stats.totalSimulatedPnl30d >= 0 ? '+' : ''}${stats.totalSimulatedPnl30d.toFixed(2)}`} />
      </div>
      <AdminTable
        columns={columns}
        rows={stats.bySymbol}
        searchKeys={['symbol']}
        emptyLabel="No simulator sessions logged yet"
      />
    </div>
  );
}
