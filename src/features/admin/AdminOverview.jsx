import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Users, DollarSign, Cpu, TrendingUp } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import StatTile from '../../components/ui/StatTile';
import { dauMau, revenueByMonth } from '../../lib/mockData';

const featureUsage = [
  { feature: 'Kotka AI', usage: 92 },
  { feature: 'Journal', usage: 78 },
  { feature: 'Checklist', usage: 64 },
  { feature: 'Analytics', usage: 58 },
  { feature: 'Calculators', usage: 51 },
  { feature: 'Simulator', usage: 34 },
];

export default function AdminOverview() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Overview" description="Platform-wide health, growth, and engagement at a glance." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Daily Active Users" value="1,412" delta="+6.2%" deltaTone="profit" icon={Users} />
        <StatTile label="Monthly Active Users" value="8,904" delta="+3.4%" deltaTone="profit" icon={TrendingUp} />
        <StatTile label="MRR" value="$35,480" delta="+8.1%" deltaTone="profit" icon={DollarSign} />
        <StatTile label="AI Requests Today" value="6,204" delta="+11%" deltaTone="profit" icon={Cpu} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Daily Active Users" subtitle="Last 14 days" />
          <CardBody>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dauMau} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dauFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4a5df0" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#4a5df0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#e6e9ef" strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#a3aabb' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#a3aabb' }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e6e9ef', fontSize: 12 }} />
                  <Area type="monotone" dataKey="dau" stroke="#4a5df0" strokeWidth={2.5} fill="url(#dauFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Most Used Features" />
          <CardBody className="space-y-3">
            {featureUsage.map((f) => (
              <div key={f.feature}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-ink-600 dark:text-ink-300">{f.feature}</span>
                  <span className="font-medium text-ink-400">{f.usage}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div className="h-full rounded-full bg-accent-500" style={{ width: `${f.usage}%` }} />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Revenue Growth" subtitle="Monthly recurring revenue, last 6 months" />
        <CardBody>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByMonth} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e6e9ef" strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#a3aabb' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#a3aabb' }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e6e9ef', fontSize: 12 }} formatter={(v) => [`$${v.toLocaleString()}`, 'Revenue']} />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]} fill="#4a5df0" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
