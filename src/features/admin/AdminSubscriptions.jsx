import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import StatTile from '../../components/ui/StatTile';
import AdminTable from './components/AdminTable';
import { adminSubscriptions } from '../../lib/mockData';

const statusTone = { active: 'profit', trialing: 'accent', suspended: 'warning' };

const columns = [
  { key: 'user', label: 'User' },
  { key: 'plan', label: 'Plan' },
  { key: 'amount', label: 'Amount', render: (r) => `$${r.amount}/mo` },
  { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone[r.status]}>{r.status}</Badge> },
  { key: 'renews', label: 'Renews' },
  { key: 'method', label: 'Payment method' },
];

export default function AdminSubscriptions() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Subscriptions" description="Plans, billing status, coupons, and payment methods across all users." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Free" value="4,120" />
        <StatTile label="Pro" value="3,940" delta="+2.1%" deltaTone="profit" />
        <StatTile label="Institutional" value="844" delta="+4.6%" deltaTone="profit" />
        <StatTile label="Churn (30d)" value="2.4%" delta="-0.3%" deltaTone="profit" />
      </div>
      <AdminTable columns={columns} rows={adminSubscriptions} searchKeys={['user', 'plan', 'status']} />
    </div>
  );
}
