import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, Award, Lock, Swords } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { api } from '../../lib/api';
import { naira, pct } from './format';

// A trader's record: how well they trade, not just how often they win.
export default function Profile() {
  const { username } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setData(null);
    (username ? api.get(`/game/traders/${encodeURIComponent(username)}`) : api.get('/game/profile')).then(setData).catch((err) => setError(err.message));
  }, [username]);

  if (error) return <EmptyState icon={Swords} title="We couldn’t find that record" description={error} />;
  if (!data) return <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const p = data.profile;
  const own = !username;
  const span = Math.max(1, p.nextLevelXp - p.thisLevelXp);
  const stats = [
    ['Competitions', p.matches],
    ['Won · lost · drawn', `${p.wins} · ${p.losses} · ${p.draws}`],
    ['Practice matches', p.practice],
    ['Average Kotka Score', p.avgScore ?? '—'],
    ['Average return', pct(p.avgReturnPct)],
    ['Average drawdown', p.avgDrawdownPct != null ? `${p.avgDrawdownPct}%` : '—'],
    ['Risk management', p.avgRisk ?? '—'],
    ['Decision quality', p.avgDecision ?? '—'],
    ['Process (all four)', p.avgProcess ?? '—'],
    ...(own ? [['Staked in total', naira(p.totalStakedKobo)], ['Paid back to you', naira(p.totalWonKobo)]] : []),
  ];
  const have = new Set(p.badges.map((b) => b.key));

  return (
    <div className="space-y-6">
      <Link to="/app/game" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-50"><ArrowLeft className="h-4 w-4" /> Trading Game</Link>
      <PageHeader eyebrow="Trader record" title={own ? 'Your record' : data.trader.name} description={`Level ${p.level} · ${p.xp.toLocaleString()} XP. XP and badges come from playing and learning; they can’t be bought or cashed out.`} />
      <Card>
        <CardBody className="space-y-2">
          <div className="flex justify-between text-xs text-ink-500 dark:text-ink-400">
            <span>Level {p.level}</span>
            <span>{Math.max(0, p.nextLevelXp - p.xp).toLocaleString()} XP to level {p.level + 1}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
            <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.min(100, ((p.xp - p.thisLevelXp) / span) * 100)}%` }} />
          </div>
        </CardBody>
      </Card>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Performance" subtitle="From finished matches. Scores are out of 100." />
          <CardBody>
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
              {stats.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-400">{k}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-ink-900 dark:text-ink-50">{v}</dd>
                </div>
              ))}
            </dl>
            {own && (p.best || p.weakest) ? (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-ink-100 pt-4 dark:border-ink-800">
                {p.best ? <Button as={Link} to={`/app/game/matches/${p.best.matchId}`} size="sm" variant="secondary">Best match ({p.best.score})</Button> : null}
                {p.weakest ? <Button as={Link} to={`/app/game/matches/${p.weakest.matchId}`} size="sm" variant="ghost">Weakest match ({p.weakest.score})</Button> : null}
              </div>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Badges" subtitle={`${p.badges.length} of ${p.allBadges.length}`} />
          <CardBody>
            <ul className="space-y-3">
              {p.allBadges.map((b) => (
                <li key={b.key} className={clsx('flex gap-3', !have.has(b.key) && 'opacity-60')}>
                  <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', have.has(b.key) ? 'bg-accent-500/15 text-accent-600' : 'bg-ink-100 text-ink-400 dark:bg-ink-800')}>{have.has(b.key) ? <Award className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}</span>
                  <span>
                    <span className="block text-sm font-medium text-ink-800 dark:text-ink-100">{b.name}</span>
                    <span className="block text-xs text-ink-400">{b.how}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
