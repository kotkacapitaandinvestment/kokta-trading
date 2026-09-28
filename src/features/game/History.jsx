import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, History as HistoryIcon } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { api } from '../../lib/api';
import { naira, pct, OUTCOME_LABEL } from './format';

const TONE = { win: 'profit', loss: 'loss', draw: 'warning', refund: 'neutral', practice: 'accent' };

export default function History() {
  const [page, setPage] = useState({ matches: null, nextCursor: null });
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get('/game/history').then(setPage).catch((err) => setError(err.message));
  }, []);
  const more = () => api.get(`/game/history?cursor=${page.nextCursor}`).then((r) => setPage((p) => ({ matches: [...p.matches, ...r.matches], nextCursor: r.nextCursor })));

  return (
    <div className="space-y-6">
      <Link to="/app/game" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-50"><ArrowLeft className="h-4 w-4" /> Trading Game</Link>
      <PageHeader eyebrow="Trading Game" title="Match history" description="Every finished match, with your score, return and what it paid." />
      {error ? <p className="text-sm text-loss-500">{error}</p> : null}
      {!page.matches ? (
        <div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />
      ) : page.matches.length ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs text-ink-400 dark:border-ink-800">
                  {['Finished', 'Opponent', 'Market', 'Result', 'Score', 'Return', 'Stake', 'Paid to you'].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {page.matches.map((m) => (
                  <tr key={m.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50 dark:border-ink-800/60 dark:hover:bg-ink-800/40">
                    <td className="px-5 py-3 text-xs text-ink-500"><Link to={`/app/game/matches/${m.id}`} className="hover:underline">{m.settledAt ? new Date(m.settledAt).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '—'}</Link></td>
                    <td className="px-5 py-3 text-ink-700 dark:text-ink-200">{m.opponent ? `${m.opponent.name} (${m.opponent.score?.toFixed(1) ?? '—'})` : m.mode === 'practice' ? 'Practice' : '—'}</td>
                    <td className="px-5 py-3 text-ink-600 dark:text-ink-300">{m.scenario}</td>
                    <td className="px-5 py-3"><Badge tone={TONE[m.outcome]}>{OUTCOME_LABEL[m.outcome] ?? m.outcome}</Badge></td>
                    <td className="px-5 py-3 tabular-nums text-ink-800 dark:text-ink-100">{m.score?.toFixed(1) ?? '—'}</td>
                    <td className="px-5 py-3 tabular-nums">{pct(m.returnPct)}</td>
                    <td className="px-5 py-3 tabular-nums text-ink-600 dark:text-ink-300">{m.mode === 'practice' ? '—' : naira(m.stakeKobo)}</td>
                    <td className="px-5 py-3 tabular-nums text-ink-800 dark:text-ink-100">{m.payoutKobo ? naira(m.payoutKobo) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page.nextCursor ? <div className="flex justify-center p-4"><Button variant="secondary" onClick={more}>Show older</Button></div> : null}
        </Card>
      ) : (
        <EmptyState icon={HistoryIcon} title="No finished matches yet" description="Play a practice match or a challenge and it shows up here." action={<Button as={Link} to="/app/game">Play</Button>} />
      )}
    </div>
  );
}
