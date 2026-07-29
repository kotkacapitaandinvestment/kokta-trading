import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import AdminTable from './components/AdminTable';

const endpoints = [
  { id: 'e1', endpoint: '/v1/ai/chat', calls: 48210, p95: '920ms', errorRate: '0.06%' },
  { id: 'e2', endpoint: '/v1/journal/entries', calls: 28110, p95: '140ms', errorRate: '0.02%' },
  { id: 'e3', endpoint: '/v1/market/quotes', calls: 96400, p95: '65ms', errorRate: '0.11%' },
  { id: 'e4', endpoint: '/v1/analytics/summary', calls: 19230, p95: '210ms', errorRate: '0.01%' },
];

const columns = [
  { key: 'endpoint', label: 'Endpoint' },
  { key: 'calls', label: 'Calls (30d)', render: (r) => r.calls.toLocaleString() },
  { key: 'p95', label: 'p95 latency' },
  { key: 'errorRate', label: 'Error rate' },
];

export default function AdminApiUsage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="API Usage" description="Request volume, latency, and error rates by endpoint." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total API Calls (30d)" value="1.94M" delta="+8.9%" deltaTone="profit" />
        <StatTile label="Avg p95 Latency" value="184ms" delta="-12ms" deltaTone="profit" />
        <StatTile label="Rate Limit Hits" value="342" delta="-5%" deltaTone="profit" />
        <StatTile label="Overall Error Rate" value="0.05%" />
      </div>
      <AdminTable columns={columns} rows={endpoints} searchKeys={['endpoint']} />
    </div>
  );
}
