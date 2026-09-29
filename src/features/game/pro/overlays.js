// Drawing tools KLineChart doesn't ship, in the same model as its own:
// place by clicking points, then select, drag points, move, lock, restyle
// or delete. Plus two "system" overlays for the trader's position lines
// and trade markers (locked, never saved).
import { registerOverlay } from 'klinecharts';

const ACCENT = '#D1A85B';
const UP = '#3D9970';
const DOWN = '#C24A3F';
const colorOf = (o, fallback = '#2a78d6') => o.styles?.line?.color ?? fallback;
const sizeOf = (o) => o.styles?.line?.size ?? 1;
const dashOf = (o) => (o.styles?.line?.style === 'dashed' ? 'dashed' : 'solid');
const dashValue = (o) => o.styles?.line?.dashedValue ?? [4, 4];
const alpha = (hex, a) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const lineFig = (o, coordinates, extra = {}) => ({ type: 'line', attrs: { coordinates }, styles: { color: colorOf(o), size: sizeOf(o), style: dashOf(o), dashedValue: dashValue(o), ...extra } });
const textFig = (x, y, text, { color = '#fff', bg = 'rgba(38,35,31,0.85)', align = 'left', baseline = 'bottom', size = 11 } = {}) => ({
  type: 'text',
  ignoreEvent: true,
  attrs: { x, y, text, align, baseline },
  styles: { color, size, backgroundColor: bg, borderRadius: 2, paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2 },
});
const pctText = (from, to) => `${to >= from ? '+' : '−'}${Math.abs(((to - from) / from) * 100).toFixed(2)}%`;
const fmtVal = (chart, v) => {
  const dp = chart.getSymbol()?.pricePrecision ?? 2;
  return Number(v).toLocaleString('en-NG', { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
const duration = (ms) => {
  const s = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
};
// A line from a through b, carried on to the right edge.
function extendRight(a, b, width) {
  if (Math.abs(b.x - a.x) < 1e-6) return b;
  const k = (b.y - a.y) / (b.x - a.x);
  const x = b.x >= a.x ? width : 0;
  return { x, y: a.y + k * (x - a.x) };
}

const defs = [
  {
    name: 'kRect',
    totalStep: 3,
    createPointFigures: ({ overlay, coordinates }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      return [{ type: 'polygon', attrs: { coordinates: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] }, styles: { style: 'stroke_fill', color: alpha(colorOf(overlay), 0.12), borderColor: colorOf(overlay), borderSize: sizeOf(overlay), borderStyle: dashOf(overlay) } }];
    },
  },
  {
    name: 'kCircle',
    totalStep: 3,
    createPointFigures: ({ overlay, coordinates }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      return [{ type: 'circle', attrs: { x: a.x, y: a.y, r: Math.hypot(b.x - a.x, b.y - a.y) }, styles: { style: 'stroke_fill', color: alpha(colorOf(overlay), 0.1), borderColor: colorOf(overlay), borderSize: sizeOf(overlay), borderStyle: dashOf(overlay) } }];
    },
  },
  {
    name: 'kTriangle',
    totalStep: 4,
    createPointFigures: ({ overlay, coordinates }) => {
      if (coordinates.length < 2) return [];
      if (coordinates.length === 2) return [lineFig(overlay, coordinates)];
      return [{ type: 'polygon', attrs: { coordinates }, styles: { style: 'stroke_fill', color: alpha(colorOf(overlay), 0.12), borderColor: colorOf(overlay), borderSize: sizeOf(overlay), borderStyle: dashOf(overlay) } }];
    },
  },
  {
    name: 'kArrow',
    totalStep: 3,
    createPointFigures: ({ overlay, coordinates }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const len = 10 + sizeOf(overlay) * 2;
      const head = [b, { x: b.x - len * Math.cos(ang - Math.PI / 7), y: b.y - len * Math.sin(ang - Math.PI / 7) }, { x: b.x - len * Math.cos(ang + Math.PI / 7), y: b.y - len * Math.sin(ang + Math.PI / 7) }];
      return [lineFig(overlay, [a, b]), { type: 'polygon', attrs: { coordinates: head }, styles: { style: 'fill', color: colorOf(overlay) } }];
    },
  },
  {
    name: 'kText',
    totalStep: 2,
    needDefaultPointFigure: false,
    createPointFigures: ({ overlay, coordinates }) => {
      if (!coordinates.length) return [];
      const text = (typeof overlay.extendData === 'string' ? overlay.extendData : overlay.extendData?.text) || 'Text';
      return [{ type: 'text', attrs: { x: coordinates[0].x, y: coordinates[0].y, text, align: 'left', baseline: 'middle' }, styles: { color: '#fff', size: 13, backgroundColor: colorOf(overlay, ACCENT), borderRadius: 3, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3 } }];
    },
  },
  {
    name: 'kFibExtension',
    totalStep: 4,
    createPointFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
      const figs = [];
      if (coordinates.length >= 2) figs.push(lineFig(overlay, coordinates.slice(0, 2), { style: 'dashed', size: 1 }));
      if (coordinates.length === 3) {
        figs.push(lineFig(overlay, coordinates.slice(1, 3), { style: 'dashed', size: 1 }));
        const [p0, p1, p2] = overlay.points;
        if (p0?.value == null || p1?.value == null || p2?.value == null) return figs;
        const move = p1.value - p0.value;
        const x0 = Math.min(coordinates[2].x, coordinates[1].x);
        for (const lvl of [0, 0.382, 0.618, 1, 1.272, 1.618, 2, 2.618]) {
          const value = p2.value + move * lvl;
          const y = yAxis.convertToPixel(value);
          figs.push({ type: 'line', attrs: { coordinates: [{ x: x0, y }, { x: bounding.width, y }] }, styles: { color: colorOf(overlay, ACCENT), size: 1, style: lvl === 1 || lvl === 0 ? 'solid' : 'dashed' } });
          figs.push(textFig(x0 + 4, y - 2, `${lvl} (${fmtVal(chart, value)})`, { color: colorOf(overlay, ACCENT), bg: 'transparent' }));
        }
      }
      return figs;
    },
  },
  {
    name: 'kPitchfork',
    totalStep: 4,
    createPointFigures: ({ overlay, coordinates, bounding }) => {
      if (coordinates.length < 2) return [];
      if (coordinates.length === 2) return [lineFig(overlay, coordinates)];
      const [a, b, c] = coordinates;
      const m = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
      const k = Math.abs(m.x - a.x) < 1e-6 ? 0 : (m.y - a.y) / (m.x - a.x);
      const to = (p) => ({ x: bounding.width, y: p.y + k * (bounding.width - p.x) });
      return [lineFig(overlay, [a, to(a)]), lineFig(overlay, [b, to(b)]), lineFig(overlay, [c, to(c)]), lineFig(overlay, [b, c], { style: 'dashed' })];
    },
  },
  {
    name: 'kPriceRange',
    totalStep: 3,
    createPointFigures: ({ chart, overlay, coordinates }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const [p0, p1] = overlay.points;
      const up = (p1?.value ?? 0) >= (p0?.value ?? 0);
      const col = up ? UP : DOWN;
      const mid = (a.x + b.x) / 2;
      const bars = p0?.dataIndex != null && p1?.dataIndex != null ? Math.abs(p1.dataIndex - p0.dataIndex) : null;
      const figs = [
        { type: 'polygon', attrs: { coordinates: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] }, styles: { style: 'fill', color: alpha(col, 0.15) } },
        { type: 'line', attrs: { coordinates: [{ x: mid, y: a.y }, { x: mid, y: b.y }] }, styles: { color: col, size: 1 } },
      ];
      if (p0?.value != null && p1?.value != null) figs.push(textFig(mid, b.y + (up ? -6 : 18), `${fmtVal(chart, p1.value - p0.value)} (${pctText(p0.value, p1.value)})${bars != null ? ` · ${bars} bars` : ''}`, { bg: col, align: 'center' }));
      return figs;
    },
  },
  {
    name: 'kDateRange',
    totalStep: 3,
    createPointFigures: ({ overlay, coordinates }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const [p0, p1] = overlay.points;
      const midY = (a.y + b.y) / 2;
      const bars = p0?.dataIndex != null && p1?.dataIndex != null ? Math.abs(p1.dataIndex - p0.dataIndex) : null;
      return [
        { type: 'polygon', attrs: { coordinates: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] }, styles: { style: 'fill', color: alpha('#2a78d6', 0.12) } },
        { type: 'line', attrs: { coordinates: [{ x: a.x, y: midY }, { x: b.x, y: midY }] }, styles: { color: '#2a78d6', size: 1 } },
        textFig((a.x + b.x) / 2, Math.max(a.y, b.y) + 18, `${bars != null ? `${bars} bars · ` : ''}${p0?.timestamp && p1?.timestamp ? duration(p1.timestamp - p0.timestamp) : ''}`, { bg: '#2a78d6', align: 'center' }),
      ];
    },
  },
];

