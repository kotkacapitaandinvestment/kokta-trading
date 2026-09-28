import { useEffect, useRef, useState } from 'react';
import { tradingDay } from '../util';

// Axis labels: "21 Jun".
const short = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Daily closes as one line, with a crosshair tooltip. Single series, so no
// legend; the title outside names it.
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
  const pad = { t: 12, r: 12, b: 24, l: 62 };
  const vals = history.map((h) => h.c);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i) => pad.l + (i / (history.length - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + ((max - v) / span) * (height - pad.t - pad.b);
  const d = history.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h.c).toFixed(1)}`).join(' ');
  const ticks = [max, (max + min) / 2, min];
  const fmt = (v) => Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / (w - pad.l - pad.r)) * (history.length - 1));
    setHover(Math.max(0, Math.min(history.length - 1, i)));
  };
  return (
    <div ref={ref} className="relative">
      <svg width={w} height={height} className="block max-w-full" role="img" aria-label={`Daily closing prices from ${tradingDay(history[0].t)} to ${tradingDay(history.at(-1).t)}, ${fmt(vals[0])} to ${fmt(vals.at(-1))}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="stroke-ink-100 dark:stroke-ink-800" />
            <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-400 font-mono text-[10px]">{fmt(t)}</text>
          </g>
        ))}
        {[0, Math.floor(history.length / 2), history.length - 1].map((i) => <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === history.length - 1 ? 'end' : 'middle'} className="fill-ink-400 text-[10px]">{short(history[i].t)}</text>)}
        <path d={d} fill="none" strokeWidth="2" className="stroke-accent-600 dark:stroke-accent-400" strokeLinejoin="round" />
        {hover !== null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} className="stroke-ink-300 dark:stroke-ink-600" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(history[hover].c)} r="4" className="fill-accent-600 stroke-white dark:fill-accent-400 dark:stroke-ink-900" strokeWidth="2" />
          </g>
        ) : null}
      </svg>
      {hover !== null ? (
        <div className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-ink-100 bg-white px-2 py-1 text-xs shadow-pop dark:border-ink-700 dark:bg-ink-800" style={{ left: Math.min(Math.max(x(hover), 60), w - 60) }}>
          <span className="text-ink-500">{tradingDay(history[hover].t)}</span> <span className="font-mono font-semibold text-ink-900 dark:text-ink-50">{fmt(history[hover].c)}</span>
        </div>
      ) : null}
    </div>
  );
}
