import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Clock3, Swords, CheckCircle2, CircleDashed, ArrowLeft, Ban, TimerOff, ShieldAlert } from 'lucide-react';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { api } from '../../lib/api';
import { confirmDialog, toast } from '../../lib/dialogs';
import { useAuth } from '../../context/AuthContext';
import GameChart from './GameChart';
import LiveMatch from './LiveMatch';
import MatchResult from './MatchResult';
import { MoneySummary } from './ChallengeDialog';
import { naira, minutes, mmss, STATUS_LABEL } from './format';

const POLL = { ACTIVE: 1000, COUNTDOWN: 1000, LOCKED: 1000, READY: 2500, WAITING_FOR_OPPONENT: 4000, COMPLETED: 1500, SCORING: 1500, SETTLEMENT: 1500 };

// Keeps every candle seen so far and replaces the one still forming.
function mergeCandles(prev = [], next = []) {
  if (!next.length) return prev;
  const from = next[0].i;
  return [...prev.filter((c) => c.i < from), ...next];
}

export function useMatch(id) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const offset = useRef(0);
  const candles = useRef([]);
  const apply = useCallback((view) => {
    offset.current = new Date(view.serverNow).getTime() - Date.now();
    if (view.candles) {
      candles.current = mergeCandles(candles.current, view.candles);
      view = { ...view, candles: candles.current };
    }
    setState(view);
  }, []);
  const load = useCallback(() => {
    const since = candles.current.length ? candles.current.at(-1).i : 0;
    // Only the first load can fail the page; a missed poll is simply retried.
    return api.get(`/game/matches/${id}/state?since=${since}`).then(apply).catch((err) => {
      if (!candles.current.length) setError(err.message);
    });
  }, [id, apply]);
  useEffect(() => {
    candles.current = [];
    setState(null);
    load();
  }, [id, load]);
  useEffect(() => {
    const every = POLL[state?.match.status];
    if (!every) return undefined;
    const t = setInterval(load, every);
    return () => clearInterval(t);
  }, [state?.match.status, load]);
  const now = () => Date.now() + offset.current;
  const since = () => (candles.current.length ? candles.current.at(-1).i : 0);
  return { state, error, reload: load, apply, now, since };
}

