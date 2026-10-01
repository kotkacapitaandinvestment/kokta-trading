import { useEffect, useState } from 'react';
import { Search, Users, Globe2 } from 'lucide-react';
import clsx from 'clsx';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Select } from '../../components/ui/Input';
import { api } from '../../lib/api';
import { naira, virtual, minutes, stakeWords } from './format';
import StakePicker, { stakeReady } from './arena/StakePicker';

// What entering costs and pays, shown before anyone commits money.
export function MoneySummary({ stakeKobo, rules, className }) {
  const pool = stakeKobo * 2;
  const fee = Math.floor((pool * rules.feeBps) / 10000);
  const prize = pool - fee;
  const rows = [
    ['Your stake', naira(stakeKobo)],
    ['Prize pool (both stakes)', naira(pool)],
    [`Kotka fee (${rules.feeBps / 100}%)`, `−${naira(fee)}`],
    ['Winner receives', naira(prize)],
  ];
  return (
    <div className={clsx('rounded-xl border border-ink-100 dark:border-ink-800', className)}>
      <dl className="divide-y divide-ink-100 text-sm dark:divide-ink-800">
        {rows.map(([k, v], i) => (
          <div key={k} className={clsx('flex justify-between px-4 py-2', i === rows.length - 1 && 'font-semibold text-ink-900 dark:text-ink-50')}>
            <dt className="text-ink-500 dark:text-ink-400">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <ul className="space-y-1 border-t border-ink-100 px-4 py-3 text-xs leading-relaxed text-ink-500 dark:border-ink-800 dark:text-ink-400">
        <li>Scores within {rules.drawTolerance} point{rules.drawTolerance === 1 ? '' : 's'} are a draw: each of you gets {naira(Math.floor(prize / 2))}.</li>
        {rules.noTradeRefund ? <li>If neither of you trades, both stakes come back in full with no fee.</li> : null}
        <li>You each trade {virtual(rules.startingCapital)} of virtual capital. It’s game money only and can’t be withdrawn.</li>
        <li>The winner is decided by the Kotka Performance Score, which looks at how you traded, not only your profit.</li>
      </ul>
    </div>
  );
}

export default function ChallengeDialog({ open, onClose, rules, available, promoKobo = 0, onCreated, presetOpponent = null, pairs = [] }) {
  const [stake, setStake] = useState(rules.minStakeKobo);
  const [duration, setDuration] = useState(rules.defaultDurationSec);
  const [symbol, setSymbol] = useState('');
  const [mode, setMode] = useState(presetOpponent ? 'direct' : 'open');
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [opponent, setOpponent] = useState(presetOpponent);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (mode !== 'direct' || q.trim().length < 2) return setFound([]);
    const t = setTimeout(() => api.get(`/game/traders?q=${encodeURIComponent(q.trim())}`).then((r) => setFound(r.traders)).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q, mode]);

  const short = stake > available;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post('/game/matches', { mode: 'duel', stakeKobo: stake, durationSec: duration, ...(symbol ? { symbol } : {}), ...(mode === 'direct' ? { opponentId: opponent?.id } : { open: true }) });
      onCreated(r.match.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={presetOpponent ? `Challenge ${presetOpponent.name}` : 'New challenge'} width="max-w-xl">
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-medium text-ink-500 dark:text-ink-400">Stake</p>
          <StakePicker rules={rules} value={stake} onChange={setStake} available={available} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Kotka pair" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            <option value="">Surprise me (random pair)</option>
            {[...new Set(pairs.map((p) => p.category))].map((c) => (
              <optgroup key={c} label={c}>
                {pairs.filter((p) => p.category === c).map((p) => (
                  <option key={p.symbol} value={p.symbol}>{p.symbol} · {p.name}</option>
                ))}
              </optgroup>
            ))}
          </Select>
          <Select label="Match length" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {rules.durations.map((d) => (
              <option key={d} value={d}>{minutes(d)}</option>
            ))}
          </Select>
        </div>
        <div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-700 dark:text-ink-200">Opponent</p>
            <div className="flex gap-1 rounded-lg bg-ink-50 p-1 dark:bg-ink-800">
              {[['open', 'Anyone', Globe2], ['direct', 'A trader', Users]].map(([k, label, Icon]) => (
                <button key={k} type="button" onClick={() => setMode(k)} className={clsx('flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm', mode === k ? 'bg-white shadow-sm dark:bg-ink-700' : 'text-ink-500')}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {mode === 'direct' ? (
          opponent ? (
            <div className="flex items-center justify-between rounded-xl border border-ink-100 px-4 py-3 dark:border-ink-800">
              <span className="text-sm text-ink-800 dark:text-ink-100">{opponent.name} {opponent.username ? <span className="text-ink-400">@{opponent.username}</span> : null}</span>
              <Button size="sm" variant="ghost" onClick={() => setOpponent(null)}>Change</Button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by username or name" aria-label="Search traders" className="h-10 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100" />
              </div>
              {found.length ? (
                <ul className="mt-2 divide-y divide-ink-100 rounded-xl border border-ink-100 dark:divide-ink-800 dark:border-ink-800">
                  {found.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => setOpponent(t)} className="flex w-full justify-between px-4 py-2 text-left text-sm hover:bg-ink-50 dark:hover:bg-ink-800/50">
                        <span>{t.name} {t.username ? <span className="text-ink-400">@{t.username}</span> : null}</span>
                        <span className="text-xs text-ink-400">Level {t.level}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : q.trim().length >= 2 ? <p className="mt-2 text-xs text-ink-400">No traders match “{q.trim()}”.</p> : null}
            </div>
          )
        ) : (
          <p className="text-xs text-ink-500 dark:text-ink-400">Your challenge is listed for any verified trader to accept for {rules.openChallengeMinutes ?? 30} minutes. If nobody does, your stake comes back.</p>
        )}

        <MoneySummary stakeKobo={stake} rules={rules} />
        <ul className="space-y-1 rounded-xl bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-700 dark:bg-ink-800/60 dark:text-ink-200">
          {stakeWords({ stakeKobo: stake, startingCapital: rules.startingCapital, feeBps: rules.feeBps, promoKobo }).map((line) => <li key={line}>{line}</li>)}
        </ul>

        <label className="flex items-start gap-2 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
          I’m 18 or older. I understand this stake is real money that I can lose, and that it’s locked until the match ends or the challenge closes.
        </label>

        {error ? <p role="alert" className="text-sm text-loss-500">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Not now</Button>
          <Button onClick={submit} disabled={busy || !agreed || short || !stakeReady(stake, rules) || (mode === 'direct' && !opponent)}>{busy ? 'Locking…' : `Lock ${naira(stake)} and ${mode === 'direct' ? 'send challenge' : 'post challenge'}`}</Button>
        </div>
      </div>
    </Modal>
  );
}
