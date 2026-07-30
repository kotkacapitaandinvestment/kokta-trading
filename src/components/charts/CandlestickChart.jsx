import { useMemo, useRef } from 'react';
import { ComposedChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceLine, ReferenceDot, Tooltip, CartesianGrid } from 'recharts';
import { CHART_THEMES, MARGIN, Y_AXIS_WIDTH, formatTime } from './candlestick/theme';
import { useChartZoomPan } from './candlestick/useChartZoomPan';
import { useChartCrosshair } from './candlestick/useChartCrosshair';
import VolumePane from './candlestick/VolumePane';
import CrosshairOverlay from './candlestick/CrosshairOverlay';

function makeCandlestickShape(palette) {
  return function CandlestickShape(props) {
    const { x, y, width, height, payload } = props;
    const { o, h, l, c } = payload;
    if (h === l) return null;

    const scale = height / (h - l);
    const bodyTop = y + (h - Math.max(o, c)) * scale;
    const bodyBottom = y + (h - Math.min(o, c)) * scale;
    const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
    const isUp = c >= o;
    const color = isUp ? palette.up : palette.down;
    const bodyWidth = Math.max(width * 0.6, 1);
    const bodyX = x + (width - bodyWidth) / 2;
    const wickX = x + width / 2;

    return (
      <g>
        <line x1={wickX} x2={wickX} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
        <rect x={bodyX} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
      </g>
    );
  };
}

function makeChartTooltip(palette) {
  return function ChartTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const bar = payload[0].payload;
    return (
      <div className={`rounded-lg px-3 py-2 text-xs shadow-card ${palette.tooltipClassName}`}>
        <p className="mb-1 font-medium opacity-70">{formatTime(bar.t)}</p>
        <p>O {bar.o} · H {bar.h} · L {bar.l} · C {bar.c}</p>
      </div>
    );
  };
}

function buildTicks(data, tickCount = 6) {
  if (!data.length) return [];
  const step = Math.max(1, Math.floor(data.length / tickCount));
  const ticks = [];
  for (let i = 0; i < data.length; i += step) ticks.push(data[i].x);
  if (ticks[ticks.length - 1] !== data[data.length - 1].x) ticks.push(data[data.length - 1].x);
  return ticks;
}

export default function CandlestickChart({
  bars,
  entryPrice,
  entryBarIndex,
  stopLoss,
  takeProfit,
  height = 288,
  theme = 'app',
  crosshair = false,
  volume = false,
  volumeHeight = 72,
  zoomPan = false,
  initialVisibleBars = 60,
  minVisibleBars = 10,
}) {
  const palette = CHART_THEMES[theme] ?? CHART_THEMES.app;
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  const { range, dragHandlers } = useChartZoomPan({
    totalBars: bars.length,
    containerRef,
    enabled: zoomPan,
    initialVisibleBars,
    minVisibleBars,
    yAxisWidth: Y_AXIS_WIDTH,
    margin: MARGIN,
  });

  const { hover, onMouseMove, onMouseLeave } = useChartCrosshair({ enabled: crosshair, chartRef });

  const visibleBars = useMemo(() => bars.slice(range.start, range.end), [bars, range.start, range.end]);
  const data = useMemo(
    () =>
      visibleBars.map((b, i) => ({
        x: range.start + i,
        t: b.t,
        o: b.o,
        h: b.h,
        l: b.l,
        c: b.c,
        v: b.v,
        range: [b.l, b.h],
        isUp: b.c >= b.o,
      })),
    [visibleBars, range.start],
  );

  const xTicks = useMemo(() => buildTicks(data), [data]);

  const yValues = visibleBars.flatMap((b) => [b.h, b.l, stopLoss, takeProfit, entryPrice].filter((v) => typeof v === 'number'));
  const yMin = yValues.length ? Math.min(...yValues) : 0;
  const yMax = yValues.length ? Math.max(...yValues) : 1;
  const pad = (yMax - yMin) * 0.05 || 1;

  const CandlestickShape = useMemo(() => makeCandlestickShape(palette), [palette]);
  const ChartTooltip = useMemo(() => makeChartTooltip(palette), [palette]);

  const xAxisProps = {
    dataKey: 'x',
    type: 'number',
    domain: [range.start, Math.max(range.start, range.end - 1)],
    ticks: xTicks,
    tickFormatter: (value) => {
      const bar = data.find((d) => d.x === value);
      return bar ? formatTime(bar.t) : '';
    },
    tick: { fontSize: 10, fill: palette.axisText },
  };

  return (
    <div style={palette.bg ? { background: palette.bg, borderRadius: 12, padding: 8 } : undefined}>
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height, cursor: zoomPan ? 'grab' : undefined }}
        onMouseDown={dragHandlers.onMouseDown}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart ref={chartRef} data={data} margin={MARGIN} syncId={volume ? 'kotka-candlestick' : undefined} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
            {palette.grid ? <CartesianGrid stroke={palette.grid} /> : null}
            <XAxis {...xAxisProps} tick={volume ? false : xAxisProps.tick} />
            <YAxis
              domain={[yMin - pad, yMax + pad]}
              tick={{ fontSize: 10, fill: palette.axisText }}
              width={Y_AXIS_WIDTH}
              tickFormatter={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            />
            {!crosshair ? <Tooltip content={<ChartTooltip />} /> : <Tooltip content={() => null} cursor={false} />}
            <Bar dataKey="range" shape={CandlestickShape} isAnimationActive={false} />
            {typeof stopLoss === 'number' ? <ReferenceLine y={stopLoss} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'SL', position: 'insideTopLeft', fontSize: 10, fill: '#ef4444' }} /> : null}
            {typeof takeProfit === 'number' ? <ReferenceLine y={takeProfit} stroke="#16a34a" strokeDasharray="4 4" label={{ value: 'TP', position: 'insideTopLeft', fontSize: 10, fill: '#16a34a' }} /> : null}
            {typeof entryPrice === 'number' ? <ReferenceLine y={entryPrice} stroke="#64748b" strokeDasharray="2 2" label={{ value: 'Entry', position: 'insideTopLeft', fontSize: 10, fill: '#64748b' }} /> : null}
            {typeof entryPrice === 'number' && typeof entryBarIndex === 'number' ? (
              <ReferenceDot x={entryBarIndex} y={entryPrice} r={4} fill="#64748b" stroke="none" />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
        {crosshair ? <CrosshairOverlay hover={hover} width="100%" height={height} showHorizontal palette={palette} /> : null}
      </div>

      {volume ? (
        <VolumePane
          data={data}
          height={volumeHeight}
          palette={palette}
          syncId="kotka-candlestick"
          crosshairEnabled={crosshair}
          hover={hover}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
        />
      ) : null}
    </div>
  );
}
