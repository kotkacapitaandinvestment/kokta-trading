import { useEffect, useState } from 'react';
import { LineChart } from 'lucide-react';
import Card, { CardHeader, CardBody } from '../../../components/ui/Card';
import { api } from '../../../lib/api';

export default function SymbolPicker({ onSelect }) {
  const [symbols, setSymbols] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/simulator/symbols').then((d) => setSymbols(d.symbols)).catch((err) => setError(err.message));
  }, []);

  return (
    <Card>
      <CardHeader title="Choose a market" subtitle="Practice against real historical price action" />
      <CardBody>
        {error ? (
          <p className="text-sm text-loss-500">{error}</p>
        ) : !symbols ? (
          <p className="text-sm text-ink-400">Loading markets…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {symbols.map((s) => (
              <Card key={s.symbol} hover className="cursor-pointer p-6" onClick={() => onSelect(s.symbol)}>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-ink-50 dark:bg-ink-800">
                  <LineChart className="h-5 w-5 text-ink-700 dark:text-ink-200" strokeWidth={1.75} />
                </div>
                <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{s.symbol}</h3>
                <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">{s.market}</p>
              </Card>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
