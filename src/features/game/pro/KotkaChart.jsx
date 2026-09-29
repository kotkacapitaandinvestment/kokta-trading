// The Trading Game's full chart: every timeframe from 1 second to 1 hour,
// scroll back through the whole market history, indicators, and drawing
// tools you place, drag, restyle, lock and delete. Drawings are saved per
// match so they're there when you come back and in the replay.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { init, dispose } from 'klinecharts';
import clsx from 'clsx';
import {
  ChevronDown, Search, Maximize2, Minimize2, Camera, Undo2, Redo2, Magnet, Lock, LockOpen, Eye, EyeOff, Trash2, MousePointer2,
  Copy, ZoomIn, ZoomOut, ChevronsRight, X, Sigma, Pin, PinOff, ChartCandlestick, ChartLine, ChartArea, ChartBar, Type, RotateCcw, MoreVertical,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { confirmDialog, promptDialog, toast } from '../../../lib/dialogs';
import { useTheme } from '../../../context/ThemeContext';
import Modal from '../../../components/ui/Modal';
import { chartStyles } from './theme';
import { registerKotkaOverlays } from './overlays';
import { TOOL_GROUPS, toolOf, howTo, INDICATORS, indicatorOf, TIMEFRAMES, CHART_TYPES, registerKotkaIndicators } from './catalog';
import { mmss } from '../format';

const USER = 'kotka-user';
const LEVELS = 'kotka-levels';
const TRADES = 'kotka-trades';
const SYSTEM = 'kotka-system';
const MAIN = 'candle_pane';
const PREFS = 'kotka.game.pro';
const TEXT_TOOLS = new Set(['kText', 'simpleAnnotation', 'simpleTag']);
const COLORS = ['#2a78d6', '#D1A85B', '#3D9970', '#C24A3F', '#8E5AC8', '#1BA39C', '#C24A7A', '#8A7F72', '#26231F', '#FFFFFF'];
const DASH = { solid: { style: 'solid', dashedValue: [4, 4] }, dashed: { style: 'dashed', dashedValue: [6, 4] }, dotted: { style: 'dashed', dashedValue: [1, 3] } };
const TYPE_ICON = { candle_solid: ChartCandlestick, candle_stroke: ChartCandlestick, heikin: ChartCandlestick, ohlc: ChartBar, line: ChartLine, area: ChartArea };
// Saves still on their way, so a chart opened straight after (lobby to live) loads the latest.
const pendingSaves = new Map();
const DEFAULT_INDICATORS = [{ name: 'MA', params: [20, 50] }, { name: 'VOL', params: [5, 10, 20] }, { name: 'RSI', params: [14] }];

const pad = (n) => String(n).padStart(2, '0');
const periodOf = (tf) => (TIMEFRAMES.find((x) => x.tf === tf) ?? TIMEFRAMES[2]).period;
const alpha = (hex, a) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const styleFor = (color, size, dash) => ({
  line: { color, size, ...DASH[dash] },
  text: { color: '#FFFFFF', backgroundColor: color, borderColor: color },
  polygon: { color: alpha(color, 0.12), borderColor: color, borderSize: size },
  rect: { color: alpha(color, 0.12), borderColor: color, borderSize: size },
  circle: { color: alpha(color, 0.12), borderColor: color, borderSize: size },
  point: { color, borderColor: alpha(color, 0.35), activeColor: color, activeBorderColor: alpha(color, 0.35) },
});
// The price scale stretches to show your stop and target when they're near
// (within one screen of the candles), so you can see and drag them.
function rangeWithLevels(st) {
  return ({ defaultRange: r }) => {
    const span = Math.max(r.to - r.from, 1e-12);
    let lo = r.from;
    let hi = r.to;
    for (const p of st.levelPrices ?? []) {
      if (p < lo && r.from - p <= span) lo = p;
      if (p > hi && p - r.to <= span) hi = p;
    }
    if (lo === r.from && hi === r.to) return r;
    const d = hi - lo;
    return { ...r, from: lo, to: hi, range: d, realFrom: lo, realTo: hi, realRange: d, displayFrom: lo, displayTo: hi, displayRange: d };
  };
}
const dashOfStyles = (st) => (st?.line?.style !== 'dashed' ? 'solid' : st.line.dashedValue?.[0] === 1 ? 'dotted' : 'dashed');

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
function savePrefs(p) {
  try {
    localStorage.setItem(PREFS, JSON.stringify(p));
  } catch {
    /* preferences are optional */
  }
}

// Heikin Ashi from ordinary candles. `prev` is the Heikin Ashi bar before the first one.
function haBar(k, prev) {
  const close = (k.open + k.high + k.low + k.close) / 4;
  const open = prev ? (prev.open + prev.close) / 2 : (k.open + k.close) / 2;
  return { ...k, open, close, high: Math.max(k.high, open, close), low: Math.min(k.low, open, close) };
}
function heikin(list) {
  const out = [];
  for (const k of list) out.push(haBar(k, out.at(-1)));
  return out;
}

// A small popover that closes when you click elsewhere.
function Pop({ open, onClose, className, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => ref.current && !ref.current.contains(e.target) && !e.target.closest?.('[data-pop-trigger]') && onClose();
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={clsx('absolute z-30 rounded-xl border border-ink-100 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-900', className)}>
      {children}
    </div>
  );
}

const barBtn = 'inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-ink-50';
const iconBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-50';
const sideBtn = 'relative flex h-9 w-9 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-50';
const menuItem = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800';

// A setting applies once it's a positive number; clearing the box to retype doesn't break the indicator.
function ParamInput({ value, label, onChange }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      type="number"
      value={draft}
      aria-label={label}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n) && n > 0) onChange(n);
      }}
      onBlur={() => setDraft(String(value))}
      className="h-8 w-16 rounded-md border border-ink-200 bg-white px-2 text-xs tabular-nums outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
    />
  );
}

