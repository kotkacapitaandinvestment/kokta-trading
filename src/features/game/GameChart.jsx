import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { CHART_COLORS, RESEARCH_SERIES } from '../../lib/chartColors';
import { sma, rsi as rsiOf, macd as macdOf, levels as levelsOf } from './indicators';
import { mmss, price as fmtPrice } from './format';

const UP = CHART_COLORS.profit;
const DOWN = CHART_COLORS.loss;
const ME = CHART_COLORS.accent;
const THEM = RESEARCH_SERIES.quote.light;
const AXIS_W = 66;
const TIME_H = 20;
const SUB_H = 72;

/**
 * Kotka's synthetic-market chart (canvas). Candles, volume, moving averages,
 * support/resistance, RSI and MACD panes, position lines and trade markers,
 * zoom (wheel or buttons), pan (drag) and a crosshair readout.
 *
 * candles  [{ i, t, o, h, l, c, v }] (t = seconds from the match start)
 * lines    [{ price, color, label, dash }]
 * markers  [{ t, price, kind: 'buy' | 'sell' | 'exit', who: 'me' | 'them', label }]
 */
export default function GameChart({ candles, candleSec, show = {}, lines = [], markers = [], highlightT = null, height = 460, className }) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const wrap = useRef(null);
  const canvas = useRef(null);
  const [width, setWidth] = useState(600);
  const [view, setView] = useState({ count: 90, offset: 0 });
  const [hover, setHover] = useState(null);
  const drag = useRef(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const closes = useMemo(() => candles.map((c) => c.c), [candles]);
  const ind = useMemo(() => ({ ma20: sma(closes, 20), ma50: sma(closes, 50), rsi: rsiOf(closes), macd: macdOf(closes) }), [closes]);
  const count = Math.max(15, Math.min(view.count, candles.length || 15));
  const offset = Math.max(0, Math.min(view.offset, Math.max(0, candles.length - count)));
  const end = candles.length - offset;
  const start = Math.max(0, end - count);
  const lv = useMemo(() => (show.levels ? levelsOf(candles.slice(Math.max(0, end - 120), end)) : { support: [], resistance: [] }), [candles, end, show.levels]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr;
    cv.height = height * dpr;
    cv.style.width = `${width}px`;
    cv.style.height = `${height}px`;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    const grid = dark ? CHART_COLORS.grid.dark : CHART_COLORS.grid.light;
    const text = dark ? CHART_COLORS.tick.dark : CHART_COLORS.tick.light;
    const strong = dark ? '#EDE8DD' : '#26231F';
    g.font = '11px ui-sans-serif, system-ui, sans-serif';

    const subs = [show.rsi && 'rsi', show.macd && 'macd'].filter(Boolean);
    const plotW = width - AXIS_W;
    const mainH = height - TIME_H - subs.length * SUB_H;
    const vis = candles.slice(start, end);
    if (!vis.length) {
      g.fillStyle = text;
      g.fillText('Waiting for market data…', 12, 20);
      return;
    }
    const w = plotW / count;
    const xOf = (idx) => (idx - start) * w + w / 2 + (count - vis.length) * 0;

    // Price scale: visible range, plus lines close to it.
    let hi = Math.max(...vis.map((c) => c.h));
    let lo = Math.min(...vis.map((c) => c.l));
    for (const l of lines) if (l.price != null && l.price < hi * 1.03 && l.price > lo * 0.97) {
      hi = Math.max(hi, l.price);
      lo = Math.min(lo, l.price);
    }
    const pad = (hi - lo) * 0.08 || hi * 0.002;
    hi += pad;
    lo -= pad;
    const volH = show.volume ? mainH * 0.18 : 0;
    const yOf = (p) => 8 + ((hi - p) / (hi - lo)) * (mainH - 16 - volH);

    // Grid and price axis.
    g.strokeStyle = grid;
    g.lineWidth = 1;
    g.fillStyle = text;
    const steps = 6;
    for (let s = 0; s <= steps; s++) {
      const p = lo + ((hi - lo) * s) / steps;
      const y = Math.round(yOf(p)) + 0.5;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(plotW, y);
      g.stroke();
      g.fillText(fmtPrice(p), plotW + 6, y + 4);
    }

    // Volume.
    if (show.volume) {
      const vmax = Math.max(...vis.map((c) => c.v)) || 1;
      vis.forEach((c, k) => {
        const idx = start + k;
        const hgt = (c.v / vmax) * volH;
        g.fillStyle = (c.c >= c.o ? UP : DOWN) + '40';
        g.fillRect(xOf(idx) - Math.max(1, w * 0.35), mainH - hgt, Math.max(1, w * 0.7), hgt);
      });
    }

    // Support and resistance.
    g.setLineDash([4, 4]);
    for (const [list, col, tag] of [[lv.support, UP, 'S'], [lv.resistance, DOWN, 'R']]) {
      for (const p of list) {
        const y = Math.round(yOf(p)) + 0.5;
        if (y < 0 || y > mainH) continue;
        g.strokeStyle = col + '99';
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(plotW, y);
        g.stroke();
        g.fillStyle = col;
        g.fillText(tag, 4, y - 3);
      }
    }
    g.setLineDash([]);

    // Candles.
    vis.forEach((c, k) => {
      const idx = start + k;
      const x = xOf(idx);
      const col = c.c >= c.o ? UP : DOWN;
      g.strokeStyle = col;
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, yOf(c.h));
      g.lineTo(Math.round(x) + 0.5, yOf(c.l));
      g.stroke();
      const top = yOf(Math.max(c.o, c.c));
      const bh = Math.max(1, yOf(Math.min(c.o, c.c)) - top);
      const bw = Math.max(1, w * 0.68);
      if (c.forming) {
        g.globalAlpha = 0.7;
      }
      g.fillRect(x - bw / 2, top, bw, bh);
      g.globalAlpha = 1;
    });

    // Moving averages.
    const drawLine = (series, color, yFn, from = 0, lineWidth = 1.5) => {
      g.strokeStyle = color;
      g.lineWidth = lineWidth;
      g.beginPath();
      let on = false;
      for (let idx = Math.max(start, from); idx < end; idx++) {
        const v = series[idx];
        if (v == null) {
          on = false;
          continue;
        }
        const x = xOf(idx);
        const y = yFn(v);
        if (!on) g.moveTo(x, y);
        else g.lineTo(x, y);
        on = true;
      }
      g.stroke();
      g.lineWidth = 1;
    };
    if (show.ma20) drawLine(ind.ma20, ME, yOf);
    if (show.ma50) drawLine(ind.ma50, THEM, yOf);

    // Position lines (entry, stop, target).
    for (const l of lines) {
      if (l.price == null) continue;
      const y = Math.round(yOf(l.price)) + 0.5;
      if (y < 0 || y > mainH) continue;
      g.strokeStyle = l.color;
      g.setLineDash(l.dash ? [6, 4] : []);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(plotW, y);
      g.stroke();
      g.setLineDash([]);
      const label = `${l.label} ${fmtPrice(l.price)}`;
      const tw = g.measureText(label).width + 8;
      g.fillStyle = l.color;
      g.fillRect(plotW - tw - 4, y - 8, tw, 16);
      g.fillStyle = '#fff';
      g.fillText(label, plotW - tw, y + 4);
    }

    // Trade markers.
    const first = candles[0];
    for (const m of markers) {
      const idx = Math.floor((m.t - first.t) / candleSec);
      if (idx < start || idx >= end) continue;
      const x = xOf(idx);
      const c = candles[idx];
      const color = m.who === 'them' ? THEM : ME;
      g.fillStyle = color;
      g.beginPath();
      if (m.kind === 'buy') {
        const y = yOf(c.l) + 10;
        g.moveTo(x, y - 6);
        g.lineTo(x - 5, y + 3);
        g.lineTo(x + 5, y + 3);
      } else if (m.kind === 'sell') {
        const y = yOf(c.h) - 10;
        g.moveTo(x, y + 6);
        g.lineTo(x - 5, y - 3);
        g.lineTo(x + 5, y - 3);
      } else {
        g.arc(x, yOf(m.price ?? c.c), 3.5, 0, Math.PI * 2);
      }
      g.fill();
    }

    // A highlighted moment (replay decision points).
    if (highlightT != null) {
      const idx = Math.floor((highlightT - first.t) / candleSec);
      if (idx >= start && idx < end) {
        g.fillStyle = ME + '22';
        g.fillRect(xOf(idx) - w / 2, 0, w, mainH);
      }
    }

    // Current price tag.
    const last = vis.at(-1);
    if (!offset) {
      const y = Math.round(yOf(last.c)) + 0.5;
      g.strokeStyle = strong + '55';
      g.setLineDash([2, 3]);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(plotW, y);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = last.c >= last.o ? UP : DOWN;
      g.fillRect(plotW + 1, y - 9, AXIS_W - 2, 18);
      g.fillStyle = '#fff';
      g.fillText(fmtPrice(last.c), plotW + 6, y + 4);
    }

    // Sub-panes.
    let top = mainH;
    for (const sub of subs) {
      g.strokeStyle = grid;
      g.beginPath();
      g.moveTo(0, top + 0.5);
      g.lineTo(width, top + 0.5);
      g.stroke();
      g.fillStyle = text;
      if (sub === 'rsi') {
        const y = (v) => top + 6 + ((100 - v) / 100) * (SUB_H - 12);
        g.setLineDash([3, 3]);
        for (const lvl of [30, 70]) {
          g.strokeStyle = grid;
          g.beginPath();
          g.moveTo(0, y(lvl));
          g.lineTo(plotW, y(lvl));
          g.stroke();
          g.fillText(String(lvl), plotW + 6, y(lvl) + 4);
        }
        g.setLineDash([]);
        drawLine(ind.rsi, ME, y);
        g.fillText('RSI 14', 6, top + 14);
      } else {
        const vals = [];
        for (let idx = start; idx < end; idx++) for (const k of ['line', 'signal', 'hist']) if (ind.macd[k][idx] != null) vals.push(ind.macd[k][idx]);
        const m = Math.max(...vals.map(Math.abs), 1e-9);
        const y = (v) => top + SUB_H / 2 - (v / m) * (SUB_H / 2 - 6);
        for (let idx = start; idx < end; idx++) {
          const hv = ind.macd.hist[idx];
          if (hv == null) continue;
          g.fillStyle = (hv >= 0 ? UP : DOWN) + '99';
          g.fillRect(xOf(idx) - Math.max(1, w * 0.3), Math.min(y(0), y(hv)), Math.max(1, w * 0.6), Math.abs(y(hv) - y(0)));
        }
        drawLine(ind.macd.line, ME, y);
        drawLine(ind.macd.signal, THEM, y);
        g.fillStyle = text;
        g.fillText('MACD 12 26 9', 6, top + 14);
      }
      top += SUB_H;
    }

    // Time axis (match time; history is negative).
    g.fillStyle = text;
    const every = Math.max(1, Math.ceil(80 / w));
    for (let idx = start; idx < end; idx += 1) {
      if ((candles[idx].t / candleSec) % every !== 0) continue;
      const x = xOf(idx);
      const label = mmss(candles[idx].t);
      g.fillText(label, x - g.measureText(label).width / 2, height - 6);
    }
    // The match start.
    const zero = candles.findIndex((c) => c.t === 0);
    if (zero >= start && zero < end) {
      const x = xOf(zero) - w / 2;
      g.strokeStyle = strong + '66';
      g.setLineDash([2, 2]);
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, 0);
      g.lineTo(Math.round(x) + 0.5, height - TIME_H);
      g.stroke();
      g.setLineDash([]);
    }

    // Crosshair and readout.
    if (hover && hover.x < plotW && hover.y < height - TIME_H) {
      const idx = Math.min(end - 1, Math.max(start, start + Math.floor(hover.x / w)));
      const c = candles[idx];
      g.strokeStyle = strong + '66';
      g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(xOf(idx), 0);
      g.lineTo(xOf(idx), height - TIME_H);
      if (hover.y < mainH) {
        g.moveTo(0, hover.y);
        g.lineTo(plotW, hover.y);
      }
      g.stroke();
      g.setLineDash([]);
      if (hover.y < mainH) {
        const p = hi - ((hover.y - 8) / (mainH - 16 - volH)) * (hi - lo);
        g.fillStyle = strong;
        g.fillRect(plotW + 1, hover.y - 9, AXIS_W - 2, 18);
        g.fillStyle = dark ? '#0C0C0E' : '#fff';
        g.fillText(fmtPrice(p), plotW + 6, hover.y + 4);
      }
      const read = `${mmss(c.t)}  O ${fmtPrice(c.o)}  H ${fmtPrice(c.h)}  L ${fmtPrice(c.l)}  C ${fmtPrice(c.c)}  Vol ${Math.round(c.v).toLocaleString()}`;
      g.fillStyle = dark ? '#0C0C0Ecc' : '#ffffffcc';
      g.fillRect(4, 4, g.measureText(read).width + 10, 18);
      g.fillStyle = strong;
      g.fillText(read, 9, 17);
    }
  }, [candles, candleSec, width, height, dark, start, end, count, offset, show.volume, show.ma20, show.ma50, show.rsi, show.macd, lv, lines, markers, hover, ind, highlightT]);

  const zoom = (f) => setView((v) => ({ ...v, count: Math.round(Math.max(15, Math.min(candles.length || 15, v.count * f))) }));
  const onWheel = (e) => {
    e.preventDefault();
    zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15);
  };
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return undefined;
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  });
  const pos = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div ref={wrap} className={className} style={{ position: 'relative' }}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Price chart, ${candles.length} candles. Last price ${fmtPrice(candles.at(-1)?.c)}.`}
        className="block touch-none select-none"
        onPointerDown={(e) => {
          drag.current = { x: pos(e).x, offset };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const p = pos(e);
          setHover(p);
          if (drag.current) {
            const w = (width - AXIS_W) / count;
            const shift = Math.round((p.x - drag.current.x) / w);
            setView((v) => ({ ...v, offset: Math.max(0, Math.min(candles.length - count, drag.current.offset + shift)) }));
          }
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => {
          drag.current = null;
          setHover(null);
        }}
        onDoubleClick={() => setView({ count: 90, offset: 0 })}
      />
      <div className="absolute bottom-7 left-2 flex gap-1">
        {[
          [Plus, () => zoom(1 / 1.3), 'Zoom in'],
          [Minus, () => zoom(1.3), 'Zoom out'],
          [RotateCcw, () => setView({ count: 90, offset: 0 }), 'Back to now'],
        ].map(([Icon, fn, label]) => (
          <button key={label} type="button" onClick={fn} aria-label={label} title={label} className="flex h-7 w-7 items-center justify-center rounded-md border border-ink-200 bg-white/90 text-ink-500 hover:text-ink-900 dark:border-ink-700 dark:bg-ink-900/90 dark:text-ink-300 dark:hover:text-ink-50">
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}
