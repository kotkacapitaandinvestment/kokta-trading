import { useState } from 'react';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';

export default function RiskCalculator() {
  const [balance, setBalance] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);

  const riskAmount = (balance * riskPct) / 100;

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div className="space-y-4">
        <Input label="Account balance ($)" type="number" value={balance} onChange={(e) => setBalance(Number(e.target.value))} />
        <Input label="Risk per trade (%)" type="number" step="0.1" value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} />
      </div>
      <Card className="flex flex-col justify-center bg-ink-50 p-6 text-center dark:bg-ink-800">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Maximum risk this trade</p>
        <p className="mt-2 text-3xl font-semibold text-ink-900 dark:text-ink-50">${riskAmount.toFixed(2)}</p>
        <p className="mt-1 text-xs text-ink-400">{riskPct}% of ${balance.toLocaleString()}</p>
      </Card>
    </div>
  );
}
