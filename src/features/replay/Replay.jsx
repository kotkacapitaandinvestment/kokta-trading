import { useEffect, useMemo, useState } from 'react';
import { Play, Pause, Sparkles } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { journalEntries } from '../../lib/mockData';

function pathFor(entry, step) {
  const points = 40;
  const dir = entry.direction === 'Long' ? 1 : -1;
  const arr = Array.from({ length: points }, (_, i) => {
    const progress = i / points;
    const noise = Math.sin(i * 1.7) * 4;
    const trend = entry.result === 'loss' ? -progress * 20 * dir : progress * 30 * dir;
    return 50 - trend + noise;
  });
  return arr.slice(0, Math.max(2, step));
}

function toSvgPath(values, width, height) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function critiqueFor(entry) {
  if (entry.result === 'loss') {
    return `Your entry lined up with ${entry.strategy}, but the replay shows price barely displaced before your invalidation was hit. Next time, wait for a retest with rejection rather than entering on the first touch.`;
  }
  return `This is a textbook execution of ${entry.strategy}. Note how patient the entry was relative to the initial reaction — that patience is what separated this from a chase.`;
}

export default function Replay() {
  const [selectedId, setSelectedId] = useState(journalEntries[0]?.id);
  const [step, setStep] = useState(20);
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!playing) return;
    if (step >= 40) { setPlaying(false); return; }
    const id = setTimeout(() => setStep((s) => Math.min(40, s + 1)), 150);
    return () => clearTimeout(id);
  }, [playing, step]);

  const entry = journalEntries.find((e) => e.id === selectedId) ?? journalEntries[0];
  const values = useMemo(() => pathFor(entry, step), [entry, step]);
  const d = toSvgPath(values, 600, 200);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Premium · Review"
        title="Replay Engine"
        description="Step through past trades candle by candle. Annotate your reasoning. Let Kotka AI critique the execution."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Select a trade" />
          <CardBody className="space-y-1">
            {journalEntries.map((e) => (
              <button
                key={e.id}
                onClick={() => { setSelectedId(e.id); setStep(20); setPlaying(false); }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${selectedId === e.id ? 'bg-ink-100 dark:bg-ink-800' : 'hover:bg-ink-50 dark:hover:bg-ink-800/60'}`}
              >
                <span>
                  <span className="font-medium text-ink-800 dark:text-ink-100">{e.market}</span>
                  <span className="ml-2 text-xs text-ink-400">{e.date}</span>
                </span>
                <Badge tone={e.result === 'win' ? 'profit' : 'loss'}>{e.result}</Badge>
              </button>
            ))}
          </CardBody>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title={`${entry.market} · ${entry.direction}`}
              subtitle={`${entry.strategy} · ${entry.session} session`}
            />
            <CardBody>
              <svg viewBox="0 0 600 200" className="h-48 w-full">
                <line x1="0" y1="150" x2="600" y2="150" stroke="#e6e9ef" strokeDasharray="4 4" />
                <path d={d} fill="none" stroke={entry.result === 'loss' ? '#ef4444' : '#10b981'} strokeWidth="2.5" />
              </svg>
              <input
                type="range"
                min="2"
                max="40"
                value={step}
                onChange={(e) => setStep(Number(e.target.value))}
                className="mt-2 w-full accent-ink-900"
              />
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={playing ? Pause : Play}
                  onClick={() => setPlaying((p) => !p)}
                >
                  {playing ? 'Pause' : 'Play'}
                </Button>
                <span className="text-xs text-ink-400">Step {step} of 40</span>
              </div>
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
            <CardHeader title="Kotka AI Critique" action={<Sparkles className="mt-0.5 h-4 w-4 text-accent-500" />} />
            <CardBody>
              <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{critiqueFor(entry)}</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
