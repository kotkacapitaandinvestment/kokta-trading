import { useState } from 'react';
import Input, { Select } from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';

export default function ProfitCalculator() {
  const [direction, setDirection] = useState('Long');
  const [units, setUnits] = useState(1000);
  const [entry, setEntry] = useState(100);
  const [exit, setExit] = useState(103);

  const diff = direction === 'Long' ? exit - entry : entry - exit;
  const profit = diff * units;

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div className="space-y-4">
        <Select label="Direction" value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option>Long</option>
          <option>Short</option>
        </Select>
        <Input label="Units / shares / contracts" type="number" value={units} onChange={(e) => setUnits(Number(e.target.value))} />
        <Input label="Entry price" type="number" step="any" value={entry} onChange={(e) => setEntry(Number(e.target.value))} />
        <Input label="Exit price" type="number" step="any" value={exit} onChange={(e) => setExit(Number(e.target.value))} />
      </div>
      <Card className="flex flex-col justify-center bg-ink-50 p-6 text-center dark:bg-ink-800">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Estimated P&L</p>
        <p className={`mt-2 text-3xl font-semibold ${profit >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500'}`}>
          {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
        </p>
        <p className="mt-1 text-xs text-ink-400">{direction} {units} units, {entry} → {exit}</p>
      </Card>
    </div>
  );
}
