import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import AdminTable from './components/AdminTable';

const bySymbol = [
  { id: 'sym1', symbol: 'EUR/USD', trades: 12480, winRate: '61%', avgRR: '1.7R' },
  { id: 'sym2', symbol: 'XAU/USD', trades: 9820, winRate: '58%', avgRR: '1.9R' },
  { id: 'sym3', symbol: 'NAS100', trades: 7410, winRate: '63%', avgRR: '2.1R' },
  { id: 'sym4', symbol: 'BTC/USD', trades: 5230, winRate: '54%', avgRR: '1.5R' },
];

const columns = [
  { key: 'symbol', label: 'Market' },
  { key: 'trades', label: 'Trades logged (30d)', render: (r) => r.trades.toLocaleString() },
  { key: 'winRate', label: 'Platform win rate' },
  { key: 'avgRR', label: 'Avg risk/reward' },
];

export default function AdminTradingStats() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Trading Statistics" description="Aggregate trading activity across all users, by market." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Trades Logged (30d)" value="34,940" delta="+7.8%" deltaTone="profit" />
        <StatTile label="Platform Win Rate" value="59%" delta="+1.1%" deltaTone="profit" />
        <StatTile label="Avg Risk/Reward" value="1.8R" delta="+0.1R" deltaTone="profit" />
        <StatTile label="Checklist Completion" value="71%" delta="+3%" deltaTone="profit" />
      </div>
      <AdminTable columns={columns} rows={bySymbol} searchKeys={['symbol']} />
    </div>
  );
}
