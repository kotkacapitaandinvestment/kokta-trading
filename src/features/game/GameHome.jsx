import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Swords, Wallet, GraduationCap, Trophy, ShieldAlert, ArrowRight, History } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { api } from '../../lib/api';
import { confirmDialog, toast } from '../../lib/dialogs';
import { useAuth } from '../../context/AuthContext';
import ChallengeDialog, { MoneySummary } from './ChallengeDialog';
import { naira, minutes, STATUS_LABEL, SUBSCORES } from './format';

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
          {m.mode === 'practice' ? 'No stake' : `${naira(m.stakeKobo)} each · winner gets ${naira(m.prizeKobo)}`} · {minutes(m.durationSec)} · {STATUS_LABEL[m.status]}
        </p>
      </div>
      <div className="flex gap-2">
        {invitedMe ? <Button size="sm" variant="ghost" onClick={decline}>Decline</Button> : null}
        <Button size="sm" variant={m.status === 'ACTIVE' || invitedMe ? 'primary' : 'secondary'} onClick={() => navigate(`/app/game/matches/${m.id}`)}>
          {invitedMe ? 'Review' : m.status === 'ACTIVE' ? 'Rejoin' : 'Open'}
        </Button>
      </div>
    </li>
  );
}

export default function GameHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(false);
  const load = useCallback(() => api.get('/game/home').then(setData).catch((err) => setError(err.message)), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <EmptyState icon={ShieldAlert} title="The Trading Game didn’t load" description={error} />;
  if (!data) return <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const { rules, wallet, profile } = data;

  const practice = async () => {
    try {
      const r = await api.post('/game/matches', { mode: 'practice' });
      navigate(`/app/game/matches/${r.match.id}`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const join = async (m) => {
    if (!data.identityVerified) return toast('Verify your identity to play for a stake.', { tone: 'error' });
    const ok = await confirmDialog({
      title: `Accept ${m.creator?.name}’s challenge?`,
      message: `${naira(m.stakeKobo)} is locked from your balance now. Winner gets ${naira(m.prizeKobo)} (the pool of ${naira(m.poolKobo)} less Kotka’s ${m.feeBps / 100}% fee). A draw pays ${naira(m.drawEachKobo)} each. You must be 18 or older, and you can lose your stake.`,
      confirmLabel: `Lock ${naira(m.stakeKobo)} and accept`,
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

  const levelSpan = Math.max(1, profile.nextLevelXp - profile.thisLevelXp);
  const levelPct = Math.min(100, Math.round(((profile.xp - profile.thisLevelXp) / levelSpan) * 100));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trading Game"
        title="Two traders. One market. Different decisions."
        description="Trade the same synthetic market as your opponent and let Kotka judge how you traded, not only what you made."
        actions={
          <Button as={Link} to="/app/game/history" variant="ghost" icon={History}>
            History
          </Button>
        }
      />

      {!data.identityVerified ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Playing for a stake needs your identity to be verified (and you must be 18 or older). Practice matches are free and open now. <Link to="/verify" className="font-medium underline">Check verification</Link>
          </span>
        </div>
      ) : null}
      {!rules.matchesEnabled ? <p className="rounded-xl border border-ink-200 p-3 text-sm text-ink-600 dark:border-ink-700 dark:text-ink-300">Competitions are paused right now. Practice still works.</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Wallet" subtitle="Kotka Credits: 1 credit = ₦1" action={<Wallet className="h-4 w-4 text-ink-300" />} />
          <CardBody className="space-y-4">
            <div>
              <p className="text-3xl font-semibold tabular-nums tracking-tight text-ink-900 dark:text-ink-50">{naira(wallet.availableKobo)}</p>
              <p className="text-xs text-ink-400">available · {naira(wallet.lockedKobo)} locked in matches{wallet.pendingWithdrawKobo ? ` · ${naira(wallet.pendingWithdrawKobo)} withdrawing` : ''}</p>
            </div>
            <div className="flex gap-2">
              <Button as={Link} to="/app/game/wallet" size="sm">Add money</Button>
              <Button as={Link} to="/app/game/wallet?tab=withdraw" size="sm" variant="secondary">Withdraw</Button>
            </div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={`Level ${profile.level}`} subtitle={`${profile.xp.toLocaleString()} XP · ${profile.matches} competition${profile.matches === 1 ? '' : 's'} (${profile.wins} won, ${profile.losses} lost, ${profile.draws} drawn)`} action={<Button as={Link} to="/app/game/profile" size="sm" variant="ghost" iconRight={ArrowRight}>Your record</Button>} />
          <CardBody className="space-y-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800" aria-label={`${levelPct}% of the way to level ${profile.level + 1}`}>
              <div className="h-full rounded-full bg-accent-500" style={{ width: `${levelPct}%` }} />
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[['Average Kotka Score', profile.avgScore ?? '—'], ['Risk management', profile.avgRisk ?? '—'], ['Decision quality', profile.avgDecision ?? '—'], ['Badges', profile.badges.length]].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-400">{k}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-ink-900 dark:text-ink-50">{v}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button icon={Swords} onClick={() => setDialog(true)} disabled={!data.identityVerified || !rules.matchesEnabled}>New challenge</Button>
        <Button variant="secondary" icon={GraduationCap} onClick={practice}>Practice (free)</Button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Your matches" subtitle="Challenges you’ve sent or received, and matches in progress." />
          <CardBody>
            {data.mine.length ? (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {data.mine.map((m) => (
                  <MatchRow key={m.id} m={m} meId={user?.id} onChanged={load} />
                ))}
              </ul>
            ) : (
              <EmptyState size="inline" icon={Swords} title="No matches yet" description="Challenge a trader, post an open challenge, or practise for free." />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Open challenges" subtitle="Posted by other traders. Accepting locks the same stake from your balance." />
          <CardBody>
            {data.open.length ? (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {data.open.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{m.creator?.name}</p>
                      <p className="text-xs text-ink-400">{naira(m.stakeKobo)} each · winner gets {naira(m.prizeKobo)} · {minutes(m.durationSec)}</p>
                    </div>
                    <Button size="sm" onClick={() => join(m)} disabled={m.stakeKobo > wallet.availableKobo}>
                      {m.stakeKobo > wallet.availableKobo ? 'Not enough balance' : 'Accept'}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState size="inline" icon={Trophy} title="No open challenges right now" description="Post one yourself and any verified trader can accept it." />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="How the winner is decided" subtitle="The Kotka Performance Score, out of 100. Profit alone doesn’t win." />
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

      {dialog ? <ChallengeDialog open onClose={() => setDialog(false)} rules={rules} available={wallet.availableKobo} onCreated={(id) => navigate(`/app/game/matches/${id}`)} /> : null}
    </div>
  );
}
