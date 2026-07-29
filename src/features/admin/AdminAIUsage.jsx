import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import StatTile from '../../components/ui/StatTile';
import AdminTable from './components/AdminTable';
import { aiUsageByModel } from '../../lib/mockData';

const columns = [
  { key: 'model', label: 'Model' },
  { key: 'requests', label: 'Requests (30d)', render: (r) => r.requests.toLocaleString() },
  { key: 'avgCostCents', label: 'Avg cost / request', render: (r) => `$${(r.avgCostCents / 100).toFixed(3)}` },
];

export default function AdminAIUsage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="AI Usage" description="Monitor Kotka AI cost, volume, rate limits, and response quality." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Requests (30d)" value="70,300" delta="+9.4%" deltaTone="profit" />
        <StatTile label="Total AI Cost (30d)" value="$1,842" delta="+6.1%" deltaTone="loss" />
        <StatTile label="Avg Response Time" value="1.8s" delta="-0.2s" deltaTone="profit" />
        <StatTile label="Flagged Responses" value="12" hint="Under manual review" />
      </div>

      <Card>
        <CardHeader title="Requests by Model" />
        <CardBody>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aiUsageByModel} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="#e6e9ef" strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#a3aabb' }} />
                <YAxis type="category" dataKey="model" width={200} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#585f70' }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e6e9ef', fontSize: 12 }} />
                <Bar dataKey="requests" radius={[0, 6, 6, 0]} fill="#4a5df0" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      <AdminTable columns={columns} rows={aiUsageByModel} searchKeys={['model']} exportable={false} />
    </div>
  );
}
