import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';

export default function WeeklyPerformanceChart({ data }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e6e9ef" strokeDasharray="3 3" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#a3aabb' }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#a3aabb' }} />
          <Tooltip
            cursor={{ fill: 'rgba(74,93,240,0.06)' }}
            contentStyle={{ borderRadius: 12, border: '1px solid #e6e9ef', fontSize: 12 }}
            formatter={(value) => [`$${value}`, 'P&L']}
          />
          <Bar dataKey="pnl" radius={[6, 6, 6, 6]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
