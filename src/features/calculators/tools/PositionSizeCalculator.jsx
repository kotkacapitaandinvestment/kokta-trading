import { useState } from 'react';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';

export default function PositionSizeCalculator() {
  const [balance, setBalance] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState(100);
  const [stopLoss, setStopLoss] = useState(98);

  const riskAmount = (balance * riskPct) / 100;
  const perUnitRisk = Math.abs(entry - stopLoss);
  const units = perUnitRisk > 0 ? riskAmount / perUnitRisk : 0;
  const notional = units * entry;

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div className="space-y-4">
        <Input label="Account balance ($)" type="number" value={balance} onChange={(e) => setBalance(Number(e.target.value))} />
        <Input label="Risk per trade (%)" type="number" step="0.1" value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} />
        <Input label="Entry price" type="number" step="any" value={entry} onChange={(e) => setEntry(Number(e.target.value))} />
        <Input label="Stop loss price" type="number" step="any" value={stopLoss} onChange={(e) => setStopLoss(Number(e.target.value))} />
      </div>
      <Card className="flex flex-col justify-center gap-3 bg-ink-50 p-6 text-center dark:bg-ink-800">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Position size (units)</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900 dark:text-ink-50">{units.toFixed(2)}</p>
        </div>
        <div className="border-t border-ink-200 pt-3 dark:border-ink-700">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Notional value</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900 dark:text-ink-50">${notional.toFixed(2)}</p>
        </div>
      </Card>
    </div>
  );
}
