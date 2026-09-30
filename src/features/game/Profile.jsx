import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Award, Lock, Swords, Dna } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { Avatar } from '../community/components/Identity';
import { api } from '../../lib/api';
import { toast } from '../../lib/dialogs';
import { useAuth } from '../../context/AuthContext';
import GameNav from './GameNav';
import ChallengeDialog from './ChallengeDialog';
import { DnaCard } from './Learn';
import { naira, pct, minutes, OUTCOME_LABEL } from './format';

const OUTCOME_TONE = { win: 'text-profit-600 dark:text-profit-400', loss: 'text-loss-500', draw: 'text-ink-600 dark:text-ink-300' };

// A trader's record: how well they trade, not just how often they win.
export default function Profile() {
  const { username } = useParams();
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [challenge, setChallenge] = useState(null);
  useEffect(() => {
    setData(null);
    setError(null);
    const load = username
      ? api.get(`/game/traders/${encodeURIComponent(username)}`)
      : Promise.all([api.get('/game/profile'), api.get('/game/learn')]).then(([pr, learn]) => ({ profile: pr.profile, dna: learn.dna, trader: { ...me, self: true } }));
    load.then(setData).catch((err) => setError(err.message));
  }, [username, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Challenging needs the current rules and your balance.
  const openChallenge = async () => {
    try {
      const home = await api.get('/game/home');
      if (!home.identityVerified) return toast('Verify your identity to play for a stake.', { tone: 'error' });
      setChallenge(home);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  if (error) return <EmptyState icon={Swords} title="We couldn’t find that record" description={error} />;
  if (!data) return <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const p = data.profile;
  const own = !username || data.trader?.self;
  const t = data.trader ?? {};
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
      <GameNav />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="relative">
            <Avatar user={t} size={64} />
            {!own && t.online ? <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full bg-profit-500 ring-2 ring-white dark:ring-ink-900" title="In the Arena now" /> : null}
          </span>
          <div>
            <PageHeader eyebrow="Trader profile" title={own ? `${t.name ?? 'You'} (you)` : t.name} description={`${t.username ? `@${t.username} · ` : ''}Level ${p.level} · ${p.xp.toLocaleString()} XP${!own && t.ready ? ' · Ready to trade now' : !own && t.online ? ' · In the Arena now' : ''}`} />
          </div>
        </div>
        {!own ? <Button icon={Swords} onClick={openChallenge}>Challenge trader</Button> : null}
      </div>
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

      <Card>
        <CardHeader title="Trader DNA" subtitle={own ? 'How you trade, from the decisions you’ve made.' : 'How they trade, from the decisions they’ve made.'} action={<Dna className="h-4 w-4 text-ink-300" />} />
        <CardBody>
          <DnaCard dna={data.dna} own={own} />
        </CardBody>
      </Card>

      {!own ? (
        <Card>
          <CardHeader title="Recent competitions" subtitle="Results and scores only; stakes and winnings stay private." />
          <CardBody>
            {data.recent?.length ? (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {data.recent.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className={clsx('font-semibold', OUTCOME_TONE[r.outcome])}>{OUTCOME_LABEL[r.outcome]}</span>
                      <span className="text-ink-600 dark:text-ink-300"> {r.opponent ? `against ${r.opponent.person?.name ?? 'a trader'}` : ''}</span>
                      <span className="block text-xs text-ink-400">{r.pair ?? 'Kotka market'}{r.market ? ` · ${r.market}` : ''} · {minutes(r.durationSec)} · {new Date(r.settledAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="block font-semibold text-ink-900 dark:text-ink-50">{r.score?.toFixed(1)}{r.opponent ? <span className="font-normal text-ink-400"> vs {r.opponent.score?.toFixed(1)}</span> : null}</span>
                      <span className="block text-xs text-ink-400">{pct(r.returnPct)} return</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState size="inline" icon={Swords} title="No competitions yet" description="Results show here after their first competition." />
            )}
          </CardBody>
        </Card>
      ) : (
        <p className="text-sm text-ink-500 dark:text-ink-400"><Link to="/app/game/history" className="font-medium text-accent-700 underline dark:text-accent-300">See all your matches</Link>, with replays and reports.</p>
      )}

      {challenge ? <ChallengeDialog open onClose={() => setChallenge(null)} rules={challenge.rules} pairs={challenge.pairs ?? []} available={challenge.wallet.availableKobo} presetOpponent={{ id: t.id, name: t.name, username: t.username }} onCreated={(id) => navigate(`/app/game/matches/${id}`)} /> : null}
    </div>
  );
}
