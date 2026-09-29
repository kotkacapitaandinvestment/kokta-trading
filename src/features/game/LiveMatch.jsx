import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { TrendingUp, TrendingDown, Clock3 } from 'lucide-react';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { confirmDialog, toast } from '../../lib/dialogs';
import { CHART_COLORS } from '../../lib/chartColors';
import KotkaChart from './pro/LazyChart';
import { usePairSwitch } from './pairs';
import { virtual, price as fmt, pct, mmss, REASONS, requestKey } from './format';

const num = (v) => (v === '' || v == null ? null : Number(v));
const inputCls = 'h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-sm tabular-nums outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100';

function Chip({ on, children, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={clsx('rounded-full border px-2.5 py-1 text-xs transition-colors', on ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900' : 'border-ink-200 text-ink-600 hover:border-ink-400 dark:border-ink-700 dark:text-ink-300')}>
      {children}
    </button>
  );
}

function OrderTicket({ price, dp, equity, rules, busy, onOpen }) {
  const [side, setSide] = useState('long');
  const [size, setSize] = useState(100);
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const [view, setView] = useState('bullish');
  const [reasons, setReasons] = useState([]);
  const [confidence, setConfidence] = useState('medium');
  const long = side === 'long';
  useEffect(() => setView((v) => (v === 'range' ? v : long ? 'bullish' : 'bearish')), [long]);

  const s = num(stop);
  const t = num(target);
  const risk = s != null ? (size * Math.abs(price - s)) / price : null;
  const rr = s != null && t != null ? Math.abs(t - price) / Math.max(Math.abs(price - s), 1e-9) : null;
  const setStopPct = (p) => setStop((price * (long ? 1 - p / 100 : 1 + p / 100)).toFixed(dp));
  const setTargetR = (r) => s != null && setTarget((price + (long ? 1 : -1) * r * Math.abs(price - s)).toFixed(dp));
  const ready = reasons.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {[['long', 'Long', TrendingUp, 'bg-profit-600'], ['short', 'Short', TrendingDown, 'bg-loss-500']].map(([k, label, Icon, bg]) => (
          <button key={k} type="button" onClick={() => setSide(k)} className={clsx('flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors', side === k ? `${bg} text-white` : 'border border-ink-200 text-ink-600 dark:border-ink-700 dark:text-ink-300')}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-ink-500 dark:text-ink-400">
          <label htmlFor="size">Size</label>
          <span className="tabular-nums">{size}% of capital · {virtual((size / 100) * equity)}</span>
        </div>
        <input id="size" type="range" min={5} max={rules.maxLeverage * 100} step={5} value={size} onChange={(e) => setSize(Number(e.target.value))} className="mt-1 w-full accent-[#D1A85B]" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-ink-500 dark:text-ink-400" htmlFor="stop">Stop loss</label>
          <input id="stop" className={inputCls} inputMode="decimal" placeholder="Price" value={stop} onChange={(e) => setStop(e.target.value)} />
          <div className="mt-1 flex gap-1">
            {[0.25, 0.5, 1].map((p) => (
              <button key={p} type="button" onClick={() => setStopPct(p)} className="rounded border border-ink-200 px-1.5 text-[11px] text-ink-500 hover:text-ink-900 dark:border-ink-700 dark:text-ink-400">{p}%</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-ink-500 dark:text-ink-400" htmlFor="target">Take profit</label>
          <input id="target" className={inputCls} inputMode="decimal" placeholder="Price" value={target} onChange={(e) => setTarget(e.target.value)} />
          <div className="mt-1 flex gap-1">
            {[1.5, 2, 3].map((r) => (
              <button key={r} type="button" disabled={s == null} onClick={() => setTargetR(r)} className="rounded border border-ink-200 px-1.5 text-[11px] text-ink-500 hover:text-ink-900 disabled:opacity-40 dark:border-ink-700 dark:text-ink-400">{r}R</button>
            ))}
          </div>
        </div>
      </div>
      <p className={clsx('text-xs', risk != null && risk > 5 ? 'text-loss-500' : 'text-ink-500 dark:text-ink-400')}>
        {risk == null ? 'No stop loss: your risk on this trade has no limit.' : `Risk if stopped: ${risk.toFixed(2)}% of your capital${rr != null ? ` · reward to risk ${rr.toFixed(1)} : 1` : ''}.`}
      </p>

      <div className="space-y-2 border-t border-ink-100 pt-3 dark:border-ink-800">
        <p className="text-xs font-medium text-ink-700 dark:text-ink-200">Your thesis</p>
        <div className="flex flex-wrap gap-1.5">
          {[['bullish', 'Bullish'], ['bearish', 'Bearish'], ['range', 'Range-bound']].map(([k, l]) => (
            <Chip key={k} on={view === k} onClick={() => setView(k)}>{l}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map(([k, l]) => (
            <Chip key={k} on={reasons.includes(k)} onClick={() => setReasons((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]))}>{l}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-400">Confidence</span>
          {['low', 'medium', 'high'].map((k) => (
            <Chip key={k} on={confidence === k} onClick={() => setConfidence(k)}>{k[0].toUpperCase() + k.slice(1)}</Chip>
          ))}
        </div>
      </div>

      <Button className="w-full" disabled={busy || !ready} onClick={() => onOpen({ side, sizePct: size, stop: s, target: t, thesis: { view, reasons, confidence } })}>
        {!ready ? 'Choose at least one reason' : `${long ? 'Buy' : 'Sell'} at about ${fmt(price, dp)}`}
      </Button>
    </div>
  );
}

function PositionPanel({ pos, dp, rules, busy, act }) {
  const [stop, setStop] = useState(pos.stop ?? '');
  const [target, setTarget] = useState(pos.target ?? '');
  useEffect(() => {
    setStop(pos.stop ?? '');
    setTarget(pos.target ?? '');
  }, [pos.stop, pos.target]);
  const long = pos.side === 'long';
  const changed = String(num(stop) ?? '') !== String(pos.stop ?? '') || String(num(target) ?? '') !== String(pos.target ?? '');
  const room = rules.maxLeverage * 100 - pos.sizePct;
  const update = async () => {
    const payload = {};
    if (String(num(stop) ?? '') !== String(pos.stop ?? '')) {
      if (num(stop) == null && !(await confirmDialog({ title: 'Remove your stop loss?', message: 'Your risk on this trade will have no limit, and removing a stop is part of how Kotka scores your risk management.', confirmLabel: 'Remove it', danger: true }))) return;
      payload.stop = num(stop);
    }
    if (String(num(target) ?? '') !== String(pos.target ?? '')) payload.target = num(target);
    act('modify', payload);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <p className={clsx('text-sm font-semibold', long ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500')}>{long ? 'Long' : 'Short'} · {pos.sizePct}% of capital</p>
        <p className={clsx('text-lg font-semibold tabular-nums', pos.unrealised >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500')}>{pos.unrealised >= 0 ? '+' : '−'}{virtual(Math.abs(pos.unrealised))}</p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div><dt className="text-ink-400">Average entry</dt><dd className="tabular-nums text-ink-800 dark:text-ink-100">{fmt(pos.avgPrice, dp)}</dd></div>
        <div><dt className="text-ink-400">Risk to stop</dt><dd className={clsx('tabular-nums', pos.riskPct == null ? 'text-loss-500' : 'text-ink-800 dark:text-ink-100')}>{pos.riskPct == null ? 'No stop' : `${pos.riskPct}%`}</dd></div>
      </dl>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-ink-500 dark:text-ink-400" htmlFor="pstop">Stop loss</label>
          <input id="pstop" className={inputCls} inputMode="decimal" placeholder="None" value={stop} onChange={(e) => setStop(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-ink-500 dark:text-ink-400" htmlFor="ptarget">Take profit</label>
          <input id="ptarget" className={inputCls} inputMode="decimal" placeholder="None" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
      </div>
      <Button size="sm" variant="secondary" className="w-full" disabled={busy || !changed} onClick={update}>Update stop and target</Button>
      <div className="grid grid-cols-3 gap-2">
        {[25, 50].map((p) => (
          <Button key={p} size="sm" variant="ghost" disabled={busy || room < 1} onClick={() => act('increase', { sizePct: Math.min(p, room) })}>+{p}%</Button>
        ))}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act('reduce', { fraction: 0.5 })}>Halve</Button>
      </div>
      <Button className="w-full" variant="danger" disabled={busy} onClick={() => act('close', {})}>Close position</Button>
    </div>
  );
}

export default function LiveMatch({ view, now, apply, ticksSince }) {
  const m = view.match;
  const dp = m.pair?.decimals ?? view.chart?.decimals ?? 2;
  const pairSwitch = usePairSwitch(m);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);

  const me = view.me ?? {};
  const pos = me.position;
  const left = Math.max(0, (new Date(m.endsAt).getTime() - now()) / 1000);
  // Each click carries its own request key, so a double-click or a retried
  // request is one decision; clientTick is the tick this screen was showing.
  const act = (type, payload) => {
    const key = requestKey();
    setBusy(true);
    return fetch(`/api/game/matches/${m.id}/actions`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ type, payload, clientTick: view.tick, ticksSince: ticksSince() }) })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'That didn’t go through. Try again.');
        apply(data);
      })
      .catch((err) => toast(err.message, { tone: 'error' }))
      .finally(() => setBusy(false));
  };

  // Entry, stop and target on the chart. Drag the stop or target line to move it.
  const levels = useMemo(() => {
    if (!pos) return [];
    return [
      { key: 'entry', price: pos.avgPrice, color: CHART_COLORS.accentDeep, label: 'Entry' },
      pos.stop != null && { key: 'stop', price: pos.stop, color: CHART_COLORS.loss, label: 'Stop', dashed: true, draggable: true },
      pos.target != null && { key: 'target', price: pos.target, color: CHART_COLORS.profit, label: 'Target', dashed: true, draggable: true },
    ].filter(Boolean);
  }, [pos?.avgPrice, pos?.stop, pos?.target]); // eslint-disable-line react-hooks/exhaustive-deps
  const onLevelDrag = useCallback((key, value) => (key === 'stop' || key === 'target' ? act('modify', { [key]: value }) : null), [act]);
  const markers = useMemo(() => (me.trades ?? []).flatMap((t) => [...t.entries.map((e) => ({ t: e.tick, price: e.price, kind: t.side === 'long' ? 'buy' : 'sell', who: 'me' })), ...t.exits.map((e) => ({ t: e.tick, price: e.price, kind: 'exit', who: 'me' }))]), [me.trades]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Time left', mmss(left), left < 60 ? 'text-loss-500' : ''],
          ['Price', fmt(view.price, dp), ''],
          ['Your capital', `${virtual(me.equity)} (${pct(me.returnPct)})`, me.returnPct >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500'],
          view.opponent ? ['Opponent', `${pct(view.opponent.returnPct)} · ${view.opponent.trades} trade${view.opponent.trades === 1 ? '' : 's'}`, ''] : ['Mode', 'Practice', ''],
        ].map(([k, v, tone]) => (
          <div key={k} className="rounded-xl border border-ink-100 bg-white px-4 py-3 dark:border-ink-800 dark:bg-ink-900">
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-ink-400">{k === 'Time left' ? <Clock3 className="h-3 w-3" /> : null}{k}</p>
            <p className={clsx('mt-1 text-lg font-semibold tabular-nums text-ink-900 dark:text-ink-50', tone)}>{v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-1.5">
          <KotkaChart matchId={m.id} info={view.chart} pair={m.pair} feed={view.ticks} feedEpoch={view.feedEpoch} durationSec={m.durationSec} defaultTf={m.candleSec} levels={levels} markers={markers} onLevelDrag={onLevelDrag} height={620} {...pairSwitch} />
          {pos?.stop != null || pos?.target != null ? <p className="px-1 text-[11px] text-ink-400">Drag your stop or target line on the chart to move it.</p> : null}
        </div>
        <Card>
          <CardHeader title={pos ? 'Your position' : 'New position'} subtitle={me.stoppedOut ? 'Your capital hit the floor, so no new positions this match.' : `Virtual capital only. Up to ${m.rules.maxLeverage}×.`} />
          <CardBody>
            {me.stoppedOut && !pos ? (
              <p className="text-sm text-ink-500 dark:text-ink-400">You can keep watching; your score is based on what you’ve done so far.</p>
            ) : pos ? (
              <PositionPanel pos={pos} dp={dp} rules={m.rules} busy={busy} act={act} />
            ) : (
              <OrderTicket price={view.price} dp={dp} equity={me.equity} rules={m.rules} busy={busy} onOpen={(payload) => act('open', payload)} />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Your decisions" subtitle="Everything you do is recorded for scoring and the replay." />
        <CardBody>
          {me.log?.length ? (
            <ol className="space-y-1.5 text-sm">
              {[...me.log].reverse().map((e, i) => (
                <li key={`${e.tick}-${i}`} className="flex gap-3">
                  <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-ink-400">{mmss(e.tick)}</span>
                  <span className="text-ink-700 dark:text-ink-200">{e.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-500 dark:text-ink-400">Nothing yet. Read the chart, form a view, and trade when you have a reason. Waiting is a decision too.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
