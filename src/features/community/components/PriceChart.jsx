import { useEffect, useRef, useState } from 'react';
import { tradingDay } from '../util';

// Axis labels: "21 Jun".
const short = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Daily prices, with a crosshair tooltip. Bars that carry open, high and low
// are drawn as candles: rising days outlined in green with a light body,
// falling days solid red, so the direction doesn't rest on colour alone.
// Close-only history falls back to a line. Narrow screens show the most
// recent days that fit at a readable width (about 4px a candle).
export default function PriceChart({ history, decimals = 4, height = 220 }) {
  const ref = useRef(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  if (!history?.length) return null;
  const candles = history.every((h) => h.o != null && h.h != null && h.l != null);
  const pad = { t: 12, r: 12, b: 24, l: 62 };
  const plotW = w - pad.l - pad.r;
  const bars = candles ? history.slice(-Math.max(20, Math.floor(plotW / 4))) : history;
  const n = bars.length;
  const lows = bars.map((b) => (candles ? b.l : b.c));
  const highs = bars.map((b) => (candles ? b.h : b.c));
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const span = max - min || 1;
  const band = plotW / n;
  // Candles sit in the middle of their slot; a line runs edge to edge.
  const x = (i) => (candles ? pad.l + band * (i + 0.5) : pad.l + (i / Math.max(1, n - 1)) * plotW);
  const y = (v) => pad.t + ((max - v) / span) * (height - pad.t - pad.b);
  const ticks = [max, (max + min) / 2, min];
  const fmt = (v) => Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const body = Math.max(1, Math.min(12, band * 0.62));
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - pad.l;
    const i = candles ? Math.floor(px / band) : Math.round((px / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const hv = hover !== null ? bars[hover] : null;
  const prevClose = hover > 0 ? bars[hover - 1].c : null;
  const change = hv && prevClose ? ((hv.c / prevClose - 1) * 100) : null;
  const what = candles ? 'Daily candles' : 'Daily closing prices';
  return (
    <div ref={ref} className="relative">
      <svg width={w} height={height} className="block max-w-full" role="img" aria-label={`${what} from ${tradingDay(bars[0].t)} to ${tradingDay(bars.at(-1).t)}: closed at ${fmt(bars[0].c)}, then ${fmt(bars.at(-1).c)}; lowest ${fmt(min)}, highest ${fmt(max)}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="stroke-ink-100 dark:stroke-ink-800" />
            <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-400 font-mono text-[10px]">{fmt(t)}</text>
          </g>
        ))}
        {[0, Math.floor(n / 2), n - 1].map((i) => <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-ink-400 text-[10px]">{short(bars[i].t)}</text>)}
        {hover !== null ? <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} className="stroke-ink-300 dark:stroke-ink-600" strokeDasharray="3 3" /> : null}
        {candles ? (
          bars.map((b, i) => {
            const up = b.c >= b.o;
            const top = y(Math.max(b.o, b.c));
            const bodyH = Math.max(1, Math.abs(y(b.o) - y(b.c)));
            const tone = up ? 'stroke-profit-600 dark:stroke-profit-400' : 'stroke-loss-500 dark:stroke-loss-400';
            return (
              <g key={b.t} className={tone} opacity={hover === null || hover === i ? 1 : 0.55}>
                <line x1={x(i)} x2={x(i)} y1={y(b.h)} y2={y(b.l)} strokeWidth="1" />
                <rect
                  x={x(i) - body / 2}
                  y={top}
                  width={body}
                  height={bodyH}
                  rx={body > 4 ? 1 : 0}
                  strokeWidth="1"
                  className={up ? 'fill-profit-500/25 dark:fill-profit-400/25' : 'fill-loss-500 dark:fill-loss-400'}
                />
              </g>
            );
          })
        ) : (
          <path d={bars.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(b.c).toFixed(1)}`).join(' ')} fill="none" strokeWidth="2" className="stroke-accent-600 dark:stroke-accent-400" strokeLinejoin="round" />
        )}
        {hover !== null && !candles ? <circle cx={x(hover)} cy={y(hv.c)} r="4" className="fill-accent-600 stroke-white dark:fill-accent-400 dark:stroke-ink-900" strokeWidth="2" /> : null}
      </svg>
      {hv ? (
        <div className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-ink-100 bg-white px-2.5 py-1.5 text-xs shadow-pop dark:border-ink-700 dark:bg-ink-800" style={{ left: Math.min(Math.max(x(hover), 90), w - 90) }}>
          <p className="text-ink-500 dark:text-ink-400">{tradingDay(hv.t)}{change !== null ? <span className={change >= 0 ? 'ml-1.5 text-profit-600 dark:text-profit-400' : 'ml-1.5 text-loss-500 dark:text-loss-400'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span> : null}</p>
          {candles ? (
            <p className="mt-0.5 grid grid-cols-[auto_auto] gap-x-2 font-mono tabular-nums text-ink-900 dark:text-ink-50">
              <span className="text-ink-400">Open</span><span className="text-right">{fmt(hv.o)}</span>
              <span className="text-ink-400">High</span><span className="text-right">{fmt(hv.h)}</span>
              <span className="text-ink-400">Low</span><span className="text-right">{fmt(hv.l)}</span>
              <span className="text-ink-400">Close</span><span className="text-right font-semibold">{fmt(hv.c)}</span>
            </p>
          ) : <p className="font-mono font-semibold text-ink-900 dark:text-ink-50">{fmt(hv.c)}</p>}
        </div>
      ) : null}
    </div>
  );
}
