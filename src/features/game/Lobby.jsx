// The Match Lobby: you against them, the terms, and "I'm ready". When both
// are ready the stakes are locked and the market opens after a countdown.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { CheckCircle2, CircleDashed, Swords } from 'lucide-react';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Avatar } from '../community/components/Identity';
import { api } from '../../lib/api';
import { confirmDialog, toast } from '../../lib/dialogs';
import KotkaChart from './pro/LazyChart';
import { MoneySummary } from './ChallengeDialog';
import { naira, minutes, mmss, virtual, STATUS_LABEL, stakeWords } from './format';
import { usePairSwitch } from './pairs';

function useClock(ms) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function Seat({ person, you, ready, online, stakeKobo, practice, waitingText }) {
  if (!person) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-ink-200 text-ink-300 dark:border-ink-700 dark:text-ink-600"><CircleDashed className="h-6 w-6 animate-spin [animation-duration:3s]" /></span>
        <p className="text-sm font-medium text-ink-500 dark:text-ink-400">{waitingText}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="relative">
        <Avatar user={person} size={64} />
        {online ? <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full bg-profit-500 ring-2 ring-white dark:ring-ink-900" title="Here now" /> : null}
      </span>
      <div>
        <p className="text-base font-semibold text-ink-900 dark:text-ink-50">
          {person.username ? <Link to={`/app/game/traders/${person.username}`} className="hover:underline">{person.name}</Link> : person.name}
          {you ? <span className="ml-1 text-xs font-normal text-ink-400">(you)</span> : null}
        </p>
        {!practice ? <p className="text-xs tabular-nums text-ink-500 dark:text-ink-400">Stake {naira(stakeKobo)}</p> : null}
      </div>
      {ready ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-profit-50 px-2.5 py-1 text-xs font-medium text-profit-600 dark:bg-profit-500/10 dark:text-profit-400"><CheckCircle2 className="h-3.5 w-3.5" /> Ready</span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-500 dark:bg-ink-800 dark:text-ink-400"><CircleDashed className="h-3.5 w-3.5" /> Not ready yet</span>
      )}
    </div>
  );
}