function useClock(ms = 250) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function Players({ view }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {view.players.map((p) => (
        <li key={p.userId} className="flex items-center justify-between rounded-xl border border-ink-100 px-4 py-3 dark:border-ink-800">
          <span className="text-sm font-medium text-ink-800 dark:text-ink-100">{p.person?.name ?? 'Trader'}</span>
          {p.confirmed ? (
            <span className="flex items-center gap-1 text-xs text-profit-600 dark:text-profit-400"><CheckCircle2 className="h-3.5 w-3.5" /> Ready</span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-ink-400"><CircleDashed className="h-3.5 w-3.5" /> Not ready</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Lobby({ view, meId, now, reload }) {
  useClock(500);
  const navigate = useNavigate();
  const m = view.match;
  const [busy, setBusy] = useState(false);
  const mine = view.players.find((p) => p.userId === meId);
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
      if (!(await confirmDialog({ title: m.creator?.id === meId ? 'Cancel this challenge?' : 'Leave this match?', message: 'Stakes go back to both players’ balances.', confirmLabel: 'Yes, cancel' }))) return;
      await api.post(`/game/matches/${m.id}/cancel`);
      navigate('/app/game');
    });
  const accept = () =>
    run(async () => {
      if (!(await confirmDialog({ title: 'Accept this challenge?', message: `${naira(m.stakeKobo)} is locked from your balance. You must be 18 or older, and you can lose your stake.`, confirmLabel: `Lock ${naira(m.stakeKobo)} and accept` }))) return;
      await api.post(`/game/matches/${m.id}/join`);
    });

  const waitingFor = m.status === 'WAITING_FOR_OPPONENT';
  const isCreator = m.creator?.id === meId;
  const countdown = m.status === 'COUNTDOWN' && m.startsAt ? Math.max(0, Math.ceil((new Date(m.startsAt).getTime() - now()) / 1000)) : null;
  const expires = waitingFor ? m.expiresAt : m.status === 'READY' ? m.readyBy : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-400">{m.mode === 'practice' ? 'Practice' : `Challenge ${m.code}`}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-50 sm:text-2xl">{countdown != null ? `Starting in ${countdown}s` : STATUS_LABEL[m.status]}</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            {minutes(m.durationSec)} match{m.mode === 'duel' ? ` · ${naira(m.stakeKobo)} each` : ' · no stake'}
            {expires ? ` · closes in ${mmss(Math.max(0, (new Date(expires).getTime() - now()) / 1000))}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {waitingFor && !isCreator && mine === undefined ? <Button onClick={accept} disabled={busy}>Accept challenge</Button> : null}
          {m.status === 'READY' && mine && !mine.confirmed ? <Button onClick={() => run(() => api.post(`/game/matches/${m.id}/confirm`))} disabled={busy}>I’m ready</Button> : null}
          {(waitingFor || m.status === 'READY') && (mine || m.invited?.id === meId) ? <Button variant="ghost" onClick={leave} disabled={busy}>{waitingFor && !isCreator ? 'Decline' : isCreator && waitingFor ? 'Cancel challenge' : 'Leave'}</Button> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {view.candles?.length ? (
            <Card>
              <CardHeader title="The market so far" subtitle="Both players see exactly this. The match continues it from the start line." />
              <CardBody>
                <GameChart candles={view.candles} candleSec={m.candleSec} show={{ ma20: true, ma50: true, levels: true, volume: true, rsi: true }} height={380} />
              </CardBody>
            </Card>
          ) : null}
          {view.players.length ? (
            <Card>
              <CardHeader title="Players" subtitle={m.status === 'READY' ? 'The countdown starts when you’re both ready.' : undefined} />
              <CardBody>
                <Players view={view} />
              </CardBody>
            </Card>
          ) : null}
        </div>
        <div className="space-y-6">
          {m.mode === 'duel' ? <MoneySummary stakeKobo={m.stakeKobo} rules={{ feeBps: m.feeBps, drawTolerance: m.rules.drawTolerance, noTradeRefund: m.rules.noTradeRefund, startingCapital: m.startingCapital }} /> : null}
          <Card>
            <CardHeader title="Rules" />
            <CardBody>
              <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                <li>Same market, same clock and same information for both players.</li>
                <li>Go long or short with up to {m.rules.maxLeverage}× your capital. Say what you expect and why before each new position.</li>
                <li>Stops and targets fill automatically. If your capital falls to {m.rules.stopOutPct}%, your position is closed.</li>
                <li>Anything open at the end closes at the last price.</li>
                <li>You can’t see your opponent’s trades during the match, only their return. Everything is shown in the replay after.</li>
                <li>If you lose connection the match carries on; come back and pick up where you are.</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

const CLOSED = {
  CANCELLED: [Ban, 'This challenge was cancelled', 'Any stakes were returned to the players’ balances.'],
  EXPIRED: [TimerOff, 'This challenge expired', 'Nobody accepted or confirmed in time, so any stakes went back.'],
  REFUNDED: [Ban, 'This match was refunded', 'Both stakes were returned in full.'],
  DISPUTED: [ShieldAlert, 'This match is under review', 'Something went wrong with the market for this match, so it wasn’t settled. Stakes stay locked until the team reviews it, then they’re returned.'],
  ABANDONED: [TimerOff, 'This match was abandoned', 'Any stakes were returned.'],
};

export default function MatchPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { state, error, reload, apply, now, since } = useMatch(id);

  if (error) return <EmptyState icon={Swords} title="We couldn’t open this match" description={error} action={<Button as={Link} to="/app/game">Back to the Trading Game</Button>} />;
  if (!state) return <div className="h-[32rem] animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const m = state.match;

  const back = (
    <Link to="/app/game" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-50">
      <ArrowLeft className="h-4 w-4" /> Trading Game
    </Link>
  );
  if (CLOSED[m.status]) {
    const [Icon, title, desc] = CLOSED[m.status];
    return (
      <div>
        {back}
        <EmptyState icon={Icon} title={title} description={desc} action={<Button as={Link} to="/app/game">Back to the Trading Game</Button>} />
      </div>
    );
  }
  if (m.status === 'SETTLED' && state.report) return <div>{back}<MatchResult view={state} /></div>;
  if (m.status === 'ACTIVE') return <div>{back}<LiveMatch view={state} now={now} apply={apply} since={since} /></div>;
  if (['COMPLETED', 'SCORING', 'SETTLEMENT'].includes(m.status)) {
    return (
      <div>
        {back}
        <EmptyState icon={Clock3} title="Time’s up. Scoring the match…" description="Kotka is checking every decision against the market. This takes a moment." />
      </div>
    );
  }
  return <div>{back}<Lobby view={state} meId={user?.id} now={now} reload={reload} /></div>;
}