// Long / short position: entry, then target, then stop. The width follows the target point.
function positionTool(name, dir) {
  return {
    name,
    totalStep: 4,
    createPointFigures: ({ chart, overlay, coordinates }) => {
      if (coordinates.length < 2) return [];
      const [e, t] = coordinates;
      const right = Math.max(t.x, e.x + 60);
      const figs = [];
      const box = (y1, y2, col) => ({ type: 'polygon', attrs: { coordinates: [{ x: e.x, y: y1 }, { x: right, y: y1 }, { x: right, y: y2 }, { x: e.x, y: y2 }] }, styles: { style: 'fill', color: alpha(col, 0.18) } });
      figs.push(box(e.y, t.y, UP));
      const pts = overlay.points;
      if (coordinates.length === 3) figs.push(box(e.y, coordinates[2].y, DOWN));
      figs.push({ type: 'line', attrs: { coordinates: [{ x: e.x, y: e.y }, { x: right, y: e.y }] }, styles: { color: '#8A7F72', size: 1 } });
      if (pts[0]?.value != null && pts[1]?.value != null) {
        const entry = pts[0].value;
        const target = pts[1].value;
        figs.push(textFig(e.x + 4, t.y + (dir > 0 ? 16 : -4), `Target ${fmtVal(chart, target)} (${pctText(entry, target)})`, { bg: UP }));
        if (pts[2]?.value != null) {
          const stop = pts[2].value;
          const rr = Math.abs(target - entry) / Math.max(Math.abs(entry - stop), 1e-12);
          figs.push(textFig(e.x + 4, coordinates[2].y + (dir > 0 ? -4 : 16), `Stop ${fmtVal(chart, stop)} (${pctText(entry, stop)})`, { bg: DOWN }));
          figs.push(textFig(right - 4, e.y - 4, `${dir > 0 ? 'Long' : 'Short'} · reward:risk ${rr.toFixed(2)}`, { align: 'right' }));
        }
      }
      return figs;
    },
  };
}
defs.push(positionTool('kLong', 1), positionTool('kShort', -1));

