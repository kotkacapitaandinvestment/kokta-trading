// What the chart offers: drawing tools, indicators, timeframes, chart types.
import { registerIndicator } from 'klinecharts';
import {
  TrendingUp, MoveUpRight, MoveRight, Minus, SeparatorVertical, SeparatorHorizontal, ArrowUpRight, Columns2, GitFork, Rows3, Waves,
  Square, Circle, Triangle, Brush, Type, StickyNote, Tag, Ruler, CalendarRange, ArrowUpFromLine, ArrowDownFromLine,
} from 'lucide-react';

// overlay: the KLineChart overlay name. steps: how many clicks it takes.
export const TOOL_GROUPS = [
  {
    key: 'lines',
    label: 'Lines',
    tools: [
      { key: 'segment', label: 'Trend line', icon: TrendingUp, steps: 2 },
      { key: 'rayLine', label: 'Ray', icon: MoveUpRight, steps: 2 },
      { key: 'straightLine', label: 'Extended line', icon: MoveRight, steps: 2 },
      { key: 'horizontalStraightLine', label: 'Horizontal line', icon: Minus, steps: 1 },
      { key: 'horizontalRayLine', label: 'Horizontal ray', icon: SeparatorHorizontal, steps: 1 },
      { key: 'horizontalSegment', label: 'Horizontal segment', icon: Minus, steps: 2 },
      { key: 'verticalStraightLine', label: 'Vertical line', icon: SeparatorVertical, steps: 1 },
      { key: 'priceLine', label: 'Price line', icon: Tag, steps: 1 },
      { key: 'kArrow', label: 'Arrow', icon: ArrowUpRight, steps: 2 },
    ],
  },
  {
    key: 'channels',
    label: 'Channels and pitchfork',
    tools: [
      { key: 'parallelStraightLine', label: 'Parallel channel', icon: Columns2, steps: 3 },
      { key: 'priceChannelLine', label: 'Price channel', icon: Rows3, steps: 3 },
      { key: 'kPitchfork', label: 'Pitchfork', icon: GitFork, steps: 3 },
    ],
  },
  {
    key: 'fib',
    label: 'Fibonacci',
    tools: [
      { key: 'fibonacciLine', label: 'Fib retracement', icon: Waves, steps: 2 },
      { key: 'kFibExtension', label: 'Fib extension', icon: Waves, steps: 3 },
    ],
  },
  {
    key: 'shapes',
    label: 'Shapes',
    tools: [
      { key: 'kRect', label: 'Rectangle', icon: Square, steps: 2 },
      { key: 'kCircle', label: 'Circle', icon: Circle, steps: 2 },
      { key: 'kTriangle', label: 'Triangle', icon: Triangle, steps: 3 },
      { key: 'brush', label: 'Brush (freehand)', icon: Brush, steps: 0 },
    ],
  },
  {
    key: 'notes',
    label: 'Text and notes',
    tools: [
      { key: 'kText', label: 'Text', icon: Type, steps: 1 },
      { key: 'simpleAnnotation', label: 'Note', icon: StickyNote, steps: 1 },
      { key: 'simpleTag', label: 'Price tag', icon: Tag, steps: 1 },
    ],
  },
  {
    key: 'measure',
    label: 'Measure and positions',
    tools: [
      { key: 'kPriceRange', label: 'Price range', icon: Ruler, steps: 2 },
      { key: 'kDateRange', label: 'Date range', icon: CalendarRange, steps: 2 },
      { key: 'kLong', label: 'Long position', icon: ArrowUpFromLine, steps: 3 },
      { key: 'kShort', label: 'Short position', icon: ArrowDownFromLine, steps: 3 },
    ],
  },
];
export const TOOLS = TOOL_GROUPS.flatMap((g) => g.tools);
export const toolOf = (key) => TOOLS.find((t) => t.key === key);

// How to place each tool, for the hint under the toolbar.
export function howTo(tool) {
  if (!tool) return '';
  if (tool.key === 'brush') return 'Press and drag to draw. Release to finish.';
  if (tool.key === 'kLong' || tool.key === 'kShort') return 'Click the entry, then the target, then the stop.';
  if (tool.key === 'kFibExtension') return 'Click the start of the move, its end, then where the pullback ended.';
  if (tool.key === 'kPitchfork') return 'Click the pivot, then the two swing points.';
  if (tool.steps === 1) return 'Click on the chart to place it.';
  return `Click ${tool.steps} points on the chart.`;
}

