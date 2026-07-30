import clsx from 'clsx';
import Card, { CardHeader, CardBody } from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';

function unrealizedPnl(trade, currentPrice) {
  const sign = trade.direction === 'long' ? 1 : -1;
  return (currentPrice - trade.entryPrice) * trade.size * sign;
}

export default function TradeLog({ openTrade, closedTrades, currentPrice, onCloseTrade }) {
  return (
    <Card>
      <CardHeader title="Trade Log" subtitle={`${closedTrades.length} closed this session`} />
      <CardBody className="space-y-3">
        {openTrade ? (
          <div className="rounded-xl border border-accent-200 bg-accent-50 p-3 dark:border-accent-500/30 dark:bg-accent-900/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink-800 dark:text-ink-100">
                  {openTrade.direction === 'long' ? 'Long' : 'Short'} · size {openTrade.size}
                </p>
                <p className="text-xs text-ink-400">Entry {openTrade.entryPrice}</p>
              </div>
              <div className="text-right">
                {currentPrice != null ? (
                  <p className={clsx('text-sm font-medium', unrealizedPnl(openTrade, currentPrice) >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500')}>
                    {unrealizedPnl(openTrade, currentPrice) >= 0 ? '+' : ''}
                    {unrealizedPnl(openTrade, currentPrice).toFixed(2)}
                  </p>
                ) : null}
                <Button variant="secondary" size="sm" className="mt-1.5" onClick={onCloseTrade}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-400">No open trade.</p>
        )}

        {closedTrades.length ? (
          <div className="divide-y divide-ink-50 border-t border-ink-100 pt-2 dark:divide-ink-800/60 dark:border-ink-800">
            {closedTrades
              .slice()
              .reverse()
              .map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100">
                      {t.direction === 'long' ? 'Long' : 'Short'} · size {t.size}
                    </p>
                    <p className="text-xs text-ink-400">
                      {t.entryPrice} → {t.exitPrice} · {t.closeReason?.replace('_', ' ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={clsx('text-sm font-medium', t.pnl >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500')}>
                      {t.pnl >= 0 ? '+' : ''}
                      {t.pnl?.toFixed(2)}
                    </span>
                    <Badge tone={t.result === 'win' ? 'profit' : t.result === 'loss' ? 'loss' : 'neutral'}>{t.result}</Badge>
                  </div>
                </div>
              ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