function IndicatorDialog({ open, onClose, active, onAdd, onRemove, onParams }) {
  const [q, setQ] = useState('');
  const list = INDICATORS.filter((i) => !q.trim() || `${i.name} ${i.label}`.toLowerCase().includes(q.trim().toLowerCase()));
  const group = (pane) => list.filter((i) => i.pane === pane);
  return (
    <Modal open={open} onClose={onClose} title="Indicators" width="max-w-2xl">
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search indicators" aria-label="Search indicators" className="h-10 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100" />
        </div>
        {active.length ? (
          <div>
            <p className="mb-2 text-xs font-medium text-ink-500 dark:text-ink-400">On your chart</p>
            <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 dark:divide-ink-800 dark:border-ink-800">
              {active.map((a) => {
                const def = indicatorOf(a.name);
                return (
                  <li key={a.name} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm text-ink-800 dark:text-ink-100">{def?.label ?? a.name} <span className="text-xs text-ink-400">{a.name}</span></span>
                    {a.params.map((v, i) => (
                      <ParamInput key={i} value={v} label={`${a.name} setting ${i + 1}`} onChange={(n) => onParams(a.name, a.params.map((x, j) => (j === i ? n : x)))} />
                    ))}
                    <button type="button" onClick={() => onRemove(a.name)} aria-label={`Remove ${def?.label ?? a.name}`} className={iconBtn}><X className="h-4 w-4" /></button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {[['main', 'Drawn on the price'], ['sub', 'In their own panel']].map(([pane, title]) => (group(pane).length ? (
          <div key={pane}>
            <p className="mb-2 text-xs font-medium text-ink-500 dark:text-ink-400">{title}</p>
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {group(pane).map((i) => {
                const on = active.some((a) => a.name === i.name);
                return (
                  <li key={i.name}>
                    <button type="button" onClick={() => (on ? onRemove(i.name) : onAdd(i.name))} className={clsx('flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm', on ? 'bg-accent-500/10 text-ink-900 dark:text-ink-50' : 'text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800')}>
                      <span>{i.label}</span>
                      <span className="text-xs text-ink-400">{on ? 'Added' : i.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null))}
        {!list.length ? <p className="text-sm text-ink-500 dark:text-ink-400">No indicator matches “{q.trim()}”.</p> : null}
      </div>
    </Modal>
  );
}

function PairDialog({ open, onClose, pair, pairs, onPick, note }) {
  const [q, setQ] = useState('');
  const list = (pairs ?? []).filter((p) => !q.trim() || `${p.symbol} ${p.name}`.toLowerCase().includes(q.trim().toLowerCase()));
  const cats = [...new Set(list.map((p) => p.category))];
  return (
    <Modal open={open} onClose={onClose} title="Kotka pairs" width="max-w-xl">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-ink-500 dark:text-ink-400">Kotka pairs are synthetic markets made by Kotka. They don’t follow any real price. {note}</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pairs" aria-label="Search pairs" className="h-10 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100" />
        </div>
        {cats.map((c) => (
          <div key={c}>
            <p className="mb-1 text-xs font-medium text-ink-500 dark:text-ink-400">{c}</p>
            <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 dark:divide-ink-800 dark:border-ink-800">
              {list.filter((p) => p.category === c).map((p) => (
                <li key={p.symbol}>
                  <button type="button" disabled={!onPick || p.symbol === pair?.symbol} onClick={() => onPick(p.symbol)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm enabled:hover:bg-ink-50 disabled:cursor-default dark:enabled:hover:bg-ink-800">
                    <span className="font-semibold text-ink-900 dark:text-ink-50">{p.symbol}</span>
                    <span className="text-xs text-ink-500 dark:text-ink-400">{p.symbol === pair?.symbol ? 'On this chart' : p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!list.length ? <p className="text-sm text-ink-500 dark:text-ink-400">No pair matches “{q.trim()}”.</p> : null}
      </div>
    </Modal>
  );
}

export default function KotkaChart({
  matchId,
  info,
  pair,
  feed = null,
  feedEpoch = 0,
  until = null,
  durationSec = 0,
  levels = [],
  markers = [],
  onLevelDrag = null,
  focusT = null,
  height = 560,
  pairs = null,
  onPickPair = null,
  pairNote = '',
  defaultTf = 15,
}) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const wrapRef = useRef(null);
  const elRef = useRef(null);
  const chartRef = useRef(null);
  const decimals = info?.decimals ?? pair?.decimals ?? 2;
  const replay = until != null;
  // Everything the chart callbacks read, kept out of React so they never go stale.
  const syncRef = useRef(() => {});
  const S = useRef({ gen: 0, base: info?.baseMs ?? 0, lastT: null, rawLast: null, shownLast: null, haBefore: null, sub: null, buffer: [], until: until == null ? null : durationSec ? Math.min(until, durationSec - 1) : until, replayTicks: null, drawingId: null, color: COLORS[0], size: 1, dash: 'solid', history: { past: [], future: [], current: '[]' } });

  const prefs = useMemo(loadPrefs, []);
  const [ready, setReady] = useState(false);
  const [tf, setTf] = useState(prefs.tf ?? defaultTf);
  const [chartType, setChartType] = useState(prefs.chartType ?? 'candle_solid');
  const [yAxis, setYAxis] = useState(prefs.yAxis ?? 'normal');
  const [indicators, setIndicators] = useState(prefs.indicators ?? DEFAULT_INDICATORS);
  const [magnet, setMagnet] = useState(prefs.magnet ?? 'normal');
  const [stay, setStay] = useState(false);
  const [lockedAll, setLockedAll] = useState(false);
  const [hiddenAll, setHiddenAll] = useState(false);
  const [tool, setTool] = useState(null);
  const [groupPick, setGroupPick] = useState(() => Object.fromEntries(TOOL_GROUPS.map((g) => [g.key, prefs.groupPick?.[g.key] ?? g.tools[0].key])));
  const [pop, setPop] = useState(null);
  const [selected, setSelected] = useState(null);
  const [menu, setMenu] = useState(null);
  const [, bump] = useState(0);
  const [away, setAway] = useState(false);
  const [full, setFull] = useState(false);
  const [compact, setCompact] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [histLen, setHistLen] = useState({ past: 0, future: 0 });

  const s = S.current;
  s.tf = tf;
  s.yAxis = yAxis;
  s.levelPrices = levels.map((l) => l.price).filter(Number.isFinite);
  s.chartType = chartType;
  s.magnet = magnet;
  s.stay = stay;
  s.lockedAll = lockedAll;
  s.hiddenAll = hiddenAll;

  // ---- Saving -------------------------------------------------------------
  const saveTimer = useRef(null);
  const saveFailed = useRef(false);
  const serialize = useCallback(() => {
    const c = chartRef.current;
    if (!c) return [];
    return c.getOverlays({ groupId: USER }).filter((o) => !o.isDrawing?.() && o.points.length).map((o) => ({
      name: o.name,
      points: o.points.map((p) => ({ t: Math.round((p.timestamp - S.current.base) / 100) / 10, value: p.value })),
      styles: o.styles ?? null,
      lock: !!o.lock && !S.current.lockedAll,
      visible: o.visible !== false || S.current.hiddenAll,
      extendData: o.extendData ?? null,
    }));
  }, []);
  const layoutRef = useRef(null);
  const dirty = useRef(false);
  const saveNow = useCallback(() => {
    clearTimeout(saveTimer.current);
    if (!dirty.current || !chartRef.current) return;
    dirty.current = false;
    const layout = { v: 1, ...layoutRef.current, drawings: serialize() };
    const p = api.put(`/game/charts/match:${matchId}`, { layout }).catch((err) => {
      if (!saveFailed.current) toast(err.message, { tone: 'error' });
      saveFailed.current = true;
    });
    pendingSaves.set(matchId, p);
    p.finally(() => pendingSaves.get(matchId) === p && pendingSaves.delete(matchId));
  }, [matchId, serialize]);
  const scheduleSave = useCallback(() => {
    dirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveNow, 1200);
  }, [saveNow]);
  const layoutSeen = useRef(false);
  useEffect(() => {
    layoutRef.current = { tf, chartType, yAxis, indicators, magnet };
    savePrefs({ tf, chartType, yAxis, indicators, magnet, groupPick });
    if (!ready) return;
    if (!layoutSeen.current) layoutSeen.current = true;
    else scheduleSave();
  }, [tf, chartType, yAxis, indicators, magnet, groupPick, ready, scheduleSave]);
  // Leaving the page (or the lobby turning into the match) saves straight away.
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;
  useEffect(() => () => saveNowRef.current(), []);

  // Undo and redo keep whole snapshots of the drawings.
  const commit = useCallback(() => {
    const h = S.current.history;
    const next = JSON.stringify(serialize());
    if (next === h.current) return;
    h.past.push(h.current);
    if (h.past.length > 100) h.past.shift();
    h.current = next;
    h.future = [];
    setHistLen({ past: h.past.length, future: 0 });
    scheduleSave();
  }, [serialize, scheduleSave]);

  // ---- Drawings -----------------------------------------------------------
  // A drag ends when the button comes up anywhere: the chart only reports it
  // when you let go inside the price panel.
  const moved = useRef(null);
  const endMoveRef = useRef(() => {});
  const endMove = () => endMoveRef.current();
  useEffect(() => {
    const up = () => endMoveRef.current();
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    window.addEventListener('touchcancel', up);
    return () => {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
      window.removeEventListener('touchcancel', up);
    };
  }, []);
  const handlers = useRef(null);
  handlers.current = {
    onDrawEnd: ({ overlay }) => {
      S.current.drawingId = null;
      const t = toolOf(overlay.name);
      if (TEXT_TOOLS.has(overlay.name)) {
        promptDialog({ title: t?.label ?? 'Text', label: 'Text', placeholder: 'What should it say?', confirmLabel: 'Add', maxLength: 200 }).then((text) => {
          const c = chartRef.current;
          if (!c) return;
          if (!text?.trim()) c.removeOverlay({ id: overlay.id });
          else c.overrideOverlay({ id: overlay.id, extendData: text.trim() });
          commit();
        });
      } else commit();
      if (S.current.stay && t) startTool(t.key);
      else setTool(null);
    },
    onSelected: ({ overlay }) => {
      if (overlay.groupId === USER && !overlay.isDrawing?.()) setSelected(overlay.id);
    },
    onDeselected: ({ overlay }) => setSelected((cur) => (cur === overlay.id ? null : cur)),
    onPressedMoving: ({ overlay }) => {
      if (overlay.groupId === USER) moved.current = { kind: 'drawing' };
    },
    onPressedMoveEnd: () => endMove(),
    onDoubleClick: ({ overlay }) => {
      if (TEXT_TOOLS.has(overlay.name)) editText(overlay.id);
    },
    onRightClick: (e) => {
      e.preventDefault?.();
      if (e.overlay.groupId !== USER || e.overlay.isDrawing?.()) return;
      setMenu({ id: e.overlay.id, x: e.pageX - window.scrollX, y: e.pageY - window.scrollY });
    },
  };
  const on = {
    onDrawEnd: (e) => handlers.current.onDrawEnd(e),
    onSelected: (e) => handlers.current.onSelected(e),
    onDeselected: (e) => handlers.current.onDeselected(e),
    onPressedMoving: (e) => handlers.current.onPressedMoving(e),
    onPressedMoveEnd: (e) => handlers.current.onPressedMoveEnd(e),
    onDoubleClick: (e) => handlers.current.onDoubleClick(e),
    onRightClick: (e) => handlers.current.onRightClick(e),
  };
  const onRef = useRef(on);

  const createDrawing = useCallback((d) => {
    const c = chartRef.current;
    const st = S.current;
    return c?.createOverlay({
      name: d.name,
      groupId: USER,
      paneId: MAIN,
      points: d.points.map((p) => ({ timestamp: Math.round(st.base + p.t * 1000), value: p.value })),
      styles: d.styles ?? undefined,
      lock: !!d.lock || st.lockedAll,
      visible: d.visible !== false && !st.hiddenAll,
      extendData: d.extendData ?? undefined,
      mode: st.magnet,
      ...onRef.current,
    });
  }, []);
  const restore = useCallback((json) => {
    const c = chartRef.current;
    if (!c) return;
    c.removeOverlay({ groupId: USER });
    setSelected(null);
    for (const d of JSON.parse(json)) createDrawing(d);
  }, [createDrawing]);
  const undo = useCallback(() => {
    const h = S.current.history;
    if (!h.past.length) return;
    h.future.push(h.current);
    h.current = h.past.pop();
    restore(h.current);
    setHistLen({ past: h.past.length, future: h.future.length });
    scheduleSave();
  }, [restore, scheduleSave]);
  const redo = useCallback(() => {
    const h = S.current.history;
    if (!h.future.length) return;
    h.past.push(h.current);
    h.current = h.future.pop();
    restore(h.current);
    setHistLen({ past: h.past.length, future: h.future.length });
    scheduleSave();
  }, [restore, scheduleSave]);

  const cancelDrawing = useCallback(() => {
    const c = chartRef.current;
    if (S.current.drawingId && c) c.removeOverlay({ id: S.current.drawingId });
    S.current.drawingId = null;
    setTool(null);
  }, []);
  function startTool(key) {
    const c = chartRef.current;
    if (!c) return;
    if (S.current.drawingId) c.removeOverlay({ id: S.current.drawingId });
    const st = S.current;
    const id = c.createOverlay({ name: key, groupId: USER, paneId: MAIN, mode: st.magnet, styles: styleFor(st.color, st.size, st.dash), ...onRef.current });
    st.drawingId = id;
    setTool(key);
    setPop(null);
  }
  const pickTool = (group, key) => {
    setGroupPick((g) => ({ ...g, [group]: key }));
    if (tool === key) cancelDrawing();
    else startTool(key);
  };

  const selOverlay = () => (selected ? chartRef.current?.getOverlays({ id: selected })[0] : null);
  const restyle = (patch) => {
    const o = selOverlay();
    if (!o) return;
    const cur = o.styles?.line ?? {};
    const color = patch.color ?? cur.color ?? S.current.color;
    const size = patch.size ?? cur.size ?? 1;
    const dash = patch.dash ?? dashOfStyles(o.styles);
    Object.assign(S.current, { color, size, dash });
    chartRef.current.overrideOverlay({ id: o.id, styles: styleFor(color, size, dash) });
    bump((n) => n + 1);
    commit();
  };
  const setLock = (id, lock) => {
    chartRef.current?.overrideOverlay({ id, lock });
    bump((n) => n + 1);
    commit();
  };
  const setVisible = (id, visible) => {
    chartRef.current?.overrideOverlay({ id, visible });
    if (!visible) setSelected(null);
    commit();
  };
  const removeOne = (id) => {
    chartRef.current?.removeOverlay({ id });
    setSelected(null);
    commit();
  };
  const cloneOne = (id) => {
    const o = chartRef.current?.getOverlays({ id })[0];
    if (!o) return;
    const shift = S.current.tf * 8;
    createDrawing({ name: o.name, points: o.points.map((p) => ({ t: (p.timestamp - S.current.base) / 1000 + shift, value: p.value })), styles: o.styles, extendData: o.extendData });
    commit();
  };
  function editText(id) {
    const o = chartRef.current?.getOverlays({ id })[0];
    if (!o) return;
    promptDialog({ title: 'Edit text', label: 'Text', defaultValue: typeof o.extendData === 'string' ? o.extendData : o.extendData?.text ?? '', confirmLabel: 'Save', maxLength: 200 }).then((text) => {
      if (text == null) return;
      if (!text.trim()) removeOne(id);
      else {
        chartRef.current?.overrideOverlay({ id, extendData: text.trim() });
        commit();
      }
    });
  }
  const removeAll = async () => {
    if (!chartRef.current?.getOverlays({ groupId: USER }).length) return;
    if (!(await confirmDialog({ title: 'Remove all drawings?', message: 'Every line, shape and note on this chart is removed. You can undo this.', confirmLabel: 'Remove all', danger: true }))) return;
    chartRef.current.removeOverlay({ groupId: USER });
    setSelected(null);
    commit();
  };
  useEffect(() => {
    chartRef.current?.overrideOverlay({ groupId: USER, lock: lockedAll });
  }, [lockedAll]);
  useEffect(() => {
    chartRef.current?.overrideOverlay({ groupId: USER, visible: !hiddenAll });
    if (hiddenAll) setSelected(null);
  }, [hiddenAll]);
  useEffect(() => {
    chartRef.current?.overrideOverlay({ groupId: USER, mode: magnet });
  }, [magnet]);

  // ---- Data ---------------------------------------------------------------
  // Move the chart's clock (a lobby learns its real start time), keeping every
  // drawing on the same market second.
  function rebase(next) {
    const st = S.current;
    const c = chartRef.current;
    const delta = next - st.base;
    if (!delta) return;
    if (c) for (const o of c.getOverlays({ groupId: USER })) c.overrideOverlay({ id: o.id, points: o.points.map((p) => ({ timestamp: p.timestamp + delta, value: p.value })) });
    st.base = next;
  }
  const rebaseRef = useRef(rebase);
  rebaseRef.current = rebase;
  const reload = useCallback(() => {
    const st = S.current;
    st.gen += 1;
    st.sub = null;
    st.lastT = null;
    setLoadError(null);
    chartRef.current?.resetData();
  }, []);

  // Feed one-second prices into the forming bar. A gap means we missed some: reload.
  const applyTicks = useCallback((list) => {
    const st = S.current;
    if (!st.sub || st.lastT == null) return;
    let pending = null;
    for (const [t, p, v] of list) {
      if (t <= st.lastT) continue;
      if (t > st.lastT + 1) {
        if (pending) st.sub(pending);
        reload();
        return;
      }
      st.lastT = t;
      const ts = st.base + Math.floor(t / st.tf) * st.tf * 1000;
      let bar = st.rawLast;
      if (bar && bar.timestamp === ts) bar = { ...bar, high: Math.max(bar.high, p), low: Math.min(bar.low, p), close: p, volume: bar.volume + v };
      else {
        if (pending) st.sub(pending);
        const o = bar ? bar.close : p;
        if (st.chartType === 'heikin') st.haBefore = st.shownLast;
        bar = { timestamp: ts, open: o, high: Math.max(o, p), low: Math.min(o, p), close: p, volume: v };
      }
      st.rawLast = bar;
      st.shownLast = st.chartType === 'heikin' ? haBar(bar, st.haBefore) : bar;
      pending = st.shownLast;
    }
    if (pending) st.sub(pending);
  }, [reload]);

  const loader = useMemo(() => ({
    getBars: async ({ type, timestamp, callback }) => {
      const st = S.current;
      const gen = st.gen;
      if (type === 'backward' || type === 'update') return callback([], { backward: false });
      const q = new URLSearchParams({ tf: String(st.tf), limit: '500' });
      if (type === 'forward') q.set('before', String(Math.round((timestamp - st.base) / 1000)));
      if (type === 'init') setLoading(true);
      if (st.until != null) q.set('until', String(st.until));
      try {
        const r = await api.get(`/game/matches/${matchId}/candles?${q}`);
        if (gen !== st.gen) return;
        const bars = r.candles.map((c) => ({ timestamp: c.ts, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v }));
        const shown = st.chartType === 'heikin' ? heikin(bars) : bars;
        if (type === 'init') {
          rebaseRef.current(r.baseMs);
          st.lastT = r.lastT;
          st.rawLast = bars.at(-1) ?? null;
          st.shownLast = shown.at(-1) ?? null;
          st.haBefore = shown.at(-2) ?? null;
          callback(shown, { forward: r.more, backward: false });
          setLoading(false);
          applyTicks(st.buffer);
          syncRef.current();
        } else callback(shown, { forward: r.more });
      } catch (err) {
        if (gen !== st.gen) return;
        if (type === 'init') {
          setLoadError(err.message);
          setLoading(false);
          callback([], false);
        } else callback([], { forward: true });
      }
    },
    subscribeBar: ({ callback }) => {
      S.current.sub = callback;
    },
    unsubscribeBar: () => {
      S.current.sub = null;
    },
  }), [matchId, applyTicks]);

  // Load the saved layout first, then build the chart around it.
  useEffect(() => {
    let alive = true;
    Promise.resolve(pendingSaves.get(matchId)).then(() => api.get(`/game/charts/match:${matchId}`)).then((r) => r.layout).catch(() => null).then((layout) => {
      if (!alive) return;
      if (layout) {
        if (TIMEFRAMES.some((x) => x.tf === layout.tf)) setTf(layout.tf);
        if (CHART_TYPES.some((x) => x.key === layout.chartType)) setChartType(layout.chartType);
        if (['normal', 'logarithm', 'percentage'].includes(layout.yAxis)) setYAxis(layout.yAxis);
        if (Array.isArray(layout.indicators)) setIndicators(layout.indicators.filter((i) => indicatorOf(i?.name)).map((i) => ({ name: i.name, params: Array.isArray(i.params) ? i.params.map(Number) : indicatorOf(i.name).params })));
        if (['normal', 'weak_magnet', 'strong_magnet'].includes(layout.magnet)) setMagnet(layout.magnet);
      }
      S.current.pendingDrawings = Array.isArray(layout?.drawings) ? layout.drawings : [];
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [matchId]);

  useEffect(() => {
    if (!ready || !elRef.current) return undefined;
    registerKotkaOverlays();
    registerKotkaIndicators();
    const el = elRef.current;
    const st = S.current;
    const c = init(el, {
      locale: 'en-US',
      styles: chartStyles(dark, chartType, el.clientWidth < 560),
      formatter: {
        formatDate: ({ timestamp, type }) => {
          const d = new Date(timestamp);
          const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}${S.current.tf < 60 || type !== 'xAxis' ? `:${pad(d.getSeconds())}` : ''}`;
          if (type === 'xAxis') return clock;
          const t = Math.round((timestamp - S.current.base) / 1000);
          const day = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          return `${day} ${clock}${t >= 0 && (!durationSec || t < durationSec) ? ` · match ${mmss(t)}` : ''}`;
        },
      },
    });
    chartRef.current = c;
    c.setSymbol({ ticker: pair?.symbol ?? 'KOTKA', pricePrecision: decimals, volumePrecision: 0 });
    c.setPeriod(periodOf(tf));
    c.overrideYAxis({ paneId: MAIN, name: yAxis, createRange: rangeWithLevels(st) });
    st.gen += 1;
    c.setDataLoader(loader);
    for (const d of st.pendingDrawings ?? []) if (d?.name && Array.isArray(d.points)) createDrawing(d);
    st.history.current = JSON.stringify(serialize());
    c.subscribeAction('onVisibleRangeChange', (range) => {
      const n = c.getDataList().length;
      setAway(n > 0 && range.realTo < n - 1);
    });
    const ro = new ResizeObserver(() => {
      c.resize();
      setCompact(el.clientWidth < 560);
    });
    ro.observe(el);
    const fs = () => setFull(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', fs);
    bump((n) => n + 1);
    return () => {
      ro.disconnect();
      document.removeEventListener('fullscreenchange', fs);
      st.gen += 1;
      st.sub = null;
      dispose(el);
      chartRef.current = null;
    };
    // The chart is built once; later changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Indicators: add, remove or retune to match the list.
  const shownInd = useRef([]);
  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    const prev = shownInd.current;
    const paneOf = (name) => (indicatorOf(name)?.pane === 'main' ? MAIN : `pane_${name}`);
    for (const p of prev) if (!indicators.some((i) => i.name === p.name)) c.removeIndicator({ name: p.name, paneId: paneOf(p.name) });
    for (const i of indicators) {
      const was = prev.find((p) => p.name === i.name);
      const calcParams = i.params?.length ? i.params : undefined;
      if (!was) {
        const paneId = paneOf(i.name);
        c.createIndicator({ name: i.name, paneId, ...(calcParams ? { calcParams } : {}) }, paneId === MAIN);
        if (paneId !== MAIN) c.setPaneOptions({ id: paneId, height: 96, minHeight: 60 });
      } else if (JSON.stringify(was.params) !== JSON.stringify(i.params) && calcParams) c.overrideIndicator({ name: i.name, paneId: paneOf(i.name), calcParams });
    }
    shownInd.current = indicators;
  }, [indicators, ready]);

  useEffect(() => {
    chartRef.current?.setStyles(chartStyles(dark, chartType, compact));
  }, [dark, chartType, compact]);
  const firstType = useRef(true);
  useEffect(() => {
    if (firstType.current) {
      firstType.current = false;
      return;
    }
    reload();
  }, [chartType === 'heikin', reload]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = chartRef.current;
    if (!c || c.getPeriod() === periodOf(tf)) return;
    S.current.gen += 1;
    S.current.sub = null;
    S.current.lastT = null;
    c.setPeriod(periodOf(tf));
  }, [tf]);
  useEffect(() => {
    chartRef.current?.overrideYAxis({ paneId: MAIN, name: yAxis, createRange: rangeWithLevels(S.current) });
  }, [yAxis]);
  useEffect(() => {
    const c = chartRef.current;
    const cur = c?.getSymbol();
    if (!c || (cur?.ticker === (pair?.symbol ?? 'KOTKA') && cur?.pricePrecision === decimals)) return;
    S.current.gen += 1;
    S.current.sub = null;
    S.current.lastT = null;
    c.setSymbol({ ticker: pair?.symbol ?? 'KOTKA', pricePrecision: decimals, volumePrecision: 0 });
  }, [pair?.symbol, decimals]);

  // The start line can move (a lobby learns its start time): keep drawings on their market time.
  useEffect(() => {
    const next = info?.baseMs;
    if (next == null || next === S.current.base || !chartRef.current) return;
    rebase(next);
    reload();
  }, [info?.baseMs, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live prices from the match poll.
  useEffect(() => {
    if (!feed?.length) return;
    const st = S.current;
    const lastBuf = st.buffer.at(-1)?.[0] ?? -Infinity;
    for (const tk of feed) if (tk[0] > lastBuf) st.buffer.push(tk);
    if (st.buffer.length > 1500) st.buffer.splice(0, st.buffer.length - 1500);
    applyTicks(feed);
  }, [feed, applyTicks]);
  const firstEpoch = useRef(feedEpoch);
  useEffect(() => {
    if (feedEpoch === firstEpoch.current) return;
    S.current.buffer = [];
    reload();
  }, [feedEpoch, reload]);

  // Replay: prices for the whole match, revealed up to `until`.
  useEffect(() => {
    if (!replay || !durationSec) return undefined;
    let alive = true;
    (async () => {
      const out = new Map();
      let before = durationSec;
      for (let guard = 0; guard < 10 && before > 0; guard += 1) {
        const r = await api.get(`/game/matches/${matchId}/candles?tf=1&limit=1000&before=${before}`);
        for (const c of r.candles) if (c.t >= 0) out.set(c.t, [c.t, c.c, c.v]);
        const first = r.candles[0]?.t;
        if (first == null || first <= 0 || !r.more) break;
        before = first;
      }
      if (alive) S.current.replayTicks = out;
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [replay, durationSec, matchId]);
  // Bring the chart to the replay position: forward by feeding the saved
  // prices, backward (or a long jump) by reloading. A load in flight calls
  // this again when it lands.
  const backTimer = useRef(null);
  const syncReplay = useCallback(() => {
    const st = S.current;
    if (st.until == null || st.lastT == null || !st.sub || st.until === st.lastT) return;
    if (st.until > st.lastT && st.until - st.lastT <= 900 && st.replayTicks) {
      const list = [];
      for (let t = st.lastT + 1; t <= st.until; t += 1) {
        const tk = st.replayTicks.get(t);
        if (!tk) break;
        list.push(tk);
      }
      if (list.length === st.until - st.lastT) return applyTicks(list);
    }
    if (st.reloadedFor === st.until) return;
    st.reloadedFor = st.until;
    clearTimeout(backTimer.current);
    backTimer.current = setTimeout(reload, 120);
  }, [applyTicks, reload]);
  syncRef.current = syncReplay;
  useEffect(() => {
    const st = S.current;
    const next = until == null ? null : durationSec ? Math.min(until, durationSec - 1) : until;
    if (!replay || st.until === next) return;
    st.until = next;
    st.reloadedFor = null;
    syncReplay();
  }, [until, replay, durationSec, syncReplay]);
  useEffect(() => () => clearTimeout(backTimer.current), []);

  // Your stop, target and entry; trade markers; the match start line.
  const levelsKey = JSON.stringify(levels);
  const dragRef = useRef(onLevelDrag);
  dragRef.current = onLevelDrag;
  const canDrag = !!onLevelDrag;
  const drawLevels = useCallback(() => {
    const c = chartRef.current;
    if (!c) return;
    c.removeOverlay({ groupId: LEVELS });
    c.overrideYAxis({ paneId: MAIN, name: S.current.yAxis, createRange: rangeWithLevels(S.current) });
    const ts = c.getDataList().at(-1)?.timestamp ?? S.current.base;
    for (const l of levels) {
      const draggable = !!(l.draggable && canDrag);
      c.createOverlay({
        name: 'kLevel',
        groupId: LEVELS,
        paneId: MAIN,
        lock: !draggable,
        zLevel: 5,
        points: [{ timestamp: ts, value: l.price }],
        extendData: { label: l.label, color: l.color, dashed: l.dashed, draggable },
        onPressedMoving: draggable
          ? ({ overlay }) => {
              moved.current = { kind: 'level', key: l.key, value: Number(Number(overlay.points[0]?.value).toFixed(decimals)) };
            }
          : undefined,
        onPressedMoveEnd: draggable ? () => endMoveRef.current() : undefined,
        // Right-click would otherwise delete the line from the chart.
        onRightClick: (e) => e.preventDefault?.(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelsKey, canDrag, decimals]);
  const drawLevelsRef = useRef(drawLevels);
  drawLevelsRef.current = drawLevels;
  endMoveRef.current = () => {
    const m = moved.current;
    if (!m) return;
    moved.current = null;
    if (m.kind === 'drawing') commit();
    else Promise.resolve(dragRef.current?.(m.key, m.value)).finally(() => drawLevelsRef.current());
  };
  useEffect(() => {
    drawLevels();
  }, [drawLevels, ready]);

  const markersKey = JSON.stringify(markers);
  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    c.removeOverlay({ groupId: TRADES });
    const st = S.current;
    for (const mk of markers) {
      c.createOverlay({ name: 'kTrade', groupId: TRADES, paneId: MAIN, lock: true, zLevel: 6, points: [{ timestamp: st.base + Math.floor(mk.t / tf) * tf * 1000, value: mk.price }], extendData: { kind: mk.kind, who: mk.who } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersKey, tf, ready, info?.baseMs]);
  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    c.removeOverlay({ groupId: SYSTEM });
    c.createOverlay({ name: 'kVLine', groupId: SYSTEM, paneId: MAIN, lock: true, points: [{ timestamp: S.current.base + Math.floor(0 / tf) * tf * 1000, value: 0 }], extendData: { label: 'Match start', side: 'left' } });
    if (durationSec) c.createOverlay({ name: 'kVLine', groupId: SYSTEM, paneId: MAIN, lock: true, points: [{ timestamp: S.current.base + Math.floor(durationSec / tf) * tf * 1000, value: 0 }], extendData: { label: 'Match end', color: '#8A7F72' } });
  }, [tf, ready, info?.baseMs, durationSec]);

  useEffect(() => {
    if (focusT == null || !chartRef.current) return;
    chartRef.current.scrollToTimestamp(S.current.base + Math.floor(focusT / tf) * tf * 1000, 200);
  }, [focusT, tf]);

  // Keyboard: Delete removes the selected drawing, Esc cancels, Ctrl+Z undoes.
  useEffect(() => {
    const key = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable || document.querySelector('[role="dialog"]')) return;
      if (e.key === 'Escape') {
        if (S.current.drawingId) cancelDrawing();
        setMenu(null);
        setPop(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        removeOne(selected);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  // ---- Toolbar actions ----------------------------------------------------
  const screenshot = () => {
    const c = chartRef.current;
    if (!c) return;
    const a = document.createElement('a');
    a.href = c.getConvertPictureUrl(true, 'png', dark ? '#0C0C0E' : '#FFFFFF');
    a.download = `Kotka ${pair?.symbol?.replace('/', '-') ?? 'chart'} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.png`;
    a.click();
  };
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else wrapRef.current?.requestFullscreen?.().catch(() => toast('Full screen isn’t available here.', { tone: 'error' }));
  };
  const addIndicator = (name) => setIndicators((list) => (list.some((i) => i.name === name) ? list : [...list, { name, params: [...(indicatorOf(name)?.params ?? [])] }]));
  const removeIndicator = (name) => setIndicators((list) => list.filter((i) => i.name !== name));
  const setParams = (name, params) => setIndicators((list) => list.map((i) => (i.name === name ? { ...i, params } : i)));

  const sel = selOverlay();
  const selStyles = sel?.styles ?? {};
  const TypeIcon = TYPE_ICON[chartType] ?? ChartCandlestick;
  const activeTool = toolOf(tool);
  const magnetLabel = { normal: 'Magnet off', weak_magnet: 'Weak magnet: snaps to candle prices when close', strong_magnet: 'Strong magnet: always snaps to open, high, low or close' };
  const utilities = [
    { key: 'magnet', icon: Magnet, on: magnet !== 'normal', dot: magnet === 'strong_magnet', title: magnetLabel[magnet], run: () => setMagnet((m) => (m === 'normal' ? 'weak_magnet' : m === 'weak_magnet' ? 'strong_magnet' : 'normal')) },
    { key: 'stay', icon: stay ? Pin : PinOff, on: stay, title: stay ? 'Keep drawing: on. The tool stays picked' : 'Keep drawing: off', run: () => setStay((v) => !v) },
    { key: 'lock', icon: lockedAll ? Lock : LockOpen, on: lockedAll, title: lockedAll ? 'Unlock all drawings' : 'Lock all drawings', run: () => setLockedAll((v) => !v) },
    { key: 'hide', icon: hiddenAll ? EyeOff : Eye, on: hiddenAll, title: hiddenAll ? 'Show drawings' : 'Hide drawings', run: () => setHiddenAll((v) => !v) },
    { key: 'clear', icon: Trash2, on: false, title: 'Remove all drawings', run: removeAll },
  ];

  return (
    <div ref={wrapRef} className={clsx('flex flex-col rounded-xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900', full && 'h-full rounded-none')}>
      {/* Top bar: pair, timeframes, chart type, indicators, undo, axis, capture */}
      <div className="flex flex-wrap items-center gap-1 border-b border-ink-100 px-2 py-1 dark:border-ink-800">
        <button type="button" onClick={() => setDialog('pairs')} className={clsx(barBtn, 'text-sm font-semibold text-ink-900 dark:text-ink-50')} title="Kotka pairs">
          <Search className="h-3.5 w-3.5 text-ink-400" /> {pair?.symbol ?? 'Kotka market'}
        </button>
        <span className="hidden text-[11px] text-ink-400 lg:inline">{pair?.name} · synthetic</span>
        <span className="mx-1 hidden h-5 w-px bg-ink-100 dark:bg-ink-800 sm:block" />
        <div className="relative sm:hidden">
          <button type="button" data-pop-trigger onClick={() => setPop(pop === 'tf' ? null : 'tf')} className={clsx(barBtn, 'tabular-nums')} title="Timeframe">
            {TIMEFRAMES.find((x) => x.tf === tf)?.label} <ChevronDown className="h-3 w-3" />
          </button>
          <Pop open={pop === 'tf'} onClose={() => setPop(null)} className="left-0 top-9 grid w-44 grid-cols-3 gap-1 p-1.5">
            {TIMEFRAMES.map((x) => (
              <button key={x.tf} type="button" onClick={() => { setTf(x.tf); setPop(null); }} className={clsx('h-8 rounded-md text-xs font-medium tabular-nums', tf === x.tf ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800')}>
                {x.label}
              </button>
            ))}
          </Pop>
        </div>
        <div className="hidden max-w-full items-center overflow-x-auto scrollbar-thin sm:flex" role="group" aria-label="Timeframe">
          {TIMEFRAMES.map((x) => (
            <button key={x.tf} type="button" onClick={() => setTf(x.tf)} aria-pressed={tf === x.tf} className={clsx('h-8 shrink-0 rounded-md px-2 text-xs font-medium tabular-nums', tf === x.tf ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-50')}>
              {x.label}
            </button>
          ))}
        </div>
        <span className="mx-1 hidden h-5 w-px bg-ink-100 dark:bg-ink-800 sm:block" />
        <div className="relative">
          <button type="button" data-pop-trigger onClick={() => setPop(pop === 'type' ? null : 'type')} className={barBtn} title="Chart type">
            <TypeIcon className="h-4 w-4" /> <span className="hidden sm:inline">{CHART_TYPES.find((x) => x.key === chartType)?.label}</span> <ChevronDown className="h-3 w-3" />
          </button>
          <Pop open={pop === 'type'} onClose={() => setPop(null)} className="left-0 top-9 w-44">
            {CHART_TYPES.map((x) => {
              const I = TYPE_ICON[x.key];
              return (
                <button key={x.key} type="button" onClick={() => { setChartType(x.key); setPop(null); }} className={clsx(menuItem, chartType === x.key && 'bg-ink-50 dark:bg-ink-800')}>
                  <I className="h-4 w-4" /> {x.label}
                </button>
              );
            })}
            <div className="mt-1 border-t border-ink-100 px-2.5 pb-1 pt-2 dark:border-ink-800 sm:hidden">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">Price scale</p>
              <div className="flex gap-1">
                {[['normal', 'Auto'], ['logarithm', 'Log'], ['percentage', '%']].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => { setYAxis(k); setPop(null); }} className={clsx('h-7 flex-1 rounded text-[11px] font-medium', yAxis === k ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-ink-50 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </Pop>
        </div>
        <button type="button" onClick={() => setDialog('indicators')} className={barBtn} title="Indicators">
          <Sigma className="h-4 w-4" /> <span className="hidden sm:inline">Indicators</span>{indicators.length ? <span className="rounded bg-ink-100 px-1 text-[10px] tabular-nums dark:bg-ink-800">{indicators.length}</span> : null}
        </button>
        <span className="mx-1 hidden h-5 w-px bg-ink-100 dark:bg-ink-800 sm:block" />
        <button type="button" onClick={undo} disabled={!histLen.past} className={iconBtn} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
        <button type="button" onClick={redo} disabled={!histLen.future} className={iconBtn} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Redo2 className="h-4 w-4" /></button>
        <div className="ml-auto flex items-center gap-0.5">
          <div className="hidden items-center rounded-md bg-ink-50 p-0.5 dark:bg-ink-800 sm:flex" role="group" aria-label="Price scale">
            {[['normal', 'Auto'], ['logarithm', 'Log'], ['percentage', '%']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setYAxis(k)} aria-pressed={yAxis === k} className={clsx('h-7 rounded px-1.5 text-[11px] font-medium', yAxis === k ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-ink-50' : 'text-ink-500 dark:text-ink-400')}>
                {l}
              </button>
            ))}
          </div>
          <button type="button" onClick={screenshot} className={iconBtn} title="Save a picture of the chart" aria-label="Save a picture of the chart"><Camera className="h-4 w-4" /></button>
          <button type="button" onClick={toggleFull} className={iconBtn} title={full ? 'Exit full screen' : 'Full screen'} aria-label={full ? 'Exit full screen' : 'Full screen'}>{full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: drawing tools */}
        <div className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-ink-100 py-1 dark:border-ink-800" role="toolbar" aria-label="Drawing tools" aria-orientation="vertical">
          <button type="button" onClick={cancelDrawing} aria-pressed={!tool} className={clsx(sideBtn, !tool && 'bg-ink-100 text-ink-900 dark:bg-ink-800 dark:text-ink-50')} title="Cursor"><MousePointer2 className="h-4 w-4" /></button>
          {TOOL_GROUPS.map((g, gi) => {
            const t = toolOf(groupPick[g.key]) ?? g.tools[0];
            const Icon = t.icon;
            const activeHere = g.tools.some((x) => x.key === tool);
            return (
              <div key={g.key} className="relative">
                <button type="button" onClick={() => pickTool(g.key, t.key)} aria-pressed={activeHere} className={clsx(sideBtn, activeHere && 'bg-accent-500/15 text-accent-700 dark:text-accent-300')} title={t.label}>
                  <Icon className="h-4 w-4" />
                </button>
                <button type="button" data-pop-trigger onClick={() => setPop(pop === g.key ? null : g.key)} aria-label={`More ${g.label.toLowerCase()}`} className="absolute -right-0.5 bottom-0 flex h-3.5 w-3 items-end justify-center text-ink-300 hover:text-ink-700 dark:text-ink-600 dark:hover:text-ink-200">
                  <svg viewBox="0 0 6 6" className="h-1.5 w-1.5" aria-hidden="true"><path d="M6 0v6H0z" fill="currentColor" /></svg>
                </button>
                <Pop open={pop === g.key} onClose={() => setPop(null)} className={clsx('left-10 w-56', gi >= 3 ? 'bottom-0' : 'top-0')}>
                  <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">{g.label}</p>
                  {g.tools.map((x) => {
                    const I = x.icon;
                    return (
                      <button key={x.key} type="button" onClick={() => pickTool(g.key, x.key)} className={clsx(menuItem, tool === x.key && 'bg-ink-50 dark:bg-ink-800')}>
                        <I className="h-4 w-4" /> {x.label}
                      </button>
                    );
                  })}
                </Pop>
              </div>
            );
          })}
          <span className="my-1 h-px w-6 bg-ink-100 dark:bg-ink-800" />
          <div className="hidden flex-col items-center gap-0.5 md:flex">
            {utilities.map((u) => (
              <button key={u.key} type="button" onClick={u.run} aria-pressed={u.on} className={clsx(sideBtn, u.on && 'bg-accent-500/15 text-accent-700 dark:text-accent-300')} title={u.title}>
                <u.icon className="h-4 w-4" />
                {u.dot ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent-500" /> : null}
              </button>
            ))}
          </div>
          <div className="relative md:hidden">
            <button type="button" data-pop-trigger onClick={() => setPop(pop === 'more' ? null : 'more')} className={sideBtn} title="Drawing options" aria-label="Drawing options">
              <MoreVertical className="h-4 w-4" />
            </button>
            <Pop open={pop === 'more'} onClose={() => setPop(null)} className="bottom-0 left-10 w-60">
              {utilities.map((u) => (
                <button key={u.key} type="button" onClick={() => { u.run(); setPop(null); }} className={clsx(menuItem, u.on && 'text-accent-700 dark:text-accent-300')}>
                  <u.icon className="h-4 w-4 shrink-0" /> {u.title}
                </button>
              ))}
            </Pop>
          </div>
        </div>

        {/* The chart */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-br-xl">
          <div ref={elRef} className="w-full" style={{ height: full ? '100%' : `clamp(360px, 72vh, ${height}px)` }} />
          {!ready ? <div className="absolute inset-0 animate-pulse bg-ink-50 dark:bg-ink-900" /> : null}
          {ready && loading && !loadError ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="animate-pulse rounded-lg bg-white/90 px-3 py-1.5 text-xs text-ink-500 shadow-sm dark:bg-ink-900/90 dark:text-ink-400">Loading the market…</span>
            </div>
          ) : null}
          {loadError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 text-center dark:bg-ink-950/90">
              <p className="text-sm text-ink-700 dark:text-ink-200">The chart didn’t load.</p>
              <p className="max-w-xs text-xs text-ink-500 dark:text-ink-400">{loadError}</p>
              <button type="button" onClick={reload} className={clsx(barBtn, 'border border-ink-200 dark:border-ink-700')}><RotateCcw className="h-3.5 w-3.5" /> Try again</button>
            </div>
          ) : null}

          {/* Selected drawing: colour, width, line style, lock, copy, delete */}
          {sel ? (
            <div className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-ink-100 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-900">
              <div className="relative">
                <button type="button" data-pop-trigger onClick={() => setPop(pop === 'color' ? null : 'color')} className={iconBtn} title="Colour" aria-label="Colour">
                  <span className="h-4 w-4 rounded-full border border-ink-200 dark:border-ink-600" style={{ background: selStyles.line?.color ?? COLORS[0] }} />
                </button>
                <Pop open={pop === 'color'} onClose={() => setPop(null)} className="left-0 top-9 grid w-40 grid-cols-5 gap-1 p-2">
                  {COLORS.map((col) => (
                    <button key={col} type="button" onClick={() => { restyle({ color: col }); setPop(null); }} aria-label={`Colour ${col}`} className={clsx('h-6 w-6 rounded-full border', (selStyles.line?.color ?? COLORS[0]) === col ? 'border-ink-900 ring-2 ring-accent-500 dark:border-white' : 'border-ink-200 dark:border-ink-600')} style={{ background: col }} />
                  ))}
                </Pop>
              </div>
              {[1, 2, 3, 4].map((w) => (
                <button key={w} type="button" onClick={() => restyle({ size: w })} aria-pressed={(selStyles.line?.size ?? 1) === w} className={clsx(iconBtn, (selStyles.line?.size ?? 1) === w && 'bg-ink-100 dark:bg-ink-800')} title={`Line width ${w}`}>
                  <span className="w-4 rounded-full bg-current" style={{ height: w }} />
                </button>
              ))}
              {['solid', 'dashed', 'dotted'].map((d) => (
                <button key={d} type="button" onClick={() => restyle({ dash: d })} aria-pressed={dashOfStyles(selStyles) === d} className={clsx(iconBtn, dashOfStyles(selStyles) === d && 'bg-ink-100 dark:bg-ink-800')} title={`${d[0].toUpperCase()}${d.slice(1)} line`}>
                  <span className="w-4 border-t-2 border-current" style={{ borderStyle: d }} />
                </button>
              ))}
              {TEXT_TOOLS.has(sel.name) ? <button type="button" onClick={() => editText(sel.id)} className={iconBtn} title="Edit text" aria-label="Edit text"><Type className="h-4 w-4" /></button> : null}
              <span className="mx-0.5 h-5 w-px bg-ink-100 dark:bg-ink-800" />
              <button type="button" onClick={() => setLock(sel.id, !sel.lock)} className={iconBtn} title={sel.lock ? 'Unlock' : 'Lock in place'} aria-label={sel.lock ? 'Unlock' : 'Lock in place'}>{sel.lock ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}</button>
              <button type="button" onClick={() => cloneOne(sel.id)} className={iconBtn} title="Copy" aria-label="Copy"><Copy className="h-4 w-4" /></button>
              <button type="button" onClick={() => removeOne(sel.id)} className={clsx(iconBtn, 'hover:text-loss-500')} title="Delete (Del)" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
            </div>
          ) : null}

          {activeTool ? (
            <div className="pointer-events-none absolute bottom-9 left-2 z-10 max-w-[80%] rounded-lg bg-ink-900/85 px-2.5 py-1.5 text-[11px] text-white dark:bg-white/90 dark:text-ink-900">
              <span className="font-semibold">{activeTool.label}.</span> {howTo(activeTool)} Esc to cancel.
            </div>
          ) : null}

          <div className="absolute bottom-9 right-16 z-10 flex items-center gap-0.5 rounded-lg border border-ink-100 bg-white/90 p-0.5 opacity-70 transition-opacity hover:opacity-100 dark:border-ink-700 dark:bg-ink-900/90">
            <button type="button" onClick={() => chartRef.current?.zoomAtCoordinate(0.8)} className="flex h-7 w-7 items-center justify-center rounded text-ink-500 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50" title="Zoom out" aria-label="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => chartRef.current?.zoomAtCoordinate(1.25)} className="flex h-7 w-7 items-center justify-center rounded text-ink-500 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50" title="Zoom in" aria-label="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => { chartRef.current?.setBarSpace(8); chartRef.current?.scrollToRealTime(200); }} className="flex h-7 w-7 items-center justify-center rounded text-ink-500 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50" title="Reset the view" aria-label="Reset the view"><RotateCcw className="h-3.5 w-3.5" /></button>
          </div>
          {away ? (
            <button type="button" onClick={() => chartRef.current?.scrollToRealTime(300)} className="absolute bottom-9 right-2 z-10 flex h-8 items-center gap-1 rounded-lg bg-ink-900 px-2 text-[11px] font-medium text-white shadow-pop dark:bg-white dark:text-ink-900" title={replay ? 'Go to the replay position' : 'Go to the latest price'}>
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {menu ? (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="fixed z-50 w-44 rounded-xl border border-ink-100 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-900" style={{ left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 200) }}>
            {(() => {
              const o = chartRef.current?.getOverlays({ id: menu.id })[0];
              if (!o) return null;
              const close = (fn) => () => {
                setMenu(null);
                fn();
              };
              return (
                <>
                  {TEXT_TOOLS.has(o.name) ? <button type="button" className={menuItem} onClick={close(() => editText(o.id))}><Type className="h-4 w-4" /> Edit text</button> : null}
                  <button type="button" className={menuItem} onClick={close(() => setLock(o.id, !o.lock))}>{o.lock ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />} {o.lock ? 'Unlock' : 'Lock in place'}</button>
                  <button type="button" className={menuItem} onClick={close(() => cloneOne(o.id))}><Copy className="h-4 w-4" /> Copy</button>
                  <button type="button" className={menuItem} onClick={close(() => setVisible(o.id, false))}><EyeOff className="h-4 w-4" /> Hide</button>
                  <button type="button" className={clsx(menuItem, 'text-loss-500 dark:text-loss-400')} onClick={close(() => removeOne(o.id))}><Trash2 className="h-4 w-4" /> Delete</button>
                </>
              );
            })()}
          </div>
        </>
      ) : null}

      <IndicatorDialog open={dialog === 'indicators'} onClose={() => setDialog(null)} active={indicators} onAdd={addIndicator} onRemove={removeIndicator} onParams={setParams} />
      <PairDialog
        open={dialog === 'pairs'}
        onClose={() => setDialog(null)}
        pair={pair}
        pairs={pairs ?? (pair ? [pair] : [])}
        onPick={onPickPair ? (sym) => { setDialog(null); onPickPair(sym); } : null}
        note={pairNote}
      />
    </div>
  );
}