// pane 'main' draws over the price; 'sub' gets its own panel.
export const INDICATORS = [
  { name: 'MA', label: 'Moving average', pane: 'main', params: [20, 50] },
  { name: 'EMA', label: 'Exponential moving average', pane: 'main', params: [9, 21] },
  { name: 'SMA', label: 'Smoothed moving average', pane: 'main', params: [12, 2] },
  { name: 'BOLL', label: 'Bollinger Bands', pane: 'main', params: [20, 2] },
  { name: 'VWAP', label: 'Volume-weighted average price', pane: 'main', params: [] },
  { name: 'SAR', label: 'Parabolic SAR', pane: 'main', params: [2, 2, 20] },
  { name: 'BBI', label: 'Bull and bear index', pane: 'main', params: [3, 6, 12, 24] },
  { name: 'AVP', label: 'Average price', pane: 'main', params: [] },
  { name: 'VOL', label: 'Volume', pane: 'sub', params: [5, 10, 20] },
  { name: 'RSI', label: 'Relative strength index', pane: 'sub', params: [14] },
  { name: 'MACD', label: 'MACD', pane: 'sub', params: [12, 26, 9] },
  { name: 'KDJ', label: 'Stochastic (KDJ)', pane: 'sub', params: [9, 3, 3] },
  { name: 'ATR', label: 'Average true range', pane: 'sub', params: [14] },
  { name: 'CCI', label: 'Commodity channel index', pane: 'sub', params: [20] },
  { name: 'WR', label: 'Williams %R', pane: 'sub', params: [6, 10, 14] },
  { name: 'DMI', label: 'Directional movement', pane: 'sub', params: [14, 6] },
  { name: 'OBV', label: 'On-balance volume', pane: 'sub', params: [30] },
  { name: 'MTM', label: 'Momentum', pane: 'sub', params: [12, 6] },
  { name: 'ROC', label: 'Rate of change', pane: 'sub', params: [12, 6] },
  { name: 'TRIX', label: 'Triple exponential average', pane: 'sub', params: [12, 9] },
  { name: 'BIAS', label: 'Bias ratio', pane: 'sub', params: [6, 12, 24] },
  { name: 'PSY', label: 'Psychological line', pane: 'sub', params: [12, 6] },
  { name: 'AO', label: 'Awesome oscillator', pane: 'sub', params: [5, 34] },
  { name: 'CR', label: 'Energy index (CR)', pane: 'sub', params: [26, 10, 20, 40, 60] },
  { name: 'BRAR', label: 'Sentiment (BRAR)', pane: 'sub', params: [26] },
  { name: 'VR', label: 'Volume ratio', pane: 'sub', params: [26, 6] },
  { name: 'EMV', label: 'Ease of movement', pane: 'sub', params: [14, 9] },
  { name: 'PVT', label: 'Price and volume trend', pane: 'sub', params: [] },
  { name: 'DMA', label: 'Different of moving average', pane: 'sub', params: [10, 50, 10] },
];
export const indicatorOf = (name) => INDICATORS.find((i) => i.name === name);

export const TIMEFRAMES = [
  { tf: 1, label: '1s', period: { type: 'second', span: 1 } },
  { tf: 5, label: '5s', period: { type: 'second', span: 5 } },
  { tf: 15, label: '15s', period: { type: 'second', span: 15 } },
  { tf: 30, label: '30s', period: { type: 'second', span: 30 } },
  { tf: 60, label: '1m', period: { type: 'minute', span: 1 } },
  { tf: 180, label: '3m', period: { type: 'minute', span: 3 } },
  { tf: 300, label: '5m', period: { type: 'minute', span: 5 } },
  { tf: 900, label: '15m', period: { type: 'minute', span: 15 } },
  { tf: 1800, label: '30m', period: { type: 'minute', span: 30 } },
  { tf: 3600, label: '1h', period: { type: 'hour', span: 1 } },
  { tf: 7200, label: '2h', period: { type: 'hour', span: 2 } },
  { tf: 14400, label: '4h', period: { type: 'hour', span: 4 } },
];

export const CHART_TYPES = [
  { key: 'candle_solid', label: 'Candles' },
  { key: 'candle_stroke', label: 'Hollow candles' },
  { key: 'heikin', label: 'Heikin Ashi' },
  { key: 'ohlc', label: 'Bars' },
  { key: 'line', label: 'Line' },
  { key: 'area', label: 'Area' },
];

// Indicators KLineChart doesn't ship.
let registered = false;
export function registerKotkaIndicators() {
  if (registered) return;
  registered = true;
  registerIndicator({
    name: 'ATR',
    shortName: 'ATR',
    calcParams: [14],
    figures: [{ key: 'atr', title: 'ATR: ', type: 'line' }],
    calc: (list, ind) => {
      const n = ind.calcParams[0] ?? 14;
      let prev = null;
      let sum = 0;
      return list.map((k, i) => {
        const tr = i ? Math.max(k.high - k.low, Math.abs(k.high - list[i - 1].close), Math.abs(k.low - list[i - 1].close)) : k.high - k.low;
        if (i < n) {
          sum += tr;
          if (i === n - 1) prev = sum / n;
          return { atr: i === n - 1 ? prev : undefined };
        }
        prev = (prev * (n - 1) + tr) / n;
        return { atr: prev };
      });
    },
  });
  registerIndicator({
    name: 'VWAP',
    shortName: 'VWAP',
    series: 'price',
    precision: 4,
    figures: [{ key: 'vwap', title: 'VWAP: ', type: 'line' }],
    calc: (list) => {
      let pv = 0;
      let v = 0;
      return list.map((k) => {
        const tp = (k.high + k.low + k.close) / 3;
        pv += tp * (k.volume ?? 0);
        v += k.volume ?? 0;
        return { vwap: v ? pv / v : k.close };
      });
    },
  });
}
