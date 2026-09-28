import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Trophy, RefreshCw, Pause, Play, Lightbulb, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { api } from '../../lib/api';
import { toast } from '../../lib/dialogs';
import GameChart from './GameChart';
import { naira, pct, mmss, SUBSCORES, OUTCOME_LABEL, virtual } from './format';

function Bar({ value, tone }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
      <div className={clsx('h-full rounded-full', tone === 'them' ? 'bg-[#2a78d6]' : 'bg-accent-500')} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </div>
  );
}

function headline(me, m) {
  if (me.outcome === 'practice') return ['Practice complete', 'No stake. Your score and lessons are below.'];
  if (me.outcome === 'refund') return ['Stakes returned', `Neither of you traded, so ${naira(me.payoutKobo)} went back to your balance with no fee.`];
  if (me.outcome === 'draw') return ['Draw', `Your scores were within ${m.rules.drawTolerance} point${m.rules.drawTolerance === 1 ? '' : 's'}. ${naira(me.payoutKobo)} went to your balance.`];
  if (me.outcome === 'win') return ['You won', `${naira(me.payoutKobo)} went to your balance (the ${naira(m.poolKobo)} pool less Kotka’s ${naira(m.feeKobo)} fee).`];
  return ['You lost', `Your ${naira(m.stakeKobo)} stake went to the prize pool.`];
}

