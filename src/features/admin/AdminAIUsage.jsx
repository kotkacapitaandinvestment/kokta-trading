import { useEffect, useState } from 'react';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import StatTile from '../../components/ui/StatTile';
import AdminTable from './components/AdminTable';
import { api } from '../../lib/api';

const columns = [
  { key: 'model', label: 'Model' },
  { key: 'requests', label: 'Requests (30d)', render: (r) => r.requests.toLocaleString() },
  { key: 'avgLatencyMs', label: 'Avg latency', render: (r) => `${r.avgLatencyMs}ms` },
];

export default function AdminAIUsage() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/admin/stats/ai-usage').then(setStats);
  }, []);

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="AI Usage" description="Monitor Kotka AI volume, latency, and how often it falls back to the scripted mentor." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Requests (30d)" value={stats.totalRequests30d.toLocaleString()} />
        <StatTile label="Requests Today" value={stats.requestsToday.toLocaleString()} />
        <StatTile label="Avg Response Time" value={`${(stats.avgLatencyMs / 1000).toFixed(2)}s`} />
        <StatTile label="Live (NVIDIA) Share" value={`${stats.liveSharePct}%`} hint="vs. scripted fallback" />
      </div>

      <Card>
        <CardHeader title="Requests by Model" subtitle="Last 30 days" />
        <CardBody>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.models} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
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

      <AdminTable columns={columns} rows={stats.models} searchKeys={['model']} exportable={false} emptyLabel="No AI requests logged yet" />
    </div>
  );
}
