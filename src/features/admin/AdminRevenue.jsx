import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import StatTile from '../../components/ui/StatTile';
import { revenueByMonth } from '../../lib/mockData';

export default function AdminRevenue() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Revenue" description="Recurring revenue, growth trajectory, and plan mix." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="MRR" value="$35,480" delta="+8.1%" deltaTone="profit" />
        <StatTile label="ARR (run-rate)" value="$425,760" delta="+8.1%" deltaTone="profit" />
        <StatTile label="ARPU" value="$21.40" delta="+1.2%" deltaTone="profit" />
        <StatTile label="Net Revenue Retention" value="108%" delta="+2%" deltaTone="profit" />
      </div>

      <Card>
        <CardHeader title="Monthly Recurring Revenue" subtitle="Last 6 months" />
        <CardBody>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueByMonth} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e6e9ef" strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#a3aabb' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#a3aabb' }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e6e9ef', fontSize: 12 }} formatter={(v) => [`$${v.toLocaleString()}`, 'MRR']} />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#revFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
