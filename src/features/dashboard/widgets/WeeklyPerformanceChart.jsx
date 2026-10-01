import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

// Daily realized P&L for the last 7 days. Polarity is encoded twice: by
// position (above or below the zero baseline) and by colour, because the
// profit/loss pair is only ΔE 6.8 apart for deuteranopes. Bars are thin with
// a 4px rounded data end; the baseline end stays square.
const H = 220;
const PAD = { top: 16, right: 8, bottom: 28, left: 56 };

// Render at the container's real pixel width so labels stay 11px on phones
// instead of shrinking with a scaled viewBox.
function useWidth(fallback = 700) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const money = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function barPath(x, y0, y1, w, r) {
  const up = y1 < y0;
  const h = Math.abs(y1 - y0);
  const rr = Math.min(r, h / 2, w / 2);
  if (h < 0.5) return '';
  if (up) {
    return `M${x},${y0} V${y1 + rr} Q${x},${y1} ${x + rr},${y1} H${x + w - rr} Q${x + w},${y1} ${x + w},${y1 + rr} V${y0} Z`;
  }
  return `M${x},${y0} V${y1 - rr} Q${x},${y1} ${x + rr},${y1} H${x + w - rr} Q${x + w},${y1} ${x + w},${y1 - rr} V${y0} Z`;
}

function niceMax(v) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

export default function WeeklyPerformanceChart({ data }) {
  const [active, setActive] = useState(null);
  const [ref, W] = useWidth();
  const maxAbs = niceMax(Math.max(...data.map((d) => Math.abs(d.pnl)), 0));
  const hasNeg = data.some((d) => d.pnl < 0);
  const hasPos = data.some((d) => d.pnl > 0);
  const top = hasPos || !hasNeg ? maxAbs : 0;
  const bottom = hasNeg ? -maxAbs : 0;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const y = (v) => PAD.top + ((top - v) / (top - bottom || 1)) * innerH;
  const col = innerW / data.length;
  const barW = Math.min(28, col * 0.42);
  const ticks = [top, 0, bottom].filter((v, i, a) => a.indexOf(v) === i);
  const empty = data.every((d) => d.pnl === 0);

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="group" aria-label={`Daily realized P&L, last 7 days: ${data.map((d) => `${d.day} ${money(d.pnl)}`).join(', ')}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'stroke-ink-300 dark:stroke-ink-600' : 'stroke-ink-100 dark:stroke-ink-800'} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={PAD.left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-400 font-mono text-[11px]">
              {t === 0 ? '$0' : money(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.left + col * i + (col - barW) / 2;
          const isActive = active === i;
          return (
            <g key={d.day + i}>
              <path
                d={barPath(x, y(0), y(d.pnl), barW, 4)}
                className={clsx(d.pnl >= 0 ? 'fill-profit-500' : 'fill-loss-500', active !== null && !isActive && 'opacity-40', 'transition-opacity')}
              />
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" className={clsx('text-[11px]', isActive ? 'fill-ink-800 dark:fill-ink-100' : 'fill-ink-400')}>
                {d.day}
              </text>
              {/* Hit target spans the whole column, wider than the bar. */}
              <rect
                x={PAD.left + col * i}
                y={PAD.top}
                width={col}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                tabIndex={0}
                role="img"
                aria-label={`${d.day}: ${money(d.pnl)}`}
              />
            </g>
          );
        })}
      </svg>
      {active !== null ? (
        <div
          className="pointer-events-none absolute top-1 -translate-x-1/2 rounded-lg border border-ink-100 bg-white px-2.5 py-1.5 text-xs shadow-pop dark:border-ink-700 dark:bg-ink-800"
          style={{ left: `${((PAD.left + col * active + col / 2) / W) * 100}%` }}
        >
          <span className="text-ink-500 dark:text-ink-400">{data[active].day}</span>{' '}
          <span className="font-mono font-semibold text-ink-900 dark:text-ink-50">{money(data[active].pnl)}</span>
        </div>
      ) : null}
      {empty ? (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
          <p className="text-sm font-medium text-ink-700 dark:text-ink-200">No closed trades in the last 7 days</p>
          <p className="mt-0.5 text-xs text-ink-400">Close a position in your journal and your daily results show here.</p>
        </div>
      ) : null}
    </div>
  );
}
