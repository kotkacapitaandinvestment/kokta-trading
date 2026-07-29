import { CheckCircle2, AlertTriangle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import StatTile from '../../components/ui/StatTile';
import Badge from '../../components/ui/Badge';

const services = [
  { name: 'API Gateway', status: 'operational', latency: '82ms' },
  { name: 'Kotka AI Inference', status: 'operational', latency: '640ms' },
  { name: 'Journal & Analytics DB', status: 'operational', latency: '24ms' },
  { name: 'Authentication', status: 'operational', latency: '61ms' },
  { name: 'Market Data Feed', status: 'degraded', latency: '1.2s' },
  { name: 'Notification Service', status: 'operational', latency: '110ms' },
];

export default function AdminSystemHealth() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="System Health" description="Live status, latency, and error rates across core platform services." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Uptime (30d)" value="99.97%" delta="+0.02%" deltaTone="profit" />
        <StatTile label="Avg API Latency" value="88ms" delta="-6ms" deltaTone="profit" />
        <StatTile label="Error Rate" value="0.04%" delta="-0.01%" deltaTone="profit" />
        <StatTile label="Incidents (30d)" value="1" hint="Market data feed degradation" />
      </div>

      <Card>
        <CardHeader title="Service Status" />
        <CardBody className="divide-y divide-ink-50 dark:divide-ink-800/60">
          {services.map((s) => (
            <div key={s.name} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2.5">
                {s.status === 'operational' ? (
                  <CheckCircle2 className="h-4 w-4 text-profit-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
                <span className="text-sm font-medium text-ink-800 dark:text-ink-100">{s.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-ink-400">{s.latency}</span>
                <Badge tone={s.status === 'operational' ? 'profit' : 'warning'}>{s.status}</Badge>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
