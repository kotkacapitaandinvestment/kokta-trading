import clsx from 'clsx';
import { RotateCcw } from 'lucide-react';
import Card, { CardHeader, CardBody } from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';

export default function SessionSummary({ session, trades, onNewSession }) {
  const closed = trades.filter((t) => t.status === 'closed');
  const wins = closed.filter((t) => t.result === 'win').length;
  const winRate = closed.length ? Math.round((wins / closed.length) * 100) : 0;
  const returnPct = ((session.balance - session.startingBalance) / session.startingBalance) * 100;

  return (
    <Card>
      <CardHeader
        title="Session complete"
        subtitle={session.symbol}
        action={
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onNewSession}>
            New session
          </Button>
        }
      />
      <CardBody className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Starting balance</p>
            <p className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">${session.startingBalance.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Ending balance</p>
            <p className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">${session.balance.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Return</p>
            <p className={clsx('mt-1 text-lg font-semibold', returnPct >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500')}>
              {returnPct >= 0 ? '+' : ''}
              {returnPct.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Win rate</p>
            <p className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">{winRate}%</p>
          </div>
        </div>

        {closed.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800">
                  <th className="pb-2 font-medium">Direction</th>
                  <th className="pb-2 font-medium">Entry</th>
                  <th className="pb-2 font-medium">Exit</th>
                  <th className="pb-2 font-medium">Reason</th>
                  <th className="pb-2 text-right font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((t) => (
                  <tr key={t.id} className="border-b border-ink-50 last:border-0 dark:border-ink-800/60">
                    <td className="py-2.5 text-ink-700 dark:text-ink-200">{t.direction}</td>
                    <td className="py-2.5 text-ink-500 dark:text-ink-400">{t.entryPrice}</td>
                    <td className="py-2.5 text-ink-500 dark:text-ink-400">{t.exitPrice}</td>
                    <td className="py-2.5 text-ink-500 dark:text-ink-400">{t.closeReason?.replace('_', ' ')}</td>
                    <td className="py-2.5 text-right font-medium">
                      <span className={t.pnl >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500'}>
                        {t.pnl >= 0 ? '+' : ''}
                        {t.pnl?.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-400">No trades were placed this session.</p>
        )}

        <Badge tone={returnPct >= 0 ? 'profit' : 'loss'}>{returnPct >= 0 ? 'Profitable session' : 'Losing session'}</Badge>
      </CardBody>
    </Card>
  );
}