export default function Lobby({ view, meId, now, reload }) {
  useClock(250);
  const navigate = useNavigate();
  const m = view.match;
  const pairSwitch = usePairSwitch(m);
  const [busy, setBusy] = useState(false);
  const practice = m.mode === 'practice';
  const mine = view.players.find((p) => p.userId === meId);
  const isCreator = m.creator?.id === meId;
  const waitingFor = m.status === 'WAITING_FOR_OPPONENT';
  const countdown = m.status === 'COUNTDOWN' && m.startsAt ? Math.max(0, Math.ceil((new Date(m.startsAt).getTime() - now()) / 1000)) : null;
  const expires = waitingFor ? m.expiresAt : m.status === 'READY' ? m.readyBy : null;
  const source = m.rules?.source;

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const leave = () =>
    run(async () => {
      if (!(await confirmDialog({ title: isCreator && waitingFor ? 'Cancel this challenge?' : 'Leave this match?', message: practice ? 'This practice match ends.' : 'Stakes go back to both players’ available balances.', confirmLabel: isCreator && waitingFor ? 'Cancel challenge' : 'Leave' }))) return;
      await api.post(`/game/matches/${m.id}/cancel`);
      navigate('/app/game');
    });
  const accept = () =>
    run(async () => {
      if (!(await confirmDialog({ title: 'Accept this challenge?', message: [...stakeWords({ stakeKobo: m.stakeKobo, startingCapital: m.startingCapital, feeBps: m.feeBps }), `The winner receives ${naira(m.prizeKobo)}. A draw pays ${naira(m.drawEachKobo)} each.`, 'You must be 18 or older, and you can lose your stake.'].join('\n'), confirmLabel: `Stake ${naira(m.stakeKobo)} and accept` }))) return;
      await api.post(`/game/matches/${m.id}/join`);
    });
  const ready = () => run(() => api.post(`/game/matches/${m.id}/confirm`));

  // Seats: the creator on the left, the opponent (or who's invited) on the right.
  const seatOf = (id) => view.players.find((p) => p.userId === id);
  const left = seatOf(m.creator?.id) ?? { person: m.creator };
  const otherId = view.players.find((p) => p.userId !== m.creator?.id)?.userId ?? m.invited?.id ?? null;
  const right = otherId ? seatOf(otherId) ?? { person: m.invited } : null;
  const otherName = (left.person?.id === meId ? right?.person?.name : left.person?.name) ?? 'your opponent';

  let action = null;
  if (countdown != null) {
    action = (
      <div className="text-center" aria-live="assertive">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-600 dark:text-accent-400">Market opening in</p>
        <p key={countdown} className="mt-1 animate-slide-up text-6xl font-semibold tabular-nums tracking-tight text-ink-900 dark:text-ink-50">{countdown <= 3 ? `${countdown || 'Go'}${countdown ? '…' : ''}` : countdown}</p>
        {!practice ? <p className="mt-1 text-xs text-ink-400">Both stakes are locked. The same market opens for both of you.</p> : null}
      </div>
    );
  } else if (waitingFor && !isCreator && !mine) {
    action = <Button size="lg" onClick={accept} disabled={busy}>Accept challenge</Button>;
  } else if (waitingFor) {
    action = <p className="text-center text-sm text-ink-500 dark:text-ink-400">{m.isOpen ? 'Your challenge is listed in the Trading Arena for any verified trader to accept.' : `Waiting for ${m.invited?.name ?? 'your opponent'} to accept.`}{expires ? ` It closes in ${mmss(Math.max(0, (new Date(expires).getTime() - now()) / 1000))}.` : ''}</p>;
  } else if (m.status === 'READY' && mine && !mine.confirmed) {
    action = (
      <div className="flex flex-col items-center gap-2">
        <Button size="lg" className="min-w-[220px] text-base font-semibold tracking-wide" onClick={ready} disabled={busy}>I’M READY</Button>
        <p className="text-xs text-ink-400">The countdown starts when you’re both ready.{expires ? ` The lobby closes in ${mmss(Math.max(0, (new Date(expires).getTime() - now()) / 1000))}.` : ''}</p>
      </div>
    );
  } else if (m.status === 'READY') {
    action = <p className="text-center text-sm text-ink-500 dark:text-ink-400">You’re ready. Waiting for {otherName} to get ready.{expires ? ` The lobby closes in ${mmss(Math.max(0, (new Date(expires).getTime() - now()) / 1000))}.` : ''}</p>;
  } else {
    action = <p className="text-center text-sm text-ink-500 dark:text-ink-400">{STATUS_LABEL[m.status]}…</p>;
  }

  const facts = practice
    ? [['Virtual trading capital', virtual(m.startingCapital)], ['Length', minutes(m.durationSec)], ['Market', m.pair?.symbol ?? 'Kotka market'], ['Stake', 'None: practice']]
    : [
        ['Competition stake', `${naira(m.stakeKobo)} each`],
        ['Virtual trading capital', `${virtual(m.startingCapital)} each`],
        ['Length', minutes(m.durationSec)],
        ['Kotka platform fee', `${m.feeBps / 100}%`],
        ['Prize pool', naira(m.prizeKobo)],
        ['Market', m.pair?.symbol ?? 'Kotka market'],
      ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-400">{practice ? 'Practice' : source === 'quick' ? 'Quick Match' : source === 'rematch' ? 'Rematch' : `Challenge ${m.code}`}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-50 sm:text-2xl">Match lobby</h1>
        </div>
        {(waitingFor || m.status === 'READY') && (mine || m.invited?.id === meId) ? (
          <Button variant="ghost" onClick={leave} disabled={busy}>{waitingFor && !isCreator ? 'Decline' : isCreator && waitingFor ? 'Cancel challenge' : 'Leave lobby'}</Button>
        ) : null}
      </div>

      <Card>
        <CardBody className="space-y-6 p-6">
          {practice ? (
            <div className="flex justify-center">
              <Seat person={left.person} you ready online practice />
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <Seat person={left.person} you={left.person?.id === meId} ready={left.confirmed} online={left.online} stakeKobo={m.stakeKobo} />
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-900 text-sm font-bold tracking-wider text-white dark:bg-white dark:text-ink-900"><Swords className="mr-0.5 h-4 w-4" />VS</span>
              <Seat person={right?.person} you={right?.person?.id === meId} ready={right?.confirmed} online={right?.online} stakeKobo={m.stakeKobo} waitingText={m.isOpen ? 'Waiting for an opponent' : 'Invited'} />
            </div>
          )}
          <dl className={clsx('grid gap-3 border-t border-ink-100 pt-5 dark:border-ink-800', practice ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6')}>
            {facts.map(([k, v]) => (
              <div key={k} className="text-center">
                <dt className="text-[11px] uppercase tracking-wide text-ink-400">{k}</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900 dark:text-ink-50">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex justify-center border-t border-ink-100 pt-5 dark:border-ink-800">{action}</div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {view.chart ? (
            <div>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{m.pair?.symbol} · the market so far</h2>
                <p className="text-xs text-ink-500 dark:text-ink-400">Both players see exactly this. Scroll back through the history and draw your levels before the start.</p>
              </div>
              <KotkaChart matchId={m.id} info={view.chart} pair={m.pair} feed={view.ticks} feedEpoch={view.feedEpoch} durationSec={m.durationSec} defaultTf={m.candleSec} height={520} {...pairSwitch} />
            </div>
          ) : null}
        </div>
        <div className="space-y-6">
          {!practice ? <MoneySummary stakeKobo={m.stakeKobo} rules={{ feeBps: m.feeBps, drawTolerance: m.rules.drawTolerance, noTradeRefund: m.rules.noTradeRefund, startingCapital: m.startingCapital }} /> : null}
          <Card>
            <CardHeader title="Rules" />
            <CardBody>
              <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                <li>Same market, same clock and same information for both players.</li>
                <li>Go long or short with up to {m.rules.maxLeverage}× your capital. Say what you expect and why before each new position.</li>
                <li>Stops and targets fill automatically. If your capital falls to {m.rules.stopOutPct}%, your position is closed.</li>
                <li>Anything open at the end closes at the last price.</li>
                <li>You can’t see your opponent’s trades during the match, only their return. Everything is shown in the replay after.</li>
                <li>If you lose connection, the match carries on without you; come back and pick up where you are. Positions you left open keep their stop and target.</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
