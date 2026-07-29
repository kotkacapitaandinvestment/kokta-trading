import { useState } from 'react';
import Input, { Select } from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';

const lotPresets = { Standard: 1, Mini: 0.1, Micro: 0.01 };

export default function PipCalculator() {
  const [lotType, setLotType] = useState('Standard');
  const [lots, setLots] = useState(1);
  const [pipValuePerStandardLot, setPipValuePerStandardLot] = useState(10);
  const [pips, setPips] = useState(20);

  const effectiveLots = lots * lotPresets[lotType];
  const pipValue = effectiveLots * pipValuePerStandardLot;
  const total = pipValue * pips;

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div className="space-y-4">
        <Select label="Lot type" value={lotType} onChange={(e) => setLotType(e.target.value)}>
          {Object.keys(lotPresets).map((k) => <option key={k}>{k}</option>)}
        </Select>
        <Input label="Number of lots" type="number" step="any" value={lots} onChange={(e) => setLots(Number(e.target.value))} />
        <Input
          label="Pip value per standard lot ($)"
          type="number"
          value={pipValuePerStandardLot}
          onChange={(e) => setPipValuePerStandardLot(Number(e.target.value))}
        />
        <Input label="Number of pips" type="number" value={pips} onChange={(e) => setPips(Number(e.target.value))} />
      </div>
      <Card className="flex flex-col justify-center gap-3 bg-ink-50 p-6 text-center dark:bg-ink-800">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Value per pip</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900 dark:text-ink-50">${pipValue.toFixed(2)}</p>
        </div>
        <div className="border-t border-ink-200 pt-3 dark:border-ink-700">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Total for {pips} pips</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900 dark:text-ink-50">${total.toFixed(2)}</p>
        </div>
      </Card>
    </div>
  );
}
