import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Clock3, Swords, ArrowLeft, Ban, TimerOff, ShieldAlert } from 'lucide-react';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import LiveMatch from './LiveMatch';
import Lobby from './Lobby';
import MatchResult from './MatchResult';

const POLL = { ACTIVE: 1000, COUNTDOWN: 1000, LOCKED: 1000, READY: 2500, WAITING_FOR_OPPONENT: 4000, COMPLETED: 1500, SCORING: 1500, SETTLEMENT: 1500 };

// Polls the match. The chart gets each new one-second price (`ticks`)
// since the last one we saw; after a long gap the server says to reload.
export function useMatch(id) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const offset = useRef(0);
  const lastTick = useRef(null);
  const epoch = useRef(0);
  const loaded = useRef(false);
  const apply = useCallback((view) => {
    offset.current = new Date(view.serverNow).getTime() - Date.now();
    if (view.chart) {
      if (view.ticksReset) {
        epoch.current += 1;
        lastTick.current = view.chart.lastT;
      } else if (view.ticks?.length) lastTick.current = Math.max(lastTick.current ?? -Infinity, view.ticks.at(-1)[0]);
      else if (lastTick.current == null) lastTick.current = view.chart.lastT;
    }
    loaded.current = true;
    setState({ ...view, feedEpoch: epoch.current });
  }, []);
  const load = useCallback(() => {
    const q = lastTick.current != null ? `?ticksSince=${lastTick.current}` : '';
    // Only the first load can fail the page; a missed poll is simply retried.
    return api.get(`/game/matches/${id}/state${q}`).then(apply).catch((err) => {
      if (!loaded.current) setError(err.message);
    });
  }, [id, apply]);
  useEffect(() => {
    lastTick.current = null;
    loaded.current = false;
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
  const ticksSince = () => lastTick.current;
  return { state, error, reload: load, apply, now, ticksSince };
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
  const { state, error, reload, apply, now, ticksSince } = useMatch(id);

  if (error) return <EmptyState icon={Swords} title="We couldn’t open this match" description={error} action={<Button as={Link} to="/app/game">Back to the Trading Arena</Button>} />;
  if (!state) return <div className="h-[32rem] animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const m = state.match;

  const back = (
    <Link to="/app/game" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-50">
      <ArrowLeft className="h-4 w-4" /> Trading Arena
    </Link>
  );
  if (CLOSED[m.status]) {
    const [Icon, title, desc] = CLOSED[m.status];
    return (
      <div>
        {back}
        <EmptyState icon={Icon} title={title} description={desc} action={<Button as={Link} to="/app/game">Back to the Trading Arena</Button>} />
      </div>
    );
  }
  if (m.status === 'SETTLED' && state.report) return <div>{back}<MatchResult view={state} /></div>;
  if (m.status === 'ACTIVE') return <div>{back}<LiveMatch view={state} now={now} apply={apply} ticksSince={ticksSince} /></div>;
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
