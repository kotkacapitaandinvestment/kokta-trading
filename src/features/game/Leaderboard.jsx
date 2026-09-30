// The leaderboard: ranked by average Kotka Performance Score in competitions
// (how people trade, not how much they won).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Trophy } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody } from '../../components/ui/Card';
import Tabs from '../../components/ui/Tabs';
import EmptyState from '../../components/ui/EmptyState';
import { Avatar } from '../community/components/Identity';
import { api } from '../../lib/api';
import GameNav from './GameNav';
import { pct } from './format';

const PERIODS = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];

export default function Leaderboard() {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setData(null);
    api.get(`/game/leaderboard?period=${period}`).then(setData).catch((err) => setError(err.message));
  }, [period]);

  return (
    <div className="space-y-6">
      <GameNav />
      <PageHeader eyebrow="Kotka Trading" title="Leaderboard" description="Ranked by average Kotka Performance Score in competitions: risk, decisions, execution and consistency as well as the result. Money won doesn’t decide the rank." />
      <div className="w-fit"><Tabs tabs={PERIODS} active={period} onChange={setPeriod} /></div>
      {error ? (
        <EmptyState icon={Trophy} title="The leaderboard didn’t load" description={error} />
      ) : !data ? (
        <div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />
      ) : !data.rows.length ? (
        <EmptyState icon={Trophy} title="Nobody on the board yet" description={`Traders appear here after ${data.minMatches} competitions in the period. Play a few and your name shows up.`} action={<Link to="/app/game" className="text-sm font-medium text-accent-700 underline dark:text-accent-300">Go to the Trading Arena</Link>} />
      ) : (
        <Card>
          <CardBody className="p-0">
            {data.you ? <p className="border-b border-ink-100 px-5 py-3 text-sm text-ink-600 dark:border-ink-800 dark:text-ink-300">You’re <span className="font-semibold text-ink-900 dark:text-ink-50">number {data.you.rank}</span> with an average score of {data.you.avgScore}.</p> : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wide text-ink-400 dark:border-ink-800">
                    {['Rank', 'Trader', 'Average score', 'Competitions', 'Won · drawn · lost', 'Average return'].map((h) => <th key={h} className="px-5 py-2.5 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                  {data.rows.map((r) => (
                    <tr key={r.person.id} className={clsx(data.you?.person.id === r.person.id && 'bg-accent-500/5')}>
                      <td className={clsx('px-5 py-3 font-semibold tabular-nums', r.rank <= 3 ? 'text-accent-600 dark:text-accent-400' : 'text-ink-500')}>{r.rank}</td>
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2.5">
                          <Avatar user={r.person} size={30} />
                          <span className="min-w-0">
                            {r.person.username ? <Link to={`/app/game/traders/${r.person.username}`} className="block truncate font-medium text-ink-800 hover:underline dark:text-ink-100">{r.person.name}</Link> : <span className="block truncate font-medium text-ink-800 dark:text-ink-100">{r.person.name}</span>}
                            <span className="block text-xs text-ink-400">Level {r.level}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-5 py-3 text-base font-semibold tabular-nums text-ink-900 dark:text-ink-50">{r.avgScore}</td>
                      <td className="px-5 py-3 tabular-nums text-ink-600 dark:text-ink-300">{r.matches}</td>
                      <td className="px-5 py-3 tabular-nums text-ink-600 dark:text-ink-300">{r.wins} · {r.draws} · {r.losses}</td>
                      <td className="px-5 py-3 tabular-nums text-ink-600 dark:text-ink-300">{pct(r.avgReturnPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
