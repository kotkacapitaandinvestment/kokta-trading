import { useState } from 'react';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';

export default function MarginCalculator() {
  const [units, setUnits] = useState(100000);
  const [price, setPrice] = useState(1.085);
  const [leverage, setLeverage] = useState(30);

  const notional = units * price;
  const margin = leverage > 0 ? notional / leverage : 0;

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div className="space-y-4">
        <Input label="Units / contract size" type="number" value={units} onChange={(e) => setUnits(Number(e.target.value))} />
        <Input label="Price" type="number" step="any" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        <Input label="Leverage (e.g. 30 for 30:1)" type="number" value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} />
      </div>
      <Card className="flex flex-col justify-center gap-3 bg-ink-50 p-6 text-center dark:bg-ink-800">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Notional value</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900 dark:text-ink-50">${notional.toLocaleString()}</p>
        </div>
        <div className="border-t border-ink-200 pt-3 dark:border-ink-700">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Required margin</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900 dark:text-ink-50">${margin.toFixed(2)}</p>
        </div>
      </Card>
    </div>
  );
}