export default function MatchResult({ view }) {
  const navigate = useNavigate();
  const m = view.match;
  const r = view.report;
  const me = r.players.find((p) => p.userId === r.viewerId) ?? r.players[0];
  const them = r.players.find((p) => p.userId !== me.userId);
  const L = me.report?.learning ?? {};
  const [title, sub] = headline(me, m);
  const [busy, setBusy] = useState(false);

  // Replay: reveal the match second by second.
  const all = view.candles ?? [];
  const [at, setAt] = useState(m.durationSec - 1);
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState(null);
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => setAt((x) => (x >= m.durationSec - 1 ? (setPlaying(false), x) : x + m.candleSec)), 120);
    return () => clearInterval(t);
  }, [playing, m.durationSec, m.candleSec]);
  const shown = useMemo(() => all.filter((c) => c.t <= at), [all, at]);
  const markers = useMemo(() => {
    const out = [];
    for (const [p, who] of [[me, 'me'], [them, 'them']]) {
      for (const t of p?.report?.trades ?? []) {
        for (const e of t.entries) if (e.tick <= at) out.push({ t: e.tick, price: e.price, kind: t.side === 'long' ? 'buy' : 'sell', who });
        for (const e of t.exits) if (e.tick <= at) out.push({ t: e.tick, price: e.price, kind: 'exit', who });
      }
    }
    return out;
  }, [me, them, at]);

  const rematch = async () => {
    setBusy(true);
    try {
      const x = await api.post(`/game/matches/${m.id}/rematch`);
      navigate(`/app/game/matches/${x.match.id}`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
      setBusy(false);
    }
  };

  const metrics = [
    ['Return', pct(me.returnPct)],
    ['Largest drawdown', `${(me.maxDrawdownPct ?? 0).toFixed(2)}%`],
    ['Trades', me.report?.metrics?.trades ?? 0],
    ['Average risk per trade', me.report?.metrics?.avgRiskPct != null ? `${me.report.metrics.avgRiskPct}%` : 'No stops'],
    ['Final capital', virtual(me.finalEquity)],
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className={clsx('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', me.outcome === 'win' ? 'bg-accent-500/15 text-accent-600' : 'bg-ink-100 text-ink-500 dark:bg-ink-800')}>
              <Trophy className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-400">{r.market.name} · {r.market.code}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">{title}</h1>
              <p className="mt-1 max-w-xl text-sm text-ink-500 dark:text-ink-400">{sub}</p>
              {me.xpAwarded ? <p className="mt-1 text-xs text-ink-400">+{me.xpAwarded} XP</p> : null}
            </div>
          </div>
          <div className="flex gap-2">
            <Button icon={RefreshCw} onClick={rematch} disabled={busy}>{m.mode === 'practice' ? 'Practise again' : 'Rematch'}</Button>
            <Button as={Link} to="/app/game" variant="secondary">Done</Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Kotka Performance Score" subtitle="Outcome and process together. The same trade made with less discipline scores lower." />
          <CardBody className="space-y-5">
            <div className={clsx('grid gap-4', them ? 'grid-cols-2' : 'grid-cols-1')}>
              {[me, them].filter(Boolean).map((p, i) => (
                <div key={p.userId}>
                  <p className="text-xs text-ink-400">{i === 0 ? 'You' : p.person?.name ?? 'Opponent'} · {OUTCOME_LABEL[p.outcome]}</p>
                  <p className="text-4xl font-semibold tabular-nums tracking-tight text-ink-900 dark:text-ink-50">{p.score?.toFixed(1)}</p>
                  <p className="text-xs text-ink-400">{pct(p.returnPct)} return</p>
                </div>
              ))}
            </div>
            <ul className="space-y-3">
              {SUBSCORES.map(([k, label]) => (
                <li key={k}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-ink-600 dark:text-ink-300">{label} <span className="text-ink-400">({m.rules.weights?.[k]}%)</span></span>
                    <span className="tabular-nums text-ink-700 dark:text-ink-200">{me.subscores?.[k]}{them ? <span className="text-ink-400"> vs {them.subscores?.[k]}</span> : null}</span>
                  </div>
                  <Bar value={me.subscores?.[k]} />
                  {them ? <div className="mt-1"><Bar value={them.subscores?.[k]} tone="them" /></div> : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Your numbers" />
          <CardBody>
            <dl className="space-y-3">
              {metrics.map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <dt className="text-ink-500 dark:text-ink-400">{k}</dt>
                  <dd className="tabular-nums text-ink-800 dark:text-ink-100">{v}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="What this match shows" subtitle={L.summary} />
        <CardBody className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900 dark:text-ink-50"><CheckCircle2 className="h-4 w-4 text-profit-600" /> What you did well</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-600 dark:text-ink-300">{(L.didWell ?? []).map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900 dark:text-ink-50"><AlertTriangle className="h-4 w-4 text-loss-500" /> What hurt your performance</h3>
            {L.hurt?.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-600 dark:text-ink-300">{L.hurt.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">Nothing stood out.</p>}
          </div>
          {[
            ['Risk lesson', L.riskLesson],
            [`This market: ${L.scenarioName ?? r.market.name}`, L.marketLesson],
            ['Pattern in your trading', L.behaviour],
            ['Practise next', L.practice],
          ].map(([k, v]) => (v ? (
            <div key={k}>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900 dark:text-ink-50"><Lightbulb className="h-4 w-4 text-accent-600" /> {k}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{v}</p>
            </div>
          ) : null))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Replay" subtitle="The whole market, with your trades (gold) and your opponent’s (blue)." action={<Badge tone="neutral">Seed {r.market.seed}</Badge>} />
        <CardBody className="space-y-4">
          <GameChart candles={shown.length ? shown : all} candleSec={m.candleSec} show={{ ma20: true, ma50: true, volume: true, rsi: true }} markers={markers} highlightT={focus} height={440} />
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" icon={playing ? Pause : Play} onClick={() => { if (!playing && at >= m.durationSec - 1) setAt(0); setPlaying((p) => !p); }}>{playing ? 'Pause' : 'Play'}</Button>
            <input type="range" min={0} max={m.durationSec - 1} step={m.candleSec} value={at} onChange={(e) => { setPlaying(false); setAt(Number(e.target.value)); }} aria-label="Replay position" className="w-full accent-[#D1A85B]" />
            <span className="w-14 text-right font-mono text-xs tabular-nums text-ink-400">{mmss(at)}</span>
          </div>
          <ol className="divide-y divide-ink-100 text-sm dark:divide-ink-800">
            {(me.report?.decisionPoints ?? []).map((d, i) => (
              <li key={i}>
                <button type="button" onClick={() => { setPlaying(false); setAt(Math.min(m.durationSec - 1, d.tick + m.candleSec * 6)); setFocus(d.tick); }} className="flex w-full gap-3 py-2 text-left hover:bg-ink-50 dark:hover:bg-ink-800/40">
                  <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-ink-400">{mmss(d.tick)}</span>
                  <span className={clsx(d.market ? 'text-ink-500 dark:text-ink-400' : 'text-ink-700 dark:text-ink-200')}>{d.market ? `Market: ${d.text}` : d.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
