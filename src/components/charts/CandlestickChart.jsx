import { useEffect, useMemo, useRef } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, ReferenceDot, Tooltip, CartesianGrid } from 'recharts';
import { CHART_THEMES, MARGIN, Y_AXIS_WIDTH, INDICATOR_COLORS, formatTime } from './candlestick/theme';
import { useChartZoomPan } from './candlestick/useChartZoomPan';
import { useChartCrosshair } from './candlestick/useChartCrosshair';
import { useChartDrawings } from './candlestick/useChartDrawings';
import { computeSMA, computeEMA, computeRSI } from './candlestick/indicators';
import VolumePane from './candlestick/VolumePane';
import IndicatorPane from './candlestick/IndicatorPane';
import CrosshairOverlay from './candlestick/CrosshairOverlay';
import DrawingsOverlay from './candlestick/DrawingsOverlay';
import DrawingToolbar from './candlestick/DrawingToolbar';

const HISTORY_PREFETCH_THRESHOLD = 15;

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
  extendedBars = [],
  onRequestHistory,
  historyLoading = false,
  historyExhausted = false,
  drawingTools = false,
  indicators = [],
  rsi = false,
}) {
  const palette = CHART_THEMES[theme] ?? CHART_THEMES.app;
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  const minIndex = -extendedBars.length;
  const allBars = useMemo(() => [...extendedBars, ...bars], [extendedBars, bars]);

  const { range, dragHandlers } = useChartZoomPan({
    totalBars: bars.length,
    minIndex,
    containerRef,
    enabled: zoomPan,
    initialVisibleBars,
    minVisibleBars,
    yAxisWidth: Y_AXIS_WIDTH,
    margin: MARGIN,
  });

  const { hover, onMouseMove, onMouseLeave } = useChartCrosshair({ enabled: crosshair, chartRef });

  const { activeTool, setActiveTool, drawings, pendingDrawing, clearAll, drawingHandlers } = useChartDrawings({
    enabled: drawingTools,
    containerRef,
    chartRef,
    range,
    yAxisWidth: Y_AXIS_WIDTH,
    margin: MARGIN,
  });

  const requestedForRef = useRef(null);
  useEffect(() => {
    if (!onRequestHistory || historyLoading || historyExhausted) return;
    if (range.start > minIndex + HISTORY_PREFETCH_THRESHOLD) return;
    if (requestedForRef.current === minIndex) return;
    requestedForRef.current = minIndex;
    const earliestTs = allBars[0]?.t;
    if (earliestTs != null) onRequestHistory(earliestTs);
  }, [range.start, minIndex, historyLoading, historyExhausted, onRequestHistory, allBars]);

  const visibleBars = useMemo(() => allBars.slice(range.start - minIndex, range.end - minIndex), [allBars, range.start, range.end, minIndex]);

  const fullIndicatorSeries = useMemo(() => {
    const series = {};
    for (const ind of indicators) {
      const key = `${ind.type}${ind.period}`;
      series[key] = ind.type === 'ema' ? computeEMA(allBars, ind.period) : computeSMA(allBars, ind.period);
    }
    return series;
  }, [allBars, indicators]);

  const fullRsiSeries = useMemo(() => (rsi ? computeRSI(allBars, rsi.period ?? 14) : null), [allBars, rsi]);

  const data = useMemo(
    () =>
      visibleBars.map((b, i) => {
        const absIndex = range.start + i;
        const seriesIndex = absIndex - minIndex;
        const row = { x: absIndex, t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, range: [b.l, b.h], isUp: b.c >= b.o };
        for (const key of Object.keys(fullIndicatorSeries)) row[key] = fullIndicatorSeries[key][seriesIndex] ?? null;
        if (fullRsiSeries) row.rsi = fullRsiSeries[seriesIndex] ?? null;
        return row;
      }),
    [visibleBars, range.start, minIndex, fullIndicatorSeries, fullRsiSeries],
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

  const hasSubPane = volume || !!rsi;
  const containerOnMouseDown = drawingTools && activeTool !== 'cursor' ? drawingHandlers.onMouseDown : dragHandlers.onMouseDown;
  const showHistoryPill = historyLoading || (historyExhausted && range.start <= minIndex + HISTORY_PREFETCH_THRESHOLD);

  return (
    <div style={palette.bg ? { background: palette.bg, borderRadius: 12, padding: 8 } : undefined}>
      {drawingTools ? (
        <DrawingToolbar activeTool={activeTool} onSelectTool={setActiveTool} onClearAll={clearAll} hasDrawings={drawings.length > 0} palette={palette} />
      ) : null}

      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height, cursor: drawingTools && activeTool !== 'cursor' ? 'crosshair' : zoomPan ? 'grab' : undefined }}
        onMouseDown={containerOnMouseDown}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart ref={chartRef} data={data} margin={MARGIN} syncId={hasSubPane ? 'kotka-candlestick' : undefined} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
            {palette.grid ? <CartesianGrid stroke={palette.grid} /> : null}
            <XAxis {...xAxisProps} tick={hasSubPane ? false : xAxisProps.tick} />
            <YAxis
              domain={[yMin - pad, yMax + pad]}
              tick={{ fontSize: 10, fill: palette.axisText }}
              width={Y_AXIS_WIDTH}
              tickFormatter={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            />
            {!crosshair ? <Tooltip content={<ChartTooltip />} /> : <Tooltip content={() => null} cursor={false} />}
            <Bar dataKey="range" shape={CandlestickShape} isAnimationActive={false} />
            {indicators.map((ind, i) => (
              <Line
                key={`${ind.type}${ind.period}`}
                type="monotone"
                dataKey={`${ind.type}${ind.period}`}
                stroke={INDICATOR_COLORS[i % INDICATOR_COLORS.length]}
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
            {typeof stopLoss === 'number' ? <ReferenceLine y={stopLoss} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'SL', position: 'insideTopLeft', fontSize: 10, fill: '#ef4444' }} /> : null}
            {typeof takeProfit === 'number' ? <ReferenceLine y={takeProfit} stroke="#16a34a" strokeDasharray="4 4" label={{ value: 'TP', position: 'insideTopLeft', fontSize: 10, fill: '#16a34a' }} /> : null}
            {typeof entryPrice === 'number' ? <ReferenceLine y={entryPrice} stroke="#64748b" strokeDasharray="2 2" label={{ value: 'Entry', position: 'insideTopLeft', fontSize: 10, fill: '#64748b' }} /> : null}
            {typeof entryPrice === 'number' && typeof entryBarIndex === 'number' ? (
              <ReferenceDot x={entryBarIndex} y={entryPrice} r={4} fill="#64748b" stroke="none" />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>

        {crosshair ? <CrosshairOverlay hover={hover} width="100%" height={height} showHorizontal palette={palette} /> : null}
        {drawingTools ? (
          <DrawingsOverlay
            width="100%"
            height={height}
            palette={palette}
            containerRef={containerRef}
            chartRef={chartRef}
            range={range}
            yAxisWidth={Y_AXIS_WIDTH}
            margin={MARGIN}
            drawings={drawings}
            pendingDrawing={pendingDrawing}
          />
        ) : null}

        {indicators.length || showHistoryPill ? (
          <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
            {indicators.length ? (
              <div className="flex flex-wrap gap-2 text-[10px] font-medium">
                {indicators.map((ind, i) => (
                  <span key={`${ind.type}${ind.period}`} style={{ color: INDICATOR_COLORS[i % INDICATOR_COLORS.length] }}>
                    {ind.type.toUpperCase()} {ind.period}
                  </span>
                ))}
              </div>
            ) : null}
            {showHistoryPill ? (
              <div className={`w-fit rounded px-2 py-1 text-[10px] font-medium ${palette.tooltipClassName}`}>
                {historyLoading ? 'Loading earlier candles…' : 'Start of available history'}
              </div>
            ) : null}
          </div>
        ) : null}
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

      {rsi ? (
        <IndicatorPane
          data={data}
          height={volumeHeight}
          palette={palette}
          syncId="kotka-candlestick"
          dataKey="rsi"
          color={INDICATOR_COLORS[0]}
          crosshairEnabled={crosshair}
          hover={hover}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
        />
      ) : null}
    </div>
  );
}
