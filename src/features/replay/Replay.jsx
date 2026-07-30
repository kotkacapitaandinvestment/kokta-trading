import { useEffect, useState } from 'react';
import { Play, Pause, Sparkles } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import CandlestickChart from '../../components/charts/CandlestickChart';
import { api } from '../../lib/api';

const STARTING_BARS = 30;

export default function Replay() {
  const [entries, setEntries] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [step, setStep] = useState(STARTING_BARS);
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState('');
  const [replayCache, setReplayCache] = useState({});
  const [critiqueCache, setCritiqueCache] = useState({});

  useEffect(() => {
    api.get('/journal').then(({ entries: e }) => {
      setEntries(e);
      if (e.length) setSelectedId(e[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setPlaying(false);
    if (!replayCache[selectedId]) {
      api.get(`/journal/${selectedId}/replay`).then((data) => {
        setReplayCache((prev) => ({ ...prev, [selectedId]: data }));
        setStep(Math.min(STARTING_BARS, data.bars?.length ?? STARTING_BARS));
      });
    } else {
      setStep(Math.min(STARTING_BARS, replayCache[selectedId].bars?.length ?? STARTING_BARS));
    }
    if (!critiqueCache[selectedId]) {
      setCritiqueCache((prev) => ({ ...prev, [selectedId]: { loading: true } }));
      api.post(`/journal/${selectedId}/critique`).then((data) => {
        setCritiqueCache((prev) => ({ ...prev, [selectedId]: { loading: false, ...data } }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const replay = selectedId ? replayCache[selectedId] : null;
  const critique = selectedId ? critiqueCache[selectedId] : null;
  const bars = replay?.bars ?? [];

  useEffect(() => {
    if (!playing) return;
    if (step >= bars.length) { setPlaying(false); return; }
    const id = setTimeout(() => setStep((s) => Math.min(bars.length, s + 1)), 150);
    return () => clearTimeout(id);
  }, [playing, step, bars.length]);

  if (!entries) return null;

  const entry = entries.find((e) => e.id === selectedId) ?? entries[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Premium · Review"
        title="Replay Engine"
        description="Step through your real logged trades against real historical price data. Annotate your reasoning. Let Kotka AI critique the execution."
      />

      {!entries.length ? (
        <Card className="p-6 text-sm text-ink-400">Log a trade in the Journal to unlock Replay.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader title="Select a trade" />
            <CardBody className="space-y-1">
              {entries.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${selectedId === e.id ? 'bg-ink-100 dark:bg-ink-800' : 'hover:bg-ink-50 dark:hover:bg-ink-800/60'}`}
                >
                  <span>
                    <span className="font-medium text-ink-800 dark:text-ink-100">{e.market}</span>
                    <span className="ml-2 text-xs text-ink-400">{e.date}</span>
                  </span>
                  <Badge tone={e.result === 'win' ? 'profit' : e.result === 'loss' ? 'loss' : 'neutral'}>{e.result ?? 'open'}</Badge>
                </button>
              ))}
            </CardBody>
          </Card>

          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader
                title={`${entry.market} · ${entry.direction}`}
                subtitle={`${entry.strategy} · ${entry.session} session`}
                action={replay ? (replay.live ? <Badge tone="profit">Live</Badge> : <Badge tone="warning">Not available</Badge>) : null}
              />
              <CardBody>
                {!replay ? (
                  <div className="flex h-48 items-center justify-center text-sm text-ink-400">Loading real price data…</div>
                ) : !replay.live ? (
                  <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl bg-ink-50 text-center text-sm text-ink-400 dark:bg-ink-800">
                    <p>
                      {replay.reason === 'unsupported_market'
                        ? `Real replay isn't available for ${entry.market} yet.`
                        : "Couldn't fetch real price data for this trade."}
                    </p>
                    <p className="text-xs">Supported markets: EUR/USD, GBP/USD, GBP/JPY, XAU/USD, NAS100, BTC/USD.</p>
                  </div>
                ) : (
                  <>
                    <CandlestickChart
                      bars={bars.slice(0, step)}
                      entryPrice={entry.entry}
                      stopLoss={entry.stopLoss}
                      takeProfit={entry.takeProfit}
                    />
                    <p className="mt-1 text-xs text-ink-400">
                      Real price data for this trading day. The exact entry candle isn't marked — journal entries record a date, not an entry time.
                    </p>
                    <input
                      type="range"
                      min="2"
                      max={bars.length}
                      value={step}
                      onChange={(e) => setStep(Number(e.target.value))}
                      className="mt-2 w-full accent-ink-900"
                    />
                    <div className="mt-3 flex items-center gap-2">
                      <Button size="sm" variant="secondary" icon={playing ? Pause : Play} onClick={() => setPlaying((p) => !p)}>
                        {playing ? 'Pause' : 'Play'}
                      </Button>
                      <span className="text-xs text-ink-400">Candle {step} of {bars.length}</span>
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Your annotation" />
              <CardBody>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="What were you thinking at this point in the trade?"
                  className="w-full resize-none rounded-lg border border-ink-200 bg-white p-3 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
                />
              </CardBody>
            </Card>

            <Card className="border-accent-100 bg-accent-50/50 dark:border-accent-900/30 dark:bg-accent-900/10">
              <CardHeader
                title="Kotka AI Critique"
                action={<Sparkles className="mt-0.5 h-4 w-4 text-accent-500" />}
              />
              <CardBody>
                {!critique || critique.loading ? (
                  <p className="text-sm text-ink-400">Kotka is reviewing this trade…</p>
                ) : (
                  <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{critique.critique}</p>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
