import { useEffect, useState } from 'react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Link } from 'react-router-dom';
import { Activity, BadgeCheck, Cpu, TrendingUp, UserPlus, Users } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import StatTile from '../../components/ui/StatTile';
import { api } from '../../lib/api';
import { CHART_COLORS } from '../../lib/chartColors';
import EmptyState from '../../components/ui/EmptyState';

export default function AdminOverview() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/admin/stats/overview').then(setStats);
  }, []);

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Overview" description="Platform-wide health, growth, and engagement at a glance." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Daily Active Users" value={stats.dau.toLocaleString()} icon={Users} />
        <StatTile label="Monthly Active Users" value={stats.mau.toLocaleString()} icon={TrendingUp} />
        <StatTile label="New sign-ups, 7 days" value={stats.newSignups7d.toLocaleString()} icon={UserPlus} hint={`${stats.totalUsers.toLocaleString()} accounts in total`} />
        <StatTile label="AI Requests Today" value={stats.aiRequestsToday.toLocaleString()} icon={Cpu} />
      </div>

      {stats.pendingKyc ? (
        <Link to="/admin/verifications" className="flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-50 px-5 py-3 text-sm text-amber-800 transition-colors hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/15">
          <BadgeCheck className="h-4 w-4 shrink-0" />
          <span className="flex-1">{stats.pendingKyc} identity verification{stats.pendingKyc === 1 ? '' : 's'} waiting for review</span>
          <span className="font-medium">Review</span>
        </Link>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Daily Active Users" subtitle="Last 14 days" />
          <CardBody>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.dailyActive} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dauFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={CHART_COLORS.grid.light} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART_COLORS.tick.light }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART_COLORS.tick.light }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${CHART_COLORS.grid.light}`, fontSize: 12 }} />
                  <Area type="monotone" dataKey="dau" stroke={CHART_COLORS.accent} strokeWidth={2.5} fill="url(#dauFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Feature Usage" subtitle="Tracked actions, last 30 days" />
          <CardBody className="space-y-3">
            {stats.featureUsage.every((f) => f.count === 0) ? (
              <EmptyState size="inline" icon={Activity} title="No activity yet" description="Sign-ins, trades and AI use will show here as traders use Kotka." />
            ) : (
              (() => {
                const max = Math.max(...stats.featureUsage.map((f) => f.count), 1);
                return stats.featureUsage.map((f) => (
                  <div key={f.feature}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-ink-600 dark:text-ink-300">{f.feature}</span>
                      <span className="font-medium text-ink-400">{f.count.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <div className="h-full rounded-full bg-accent-500" style={{ width: `${(f.count / max) * 100}%` }} />
                    </div>
                  </div>
                ));
              })()
            )}
          </CardBody>
        </Card>
      </div>

    </div>
  );
}
