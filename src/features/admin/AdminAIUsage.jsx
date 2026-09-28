import { useEffect, useState } from 'react';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import StatTile from '../../components/ui/StatTile';
import AdminTable from './components/AdminTable';
import LoadError from './components/LoadError';
import { api } from '../../lib/api';
import { CHART_COLORS } from '../../lib/chartColors';
import { modelName } from '../../lib/aiModelNames';

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

const columns = [
  { key: 'name', label: 'AI model', render: (r) => <span title={r.model}>{r.name}</span> },
  { key: 'requests', label: 'Messages, last 30 days', render: (r) => r.requests.toLocaleString() },
  { key: 'avgLatencyMs', label: 'Average reply time', csv: (r) => seconds(r.avgLatencyMs), render: (r) => seconds(r.avgLatencyMs) },
];

export default function AdminAIUsage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/admin/stats/ai-usage').then(setStats).catch((err) => setError(err.message));
  }, []);

  if (error) return <LoadError message={error} />;
  if (!stats) return <div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  // Rows keep the full model ID (shown on hover) and a readable name.
  const models = stats.models.map((m) => ({ ...m, name: m.model.includes('/') ? modelName(m.model) : m.model }));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="AI Usage" description="How much traders use Kotka AI, how fast it replies, and how often it couldn’t answer." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Messages, last 30 days" value={stats.totalRequests30d.toLocaleString()} />
        <StatTile label="Messages today" value={stats.requestsToday.toLocaleString()} />
        <StatTile label="Average reply time" value={seconds(stats.avgLatencyMs)} />
        <StatTile label="Answered" value={`${stats.liveSharePct}%`} hint="Share of messages Kotka AI replied to" />
      </div>

      <Card>
        <CardHeader title="Messages by AI model" subtitle="Last 30 days" />
        <CardBody>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={models} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={CHART_COLORS.grid.light} strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 12, fill: CHART_COLORS.tick.light }} />
                <YAxis type="category" dataKey="name" width={200} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART_COLORS.tick.light }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${CHART_COLORS.grid.light}`, fontSize: 12 }} />
                <Bar dataKey="requests" name="Messages" radius={[0, 6, 6, 0]} fill={CHART_COLORS.accent} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      <AdminTable columns={columns} rows={models} searchKeys={['name', 'model']} exportable={false} emptyLabel="No Kotka AI messages yet" />
    </div>
  );
}
