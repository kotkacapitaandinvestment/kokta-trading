// The Trading Arena: find someone to trade against. Quick Match, traders
// who are ready now, open challenges, your matches, and what's happening.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Swords, Zap, ShieldAlert, Users, Radio, Activity, Wallet, CandlestickChart, Trophy, ArrowRight } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { api } from '../../lib/api';
import { confirmDialog, toast } from '../../lib/dialogs';
import { useAuth } from '../../context/AuthContext';
import ChallengeDialog, { MoneySummary } from './ChallengeDialog';
import GameNav from './GameNav';
import QuickMatch from './arena/QuickMatch';
import ReadyToTrade from './arena/ReadyToTrade';
import OpenChallenges from './arena/OpenChallenges';
import { RecentResults, FeaturedTraders } from './arena/ArenaFeed';
import { naira, minutes, STATUS_LABEL, SUBSCORES, stakeWords } from './format';
import { startPractice } from './pairs';

function MatchRow({ m, meId, onChanged }) {
  const navigate = useNavigate();
  const invitedMe = m.status === 'WAITING_FOR_OPPONENT' && m.invited?.id === meId && m.creator?.id !== meId;
  const other = m.creator?.id === meId ? m.invited : m.creator;
  const decline = async () => {
    if (!(await confirmDialog({ title: 'Decline this challenge?', message: `${m.creator?.name}’s stake goes back to them.`, confirmLabel: 'Decline' }))) return;
    try {
      await api.post(`/game/matches/${m.id}/cancel`);
      onChanged();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-800 dark:text-ink-100">
          {m.mode === 'practice' ? 'Practice match' : invitedMe ? `${m.creator?.name} challenged you` : other ? `You vs ${other.name}` : 'Open challenge'}
        </p>
        <p className="text-xs text-ink-400">
          {m.pair?.symbol ? `${m.pair.symbol} · ` : ''}{m.mode === 'practice' ? 'No stake' : `${naira(m.stakeKobo)} each · winner gets ${naira(m.prizeKobo)}`} · {minutes(m.durationSec)} · {STATUS_LABEL[m.status]}
        </p>
      </div>
      <div className="flex gap-2">
        {invitedMe ? <Button size="sm" variant="ghost" onClick={decline}>Decline</Button> : null}
        <Button size="sm" variant={m.status === 'ACTIVE' || invitedMe || m.status === 'READY' ? 'primary' : 'secondary'} onClick={() => navigate(`/app/game/matches/${m.id}`)}>
          {invitedMe ? 'Review' : m.status === 'ACTIVE' ? 'Rejoin' : m.status === 'READY' ? 'Go to lobby' : 'Open'}
        </Button>
      </div>
    </li>
  );
}

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white px-4 py-3 dark:border-ink-800 dark:bg-ink-900">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-400"><Icon className="h-3.5 w-3.5" /> {label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">{value}</p>
      {hint ? <p className="text-[11px] text-ink-400">{hint}</p> : null}
    </div>
  );
}

