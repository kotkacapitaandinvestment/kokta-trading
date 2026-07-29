import { useState } from 'react';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';

export default function LotSizeCalculator() {
  const [balance, setBalance] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [stopPips, setStopPips] = useState(20);
  const [pipValuePerLot, setPipValuePerLot] = useState(10);

  const riskAmount = (balance * riskPct) / 100;
  const lotSize = stopPips > 0 && pipValuePerLot > 0 ? riskAmount / (stopPips * pipValuePerLot) : 0;

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div className="space-y-4">
        <Input label="Account balance ($)" type="number" value={balance} onChange={(e) => setBalance(Number(e.target.value))} />
        <Input label="Risk per trade (%)" type="number" step="0.1" value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} />
        <Input label="Stop loss (pips)" type="number" value={stopPips} onChange={(e) => setStopPips(Number(e.target.value))} />
        <Input
          label="Pip value per standard lot ($)"
          type="number"
          value={pipValuePerLot}
          onChange={(e) => setPipValuePerLot(Number(e.target.value))}
          hint="Typically ~$10 for most USD-quoted majors at 1.0 lot"
        />
      </div>
      <Card className="flex flex-col justify-center bg-ink-50 p-6 text-center dark:bg-ink-800">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Position size</p>
        <p className="mt-2 text-3xl font-semibold text-ink-900 dark:text-ink-50">{lotSize.toFixed(2)} lots</p>
        <p className="mt-1 text-xs text-ink-400">Risking ${riskAmount.toFixed(2)} over {stopPips} pips</p>
      </Card>
    </div>
  );
}
