import { ComposedChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceLine, ReferenceDot, Tooltip } from 'recharts';

function formatTime(t) {
  const d = new Date(t);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function CandlestickShape(props) {
  const { x, y, width, height, payload } = props;
  const { o, h, l, c } = payload;
  if (h === l) return null;

  const scale = height / (h - l);
  const bodyTop = y + (h - Math.max(o, c)) * scale;
  const bodyBottom = y + (h - Math.min(o, c)) * scale;
  const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
  const isUp = c >= o;
  const color = isUp ? '#16a34a' : '#ef4444';
  const bodyWidth = Math.max(width * 0.6, 1);
  const bodyX = x + (width - bodyWidth) / 2;
  const wickX = x + width / 2;

  return (
    <g>
      <line x1={wickX} x2={wickX} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={bodyX} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
    </g>
  );
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const bar = payload[0].payload;
  return (
    <div className="rounded-lg border border-ink-100 bg-white px-3 py-2 text-xs shadow-card dark:border-ink-800 dark:bg-ink-900">
      <p className="mb-1 font-medium text-ink-500 dark:text-ink-400">{formatTime(bar.t)}</p>
      <p className="text-ink-800 dark:text-ink-100">O {bar.o} · H {bar.h} · L {bar.l} · C {bar.c}</p>
    </div>
  );
}

export default function CandlestickChart({ bars, entryPrice, entryBarIndex, stopLoss, takeProfit }) {
  const data = bars.map((b, i) => ({ x: i, t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, range: [b.l, b.h] }));
  const yValues = bars.flatMap((b) => [b.h, b.l, stopLoss, takeProfit, entryPrice].filter((v) => typeof v === 'number'));
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const pad = (yMax - yMin) * 0.05 || 1;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="x" tickFormatter={(i) => formatTime(data[i]?.t)} tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={40} />
          <YAxis domain={[yMin - pad, yMax + pad]} tick={{ fontSize: 10 }} width={70} tickFormatter={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 4 })} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="range" shape={CandlestickShape} isAnimationActive={false} />
          {typeof stopLoss === 'number' ? <ReferenceLine y={stopLoss} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'SL', position: 'insideTopLeft', fontSize: 10, fill: '#ef4444' }} /> : null}
          {typeof takeProfit === 'number' ? <ReferenceLine y={takeProfit} stroke="#16a34a" strokeDasharray="4 4" label={{ value: 'TP', position: 'insideTopLeft', fontSize: 10, fill: '#16a34a' }} /> : null}
          {typeof entryPrice === 'number' ? <ReferenceLine y={entryPrice} stroke="#64748b" strokeDasharray="2 2" label={{ value: 'Entry', position: 'insideTopLeft', fontSize: 10, fill: '#64748b' }} /> : null}
          {typeof entryPrice === 'number' && typeof entryBarIndex === 'number' ? (
            <ReferenceDot x={entryBarIndex} y={entryPrice} r={4} fill="#64748b" stroke="none" />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
