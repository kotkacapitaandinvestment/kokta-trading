import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';
import { CHART_COLORS } from '../../../lib/chartColors';

export default function WeeklyPerformanceChart({ data }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid.light} strokeDasharray="3 3" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART_COLORS.tick.light }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART_COLORS.tick.light }} />
          <Tooltip
            cursor={{ fill: 'rgba(209,168,91,0.08)' }}
            contentStyle={{ borderRadius: 12, border: `1px solid ${CHART_COLORS.grid.light}`, fontSize: 12 }}
            formatter={(value) => [`$${value}`, 'P&L']}
          />
          <Bar dataKey="pnl" radius={[6, 6, 6, 6]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.pnl >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