// System overlays: the trader's live position lines, and trade markers.
defs.push({
  name: 'kLevel',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ chart, overlay, coordinates, bounding }) => {
    if (!coordinates.length) return [];
    const y = coordinates[0].y;
    const col = overlay.extendData?.color ?? ACCENT;
    return [
      { type: 'line', ignoreEvent: !overlay.extendData?.draggable, attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] }, styles: { color: col, size: overlay.extendData?.draggable ? 2 : 1, style: overlay.extendData?.dashed ? 'dashed' : 'solid', dashedValue: [6, 4] } },
      textFig(bounding.width - 6, y - 3, `${overlay.extendData?.label ?? ''} ${fmtVal(chart, overlay.points[0]?.value ?? 0)}`, { bg: col, align: 'right' }),
    ];
  },
});
defs.push({
  name: 'kTrade',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates }) => {
    if (!coordinates.length) return [];
    const { x, y } = coordinates[0];
    const col = overlay.extendData?.who === 'them' ? '#2a78d6' : ACCENT;
    const kind = overlay.extendData?.kind;
    if (kind === 'exit') return [{ type: 'circle', ignoreEvent: true, attrs: { x, y, r: 4 }, styles: { style: 'stroke_fill', color: '#fff', borderColor: col, borderSize: 2 } }];
    const up = kind === 'buy';
    const tip = up ? y + 6 : y - 6;
    const base = up ? tip + 9 : tip - 9;
    return [{ type: 'polygon', ignoreEvent: true, attrs: { coordinates: [{ x, y: tip }, { x: x - 6, y: base }, { x: x + 6, y: base }] }, styles: { style: 'fill', color: col } }];
  },
});

// A labelled vertical line (the match start).
defs.push({
  name: 'kVLine',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding }) => {
    if (!coordinates.length) return [];
    const x = coordinates[0].x;
    const col = overlay.extendData?.color ?? ACCENT;
    return [
      { type: 'line', ignoreEvent: true, attrs: { coordinates: [{ x, y: 0 }, { x, y: bounding.height }] }, styles: { color: col, size: 1, style: 'dashed', dashedValue: [4, 4] } },
      overlay.extendData?.side === 'left'
        ? textFig(x - 4, bounding.height - 12, overlay.extendData?.label ?? '', { bg: col, baseline: 'middle', align: 'right' })
        : textFig(x + 4, bounding.height - 12, overlay.extendData?.label ?? '', { bg: col, baseline: 'middle' }),
    ];
  },
});

let done = false;
export function registerKotkaOverlays() {
  if (done) return;
  done = true;
  for (const d of defs) registerOverlay({ needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: true, ...d });
}
