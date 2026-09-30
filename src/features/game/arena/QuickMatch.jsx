// Quick Match: pick a stake and a length, and Kotka finds someone on the
// same terms. Nothing is held until an opponent is found.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, X, ShieldAlert } from 'lucide-react';
import Button from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Input';
import { api } from '../../../lib/api';
import { confirmDialog, toast } from '../../../lib/dialogs';
import StakePicker, { stakeReady } from './StakePicker';
import { naira, minutes, mmss, stakeWords } from '../format';

const prizeOf = (stake, feeBps) => {
  const pool = stake * 2;
  const prize = pool - Math.floor((pool * feeBps) / 10000);
  return { prize, drawEach: Math.floor(prize / 2) };
};

export default function QuickMatch({ rules, wallet, verified, queue, looking, onChanged }) {
  const navigate = useNavigate();
  const [stake, setStake] = useState(queue?.stakeKobo ?? rules.minStakeKobo);
  const [duration, setDuration] = useState(queue?.durationSec ?? rules.defaultDurationSec);
  const [search, setSearch] = useState(queue?.status === 'searching' ? queue : null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const live = useRef(null);
  live.current = search;

  // A search already running (page reloaded) picks up where it was.
  useEffect(() => {
    if (queue?.status === 'searching') setSearch((s) => s ?? queue);
  }, [queue]);

  useEffect(() => {
    if (!search) return undefined;
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    const poll = setInterval(async () => {
      try {
        const r = await api.get('/game/quick');
        if (r.status === 'matched') {
          setSearch(null);
          toast('Opponent found. Opening the lobby.');
          navigate(`/app/game/matches/${r.matchId}`);
        } else if (r.status !== 'searching') {
          setSearch(null);
          toast(r.status === 'expired' ? 'Nobody turned up on those terms, so the search stopped. Nothing was taken from your balance.' : 'Your search stopped.', { tone: 'error' });
          onChanged?.();
        }
      } catch {
        /* the next check retries */
      }
    }, 2500);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [search, navigate, onChanged]);

  // Leaving the Arena ends the search (the page is what keeps it alive).
  useEffect(() => () => {
    if (live.current) api.delete('/game/quick').catch(() => {});
  }, []);

  const { prize, drawEach } = prizeOf(stake, rules.feeBps);
  const short = stake > wallet.availableKobo;

  const start = async () => {
    const ok = await confirmDialog({
      title: `Find an opponent for ${naira(stake)}?`,
      message: [
        ...stakeWords({ stakeKobo: stake, startingCapital: rules.startingCapital, feeBps: rules.feeBps }),
        `The winner receives ${naira(prize)}. A draw pays ${naira(drawEach)} each.`,
        'Nothing is taken until an opponent is found; then the stake is held for the match. You must be 18 or older, and you can lose your stake.',
      ].join('\n'),
      confirmLabel: 'Find an opponent',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post('/game/quick', { stakeKobo: stake, durationSec: duration });
      if (r.status === 'matched') {
        toast('Opponent found. Opening the lobby.');
        navigate(`/app/game/matches/${r.matchId}`);
      } else setSearch(r);
      onChanged?.();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try {
      const r = await api.delete('/game/quick');
      setSearch(null);
      if (r.status === 'matched') navigate(`/app/game/matches/${r.matchId}`);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  if (!verified) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Playing for a stake needs your identity to be verified (and you must be 18 or older). <Link to="/verify" className="font-medium underline">Check verification</Link>. Practice matches are free and open now.</span>
      </div>
    );
  }
  if (!rules.matchesEnabled) return <p className="text-sm text-ink-500 dark:text-ink-400">Competitions are paused right now. Practice still works.</p>;

  if (search) {
    const since = search.since ? (Date.now() - new Date(search.since).getTime()) / 1000 : 0;
    const others = Math.max(0, (looking ?? 0) - 1);
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center" role="status" aria-live="polite">
        <span className="relative flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent-500/25" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-accent-500/15 text-accent-700 dark:text-accent-300"><Zap className="h-6 w-6" /></span>
        </span>
        <div>
          <p className="text-base font-semibold text-ink-900 dark:text-ink-50">Looking for a trader…</p>
          <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">{naira(search.stakeKobo)} each · {minutes(search.durationSec)} · searching for {mmss(since)}</p>
          <p className="mt-1 text-xs text-ink-400">{others ? `${others} other trader${others === 1 ? ' is' : 's are'} looking for a match right now.` : 'You’re the only one looking right now. The first trader on the same terms is paired with you.'} Stay on this page while we look.</p>
        </div>
        <Button variant="secondary" icon={X} onClick={stop} disabled={busy}>Stop searching</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium text-ink-500 dark:text-ink-400">Stake</p>
        <StakePicker rules={rules} value={stake} onChange={setStake} available={wallet.availableKobo} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label="Match length" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
          {rules.durations.map((d) => (
            <option key={d} value={d}>{minutes(d)}</option>
          ))}
        </Select>
        <div className="rounded-xl bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-600 dark:bg-ink-800/60 dark:text-ink-300">
          Winner receives <span className="font-semibold tabular-nums text-ink-900 dark:text-ink-50">{naira(prize)}</span>. Platform fee {rules.feeBps / 100}%. Both trade {`₦${rules.startingCapital.toLocaleString('en-NG')}`} of virtual capital.
        </div>
      </div>
      <Button className="w-full" size="lg" icon={Zap} onClick={start} disabled={busy || short || !stakeReady(stake, rules)}>
        {short ? 'Not enough balance for this stake' : 'Quick Match'}
      </Button>
    </div>
  );
}
