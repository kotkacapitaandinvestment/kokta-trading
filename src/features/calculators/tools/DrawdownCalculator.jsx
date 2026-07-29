import { useState } from 'react';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';

export default function DrawdownCalculator() {
  const [balance, setBalance] = useState(10000);
  const [drawdownPct, setDrawdownPct] = useState(20);

  const remaining = balance * (1 - drawdownPct / 100);
  const lost = balance - remaining;
  const requiredGainPct = remaining > 0 ? (lost / remaining) * 100 : Infinity;

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div className="space-y-4">
        <Input label="Account balance ($)" type="number" value={balance} onChange={(e) => setBalance(Number(e.target.value))} />
        <Input label="Drawdown (%)" type="number" step="0.1" value={drawdownPct} onChange={(e) => setDrawdownPct(Number(e.target.value))} />
      </div>
      <Card className="flex flex-col justify-center gap-3 bg-ink-50 p-6 text-center dark:bg-ink-800">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Balance after drawdown</p>
          <p className="mt-1 text-2xl font-semibold text-loss-500">${remaining.toFixed(2)}</p>
        </div>
        <div className="border-t border-ink-200 pt-3 dark:border-ink-700">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Gain required to recover</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900 dark:text-ink-50">
            {Number.isFinite(requiredGainPct) ? `${requiredGainPct.toFixed(1)}%` : '—'}
          </p>
        </div>
      </Card>
    </div>
  );
}
