import { getPlotGeometry, indexToPixelX } from './chartGeometry';
import { FIB_LEVELS } from './theme';

function project(point, geometry, range, containerRect, scale) {
  return {
    x: indexToPixelX(point.index, geometry, range, containerRect),
    y: scale(point.price),
  };
}

function TrendlineShape({ p1, p2, color, isPending }) {
  return (
    <g opacity={isPending ? 0.6 : 1}>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={1.5} strokeDasharray={isPending ? '4 3' : undefined} />
      <circle cx={p1.x} cy={p1.y} r={3} fill={color} />
      <circle cx={p2.x} cy={p2.y} r={3} fill={color} />
    </g>
  );
}

function RayShape({ p1, width, color, isPending }) {
  return (
    <g opacity={isPending ? 0.6 : 1}>
      <line x1={p1.x} y1={p1.y} x2={width} y2={p1.y} stroke={color} strokeWidth={1.5} strokeDasharray={isPending ? '4 3' : undefined} />
      <circle cx={p1.x} cy={p1.y} r={3} fill={color} />
    </g>
  );
}

function FibShape({ points, geometry, range, containerRect, scale, color, isPending }) {
  const [d1, d2] = points;
  const p1 = project(d1, geometry, range, containerRect, scale);
  const p2 = project(d2, geometry, range, containerRect, scale);
  const xStart = Math.min(p1.x, p2.x);
  const xEnd = Math.max(p1.x, p2.x);

  return (
    <g opacity={isPending ? 0.6 : 1}>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={1} strokeDasharray="2 2" />
      {FIB_LEVELS.map((level) => {
        const price = d1.price + (d2.price - d1.price) * level;
        const y = scale(price);
        return (
          <g key={level}>
            <line x1={xStart} y1={y} x2={xEnd} y2={y} stroke={color} strokeWidth={1} strokeDasharray={isPending ? '4 3' : undefined} />
            <text x={xEnd + 4} y={y} fontSize={9} fill={color} dominantBaseline="middle">
              {(level * 100).toFixed(1)}% {price.toLocaleString(undefined, { maximumFractionDigits: 5 })}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function MeasureShape({ p1, p2, d1, d2, color, upColor, downColor, isPending }) {
  const priceChange = d2.price - d1.price;
  const pctChange = (priceChange / d1.price) * 100;
  const candleSpan = Math.round(Math.abs(d2.index - d1.index));
  const positive = priceChange >= 0;
  const lineColor = positive ? upColor : downColor;

  return (
    <g opacity={isPending ? 0.7 : 1}>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={lineColor} strokeWidth={1.5} strokeDasharray="3 3" />
      <circle cx={p1.x} cy={p1.y} r={3} fill={lineColor} />
      <circle cx={p2.x} cy={p2.y} r={3} fill={lineColor} />
      <foreignObject x={p2.x + 8} y={p2.y - 12} width={180} height={28}>
        <div className="w-fit rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: lineColor }}>
          {positive ? '+' : ''}
          {priceChange.toLocaleString(undefined, { maximumFractionDigits: 5 })} ({pctChange.toFixed(2)}%) · {candleSpan} candles
        </div>
      </foreignObject>
    </g>
  );
}

export default function DrawingsOverlay({ width, height, palette, containerRef, chartRef, range, yAxisWidth, margin, drawings, pendingDrawing }) {
  const geometry = getPlotGeometry(containerRef, yAxisWidth, margin);
  const container = containerRef.current;
  const scale = chartRef.current?.getYScaleByAxisId?.(0);
  if (!geometry || !container || !scale || typeof scale !== 'function') return null;

  const containerRect = container.getBoundingClientRect();
  const allDrawings = pendingDrawing ? [...drawings, pendingDrawing] : drawings;
  if (!allDrawings.length) return null;

  return (
    <svg width={width} height={height} className="pointer-events-none absolute left-0 top-0">
      {allDrawings.map((d) => {
        const isPending = !!d.isPending;
        const color = palette.crosshair;
        if (d.type === 'trendline' && d.points.length === 2) {
          const p1 = project(d.points[0], geometry, range, containerRect, scale);
          const p2 = project(d.points[1], geometry, range, containerRect, scale);
          return <TrendlineShape key={d.id} p1={p1} p2={p2} color={color} isPending={isPending} />;
        }
        if (d.type === 'ray' && d.points.length >= 1) {
          const p1 = project(d.points[0], geometry, range, containerRect, scale);
          return <RayShape key={d.id} p1={p1} width={containerRect.width} color={color} isPending={isPending} />;
        }
        if (d.type === 'fib' && d.points.length === 2) {
          return <FibShape key={d.id} points={d.points} geometry={geometry} range={range} containerRect={containerRect} scale={scale} color={color} isPending={isPending} />;
        }
        if (d.type === 'measure' && d.points.length === 2) {
          const p1 = project(d.points[0], geometry, range, containerRect, scale);
          const p2 = project(d.points[1], geometry, range, containerRect, scale);
          return <MeasureShape key={d.id} p1={p1} p2={p2} d1={d.points[0]} d2={d.points[1]} color={color} upColor={palette.up} downColor={palette.down} isPending={isPending} />;
        }
        return null;
      })}
    </svg>
  );
}