export default function GameHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const load = useCallback(() => api.get('/game/home').then(setData).catch((err) => setError(err.message)), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  if (error && !data) return <EmptyState icon={ShieldAlert} title="The Trading Arena didn’t load" description={error} />;
  if (!data) return <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const { rules, wallet, arena } = data;
  const verified = data.identityVerified;

  const practice = (symbol = null) => startPractice(navigate, symbol).catch((err) => toast(err.message, { tone: 'error' }));
  const join = async (m) => {
    if (!verified) return toast('Verify your identity to play for a stake.', { tone: 'error' });
    const ok = await confirmDialog({
      title: `Accept ${m.creator?.name}’s challenge?`,
      message: [...stakeWords({ stakeKobo: m.stakeKobo, startingCapital: m.startingCapital, feeBps: m.feeBps }), `The winner receives ${naira(m.prizeKobo)} (the pool of ${naira(m.poolKobo)} less the fee). A draw pays ${naira(m.drawEachKobo)} each.`, 'Your stake is held from now until the match ends. You must be 18 or older, and you can lose your stake.'].join('\n'),
      confirmLabel: `Stake ${naira(m.stakeKobo)} and accept`,
    });
    if (!ok) return;
    try {
      await api.post(`/game/matches/${m.id}/join`);
      navigate(`/app/game/matches/${m.id}`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
      load();
    }
  };
  const cancelOpen = async (m) => {
    if (!(await confirmDialog({ title: 'Cancel your open challenge?', message: `Your ${naira(m.stakeKobo)} stake goes back to your available balance.`, confirmLabel: 'Cancel challenge' }))) return;
    try {
      await api.post(`/game/matches/${m.id}/cancel`);
      load();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <GameNav />
      <PageHeader
        eyebrow="Kotka Trading"
        title="Trading Arena"
        description="Test your trading decisions against another trader in the same synthetic market. Same candles, same clock, different decisions."
        actions={<Button variant="secondary" icon={Swords} onClick={() => setDialog({})} disabled={!verified || !rules.matchesEnabled}>Post a challenge</Button>}
      />

      {!verified ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Competitions with a stake need your identity to be verified, and you must be 18 or older. Practice matches are free and open now. <Link to="/verify" className="font-medium underline">Check verification</Link></span>
        </div>
      ) : null}
      {!rules.matchesEnabled ? <p className="rounded-xl border border-ink-200 p-3 text-sm text-ink-600 dark:border-ink-700 dark:text-ink-300">Competitions are paused right now. Practice still works.</p> : null}

      {/* Phones: one line, so Quick Match stays near the top. */}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-ink-100 bg-white px-4 py-2.5 text-xs text-ink-600 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300 md:hidden">
        <span className="font-semibold tabular-nums text-ink-900 dark:text-ink-50">{naira(wallet.availableKobo)} available</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-profit-500" />{arena.stats.online} online</span>
        <span>{arena.stats.looking} looking</span>
        <span>{arena.stats.activeMatches} live</span>
      </p>
      <div className="hidden grid-cols-5 gap-3 md:grid">
        <Stat icon={Wallet} label="Available credits" value={naira(wallet.availableKobo)} hint="1 credit = ₦1" />
        <Stat icon={Wallet} label="Wallet balance" value={naira(wallet.totalKobo)} hint={wallet.lockedKobo ? `${naira(wallet.lockedKobo)} in matches` : 'Nothing locked'} />
        <Stat icon={Radio} label="Traders online" value={arena.stats.online} hint="In the last 2 minutes" />
        <Stat icon={Users} label="Looking for a match" value={arena.stats.looking} hint={`${arena.stats.ready} ready · ${arena.stats.searching} searching`} />
        <Stat icon={Activity} label="Active matches" value={arena.stats.activeMatches} hint="Competitions live now" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Quick Match" subtitle="Choose a stake and a length. Kotka pairs you with the first trader on the same terms." action={<Zap className="h-4 w-4 text-accent-500" />} />
          <CardBody>
            <QuickMatch rules={rules} wallet={wallet} verified={verified} queue={arena.me.queue} looking={arena.stats.looking} onChanged={load} />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Ready to Trade" />
          <CardBody>
            <ReadyToTrade me={arena.me} traders={arena.readyTraders} count={arena.stats.ready} verified={verified && rules.matchesEnabled} onChallenge={(person) => setDialog({ opponent: person })} onChanged={load} />
          </CardBody>
        </Card>
      </div>

      {data.mine.length ? (
        <Card>
          <CardHeader title="Your matches" subtitle="Challenges you’ve sent or received, lobbies, and matches in progress." />
          <CardBody>
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {data.mine.map((m) => (
                <MatchRow key={m.id} m={m} meId={user?.id} onChanged={load} />
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Open challenges" subtitle="Posted by traders looking for an opponent. Joining holds the same stake from your balance." action={<Button size="sm" variant="ghost" icon={Swords} onClick={() => setDialog({})} disabled={!verified || !rules.matchesEnabled}>Post one</Button>} />
        <CardBody>
          <OpenChallenges rows={arena.board} available={wallet.availableKobo} verified={verified && rules.matchesEnabled} onJoin={join} onCancel={cancelOpen} />
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent results" subtitle="Decided by the Kotka Performance Score, not profit alone." />
          <CardBody>
            <RecentResults rows={arena.recentResults} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Leading traders this week" subtitle="Average Kotka Score, three competitions or more." action={<Button as={Link} to="/app/game/leaderboard" size="sm" variant="ghost" iconRight={ArrowRight}>Leaderboard</Button>} />
          <CardBody>
            <FeaturedTraders rows={arena.featured} />
          </CardBody>
        </Card>
      </div>

      {data.pairs?.length ? (
        <Card>
          <CardHeader title="Practise for free" subtitle="Kotka pairs are synthetic markets made by Kotka. They don’t follow any real price, so nobody can look the answer up. Practice has no stake." action={<CandlestickChart className="h-4 w-4 text-ink-300" />} />
          <CardBody className="space-y-4">
            <Button variant="secondary" onClick={() => practice()}>Practise on a random pair</Button>
            {[...new Set(data.pairs.map((p) => p.category))].map((c) => (
              <div key={c}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{c}</p>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {data.pairs.filter((p) => p.category === c).map((p) => (
                    <li key={p.symbol} className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 px-3 py-2 dark:border-ink-800">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink-900 dark:text-ink-50">{p.symbol}</span>
                        <span className="block truncate text-xs text-ink-400">{p.name}</span>
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => practice(p.symbol)}>Practise</Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="How the winner is decided" subtitle="The Kotka Performance Score, out of 100. Profit alone doesn’t win." action={<Trophy className="h-4 w-4 text-ink-300" />} />
        <CardBody className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ul className="space-y-2 text-sm">
            {SUBSCORES.map(([k, label]) => (
              <li key={k} className="flex items-center justify-between gap-3">
                <span className="text-ink-600 dark:text-ink-300">{label}</span>
                <Badge tone="neutral">{rules.weights[k]}%</Badge>
              </li>
            ))}
          </ul>
          <MoneySummary stakeKobo={rules.minStakeKobo} rules={rules} />
        </CardBody>
      </Card>

      {dialog ? <ChallengeDialog open onClose={() => setDialog(null)} rules={rules} pairs={data.pairs ?? []} available={wallet.availableKobo} presetOpponent={dialog.opponent ?? null} onCreated={(id) => navigate(`/app/game/matches/${id}`)} /> : null}
    </div>
  );
}
