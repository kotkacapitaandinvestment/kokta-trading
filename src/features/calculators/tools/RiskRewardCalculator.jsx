import { useState } from 'react';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';

export default function RiskRewardCalculator() {
  const [entry, setEntry] = useState(1.085);
  const [stopLoss, setStopLoss] = useState(1.08);
  const [takeProfit, setTakeProfit] = useState(1.098);

  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  const rr = risk > 0 ? reward / risk : 0;
  const impliedWinRate = rr > 0 ? (1 / (1 + rr)) * 100 : 0;

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div className="space-y-4">
        <Input label="Entry price" type="number" step="any" value={entry} onChange={(e) => setEntry(Number(e.target.value))} />
        <Input label="Stop loss" type="number" step="any" value={stopLoss} onChange={(e) => setStopLoss(Number(e.target.value))} />
        <Input label="Take profit" type="number" step="any" value={takeProfit} onChange={(e) => setTakeProfit(Number(e.target.value))} />
      </div>
      <Card className="flex flex-col items-center justify-center gap-2 bg-ink-50 p-6 text-center dark:bg-ink-800">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Risk : Reward</p>
        <p className="text-3xl font-semibold text-ink-900 dark:text-ink-50">1 : {rr.toFixed(2)}</p>
        <Badge tone={rr >= 2 ? 'profit' : rr >= 1 ? 'warning' : 'loss'}>
          Breakeven win rate needed: {impliedWinRate.toFixed(1)}%
        </Badge>
      </Card>
    </div>
  );
}
