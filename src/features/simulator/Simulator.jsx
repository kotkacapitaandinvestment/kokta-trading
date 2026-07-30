import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { api } from '../../lib/api';
import SymbolPicker from './components/SymbolPicker';
import CandlestickChart from '../../components/charts/CandlestickChart';
import OrderTicket from './components/OrderTicket';
import TradeLog from './components/TradeLog';
import SessionSummary from './components/SessionSummary';

const STEP_INTERVAL_MS = 800;

export default function Simulator() {
  const [session, setSession] = useState(null);
  const [trades, setTrades] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(null);
  const [extendedBars, setExtendedBars] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExhausted, setHistoryExhausted] = useState(false);
  const [smaEnabled, setSmaEnabled] = useState(false);
  const [emaEnabled, setEmaEnabled] = useState(false);
  const [rsiEnabled, setRsiEnabled] = useState(false);

  const sessionRef = useRef(session);
  const advancingRef = useRef(false);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const startSession = (symbol) => {
    setError(null);
    api
      .post('/simulator/sessions', { symbol })
      .then(({ session: s }) => {
        setSession(s);
        setTrades([]);
      })
      .catch((err) => setError(err.message));
  };

  const newSession = () => {
    setSession(null);
    setTrades([]);
    setPlaying(false);
    setError(null);
    setExtendedBars([]);
    setHistoryLoading(false);
    setHistoryExhausted(false);
  };

  const requestMoreHistory = useCallback(
    (beforeTimestamp) => {
      const current = sessionRef.current;
      if (!current || historyLoading || historyExhausted) return;
      setHistoryLoading(true);
      api
        .post(`/simulator/sessions/${current.id}/extend-history`, { before: new Date(beforeTimestamp).toISOString() })
        .then(({ bars: older, exhausted }) => {
          if (exhausted || !older.length) {
            setHistoryExhausted(true);
            return;
          }
          setExtendedBars((prev) => [...older, ...prev]);
        })
        .catch(() => setHistoryExhausted(true))
        .finally(() => setHistoryLoading(false));
    },
    [historyLoading, historyExhausted],
  );

  const advanceOneStep = () => {
    const current = sessionRef.current;
    if (!current || current.status !== 'active' || advancingRef.current) return Promise.resolve();
    advancingRef.current = true;
    return api
      .post(`/simulator/sessions/${current.id}/advance`, { steps: 1 })
      .then((data) => {
        setSession((prev) => (prev ? { ...prev, cursor: data.cursor, balance: data.balance, status: data.status, bars: [...prev.bars, ...data.newBars] } : prev));
        if (data.closedTrades?.length) {
          setTrades((prev) => prev.map((t) => data.closedTrades.find((c) => c.id === t.id) ?? t));
        }
        if (data.status === 'completed') setPlaying(false);
      })
      .catch((err) => {
        setError(err.message);
        setPlaying(false);
      })
      .finally(() => {
        advancingRef.current = false;
      });
  };

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(advanceOneStep, STEP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [playing]);

  const placeTrade = (order) => {
    setError(null);
    api
      .post(`/simulator/sessions/${session.id}/trades`, order)
      .then(({ trade }) => setTrades((prev) => [...prev, trade]))
      .catch((err) => setError(err.message));
  };

  const closeOpenTrade = () => {
    const openTrade = trades.find((t) => t.status === 'open');
    if (!openTrade) return;
    api
      .post(`/simulator/sessions/${session.id}/trades/${openTrade.id}/close`)
      .then(({ trade }) => {
        setTrades((prev) => prev.map((t) => (t.id === trade.id ? trade : t)));
        setSession((prev) => (prev ? { ...prev, balance: prev.balance + trade.pnl } : prev));
      })
      .catch((err) => setError(err.message));
  };

  const openTrade = trades.find((t) => t.status === 'open') ?? null;
  const closedTrades = trades.filter((t) => t.status === 'closed');
  const currentBar = session?.bars?.[session.bars.length - 1];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Practice"
        title="Trading Simulator"
        description="Practice real historical price action. Place a trade, play through real candles, and see how it plays out — no fake scenarios, no fake scores."
      />

      {error ? (
        <Card className="border-loss-200 bg-loss-50 p-4 text-sm text-loss-600 dark:border-loss-500/30 dark:bg-loss-500/10 dark:text-loss-400">{error}</Card>
      ) : null}

      {!session ? (
        <SymbolPicker onSelect={startSession} />
      ) : session.status === 'completed' ? (
        <SessionSummary session={session} trades={trades} onNewSession={newSession} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title={session.symbol}
              subtitle={`Balance: $${session.balance.toFixed(2)}`}
              action={
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" icon={SkipForward} onClick={advanceOneStep} disabled={playing}>
                    Step
                  </Button>
                  <Button variant={playing ? 'secondary' : 'primary'} size="sm" icon={playing ? Pause : Play} onClick={() => setPlaying((p) => !p)}>
                    {playing ? 'Pause' : 'Play'}
                  </Button>
                  <Button variant="ghost" size="sm" icon={RotateCcw} onClick={newSession}>
                    New session
                  </Button>
                </div>
              }
            />
            <CardBody>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {[
                  { label: 'SMA 20', enabled: smaEnabled, toggle: () => setSmaEnabled((v) => !v) },
                  { label: 'EMA 50', enabled: emaEnabled, toggle: () => setEmaEnabled((v) => !v) },
                  { label: 'RSI 14', enabled: rsiEnabled, toggle: () => setRsiEnabled((v) => !v) },
                ].map((ind) => (
                  <button
                    key={ind.label}
                    type="button"
                    onClick={ind.toggle}
                    className={clsx(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      ind.enabled
                        ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300'
                        : 'border-ink-200 text-ink-500 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-400 dark:hover:bg-ink-800',
                    )}
                  >
                    {ind.label}
                  </button>
                ))}
              </div>
              <CandlestickChart
                bars={session.bars}
                entryPrice={openTrade?.entryPrice}
                entryBarIndex={openTrade?.entryBarIndex}
                stopLoss={openTrade?.stopLoss}
                takeProfit={openTrade?.takeProfit}
                theme="terminal"
                crosshair
                volume
                zoomPan
                initialVisibleBars={60}
                height={420}
                extendedBars={extendedBars}
                onRequestHistory={requestMoreHistory}
                historyLoading={historyLoading}
                historyExhausted={historyExhausted}
                drawingTools
                indicators={[
                  ...(smaEnabled ? [{ type: 'sma', period: 20 }] : []),
                  ...(emaEnabled ? [{ type: 'ema', period: 50 }] : []),
                ]}
                rsi={rsiEnabled ? { period: 14 } : false}
              />
            </CardBody>
          </Card>

          <div className="space-y-6">
            <OrderTicket currentPrice={currentBar?.c} disabled={!!openTrade} onSubmit={placeTrade} />
          </div>

          <div className="lg:col-span-3">
            <TradeLog openTrade={openTrade} closedTrades={closedTrades} currentPrice={currentBar?.c} onCloseTrade={closeOpenTrade} />
          </div>
        </div>
      )}
    </div>
  );
}
