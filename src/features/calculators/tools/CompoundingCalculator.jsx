import { useMemo, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';
import { CHART_COLORS } from '../../../lib/chartColors';

export default function CompoundingCalculator() {
  const [balance, setBalance] = useState(10000);
  const [monthlyReturn, setMonthlyReturn] = useState(6);
  const [months, setMonths] = useState(12);

  const series = useMemo(() => {
    const rows = [{ month: 0, balance }];
    let bal = balance;
    for (let m = 1; m <= months; m++) {
      bal = bal * (1 + monthlyReturn / 100);
      rows.push({ month: m, balance: Math.round(bal) });
    }
    return rows;
  }, [balance, monthlyReturn, months]);

  const final = series[series.length - 1]?.balance ?? balance;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input label="Starting balance ($)" type="number" value={balance} onChange={(e) => setBalance(Number(e.target.value))} />
        <Input label="Monthly return (%)" type="number" step="0.1" value={monthlyReturn} onChange={(e) => setMonthlyReturn(Number(e.target.value))} />
        <Input label="Months" type="number" value={months} onChange={(e) => setMonths(Number(e.target.value))} />
      </div>

      <Card className="bg-ink-50 p-6 text-center dark:bg-ink-800">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Projected balance after {months} months</p>
        <p className="mt-1 text-3xl font-semibold text-ink-900 dark:text-ink-50">${final.toLocaleString()}</p>
      </Card>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid.light} strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART_COLORS.tick.light }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART_COLORS.tick.light }} />
            <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${CHART_COLORS.grid.light}`, fontSize: 12 }} formatter={(v) => [`$${v.toLocaleString()}`, 'Balance']} />
            <Line type="monotone" dataKey="balance" stroke={CHART_COLORS.accent} strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-ink-400">
        Illustrative only. Consistent monthly returns of this magnitude are rare and compounding assumes no
        withdrawals — treat this as a planning tool, not a projection of guaranteed results.
      </p>
    </div>
  );
}
