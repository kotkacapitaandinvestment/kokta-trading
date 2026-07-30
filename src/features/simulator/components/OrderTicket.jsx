import { useState } from 'react';
import clsx from 'clsx';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Card, { CardHeader, CardBody } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';

export default function OrderTicket({ currentPrice, disabled, onSubmit }) {
  const [direction, setDirection] = useState('long');
  const [size, setSize] = useState('1');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!(Number(size) > 0)) return;
    onSubmit({
      direction,
      size: Number(size),
      stopLoss: stopLoss ? Number(stopLoss) : null,
      takeProfit: takeProfit ? Number(takeProfit) : null,
    });
    setStopLoss('');
    setTakeProfit('');
  };

  return (
    <Card>
      <CardHeader title="Place a trade" subtitle={currentPrice != null ? `Current price: ${currentPrice}` : undefined} />
      <CardBody className="space-y-4">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setDirection('long')}
              className={clsx(
                'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                direction === 'long'
                  ? 'border-profit-500 bg-profit-50 text-profit-700 dark:bg-profit-500/10 dark:text-profit-400'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800',
              )}
            >
              <ArrowUpRight className="h-4 w-4" /> Long
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setDirection('short')}
              className={clsx(
                'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                direction === 'short'
                  ? 'border-loss-500 bg-loss-50 text-loss-600 dark:bg-loss-500/10 dark:text-loss-400'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800',
              )}
            >
              <ArrowDownRight className="h-4 w-4" /> Short
            </button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500 dark:text-ink-400">Size</label>
            <input
              type="number"
              name="size"
              step="any"
              min="0"
              disabled={disabled}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 disabled:opacity-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500 dark:text-ink-400">Stop loss</label>
              <input
                type="number"
                name="stopLoss"
                step="any"
                disabled={disabled}
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 disabled:opacity-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500 dark:text-ink-400">Take profit</label>
              <input
                type="number"
                name="takeProfit"
                step="any"
                disabled={disabled}
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 disabled:opacity-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50"
              />
            </div>
          </div>

          <Button type="submit" disabled={disabled} className="w-full">
            {disabled ? 'Trade already open' : `Open ${direction === 'long' ? 'long' : 'short'}`}
          </Button>
        </form>

        <p className="text-xs leading-relaxed text-ink-400">
          Simplified P&L model — position size is an abstract unit, not broker-accurate lots or pip value.
        </p>
      </CardBody>
    </Card>
  );
}
