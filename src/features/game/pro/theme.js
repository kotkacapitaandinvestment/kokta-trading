// KLineChart styles in Kotka's palette, light and dark.
import { CHART_COLORS } from '../../../lib/chartColors';

const UP = CHART_COLORS.profit;
const DOWN = CHART_COLORS.loss;

// compact: a narrow (phone) chart shows its price legend only while you touch it.
export function chartStyles(dark, chartType = 'candle_solid', compact = false) {
  const text = dark ? '#B8AE9F' : '#6F665B';
  const grid = dark ? '#1F1D1A' : '#F1ECE3';
  const axis = dark ? '#2A2723' : '#E6DFD2';
  const bg = dark ? '#0C0C0E' : '#FFFFFF';
  const strong = dark ? '#EDE8DD' : '#26231F';
  const line = (color, size = 1) => ({ color, size, style: 'solid', dashedValue: [2, 2], smooth: false });
  return {
    grid: { show: true, horizontal: { show: true, size: 1, color: grid, style: 'solid' }, vertical: { show: true, size: 1, color: grid, style: 'solid' } },
    candle: {
      type: chartType === 'line' ? 'area' : chartType === 'heikin' ? 'candle_solid' : chartType,
      bar: { upColor: UP, downColor: DOWN, noChangeColor: text, upBorderColor: UP, downBorderColor: DOWN, noChangeBorderColor: text, upWickColor: UP, downWickColor: DOWN, noChangeWickColor: text },
      area: chartType === 'line' ? { lineSize: 2, lineColor: CHART_COLORS.accent, value: 'close', backgroundColor: [{ offset: 0, color: 'rgba(209,168,91,0)' }, { offset: 1, color: 'rgba(209,168,91,0)' }] } : { lineSize: 2, lineColor: CHART_COLORS.accent, value: 'close', backgroundColor: [{ offset: 0, color: 'rgba(209,168,91,0.02)' }, { offset: 1, color: 'rgba(209,168,91,0.25)' }] },
      priceMark: {
        show: true,
        high: { show: true, color: text, textSize: 10 },
        low: { show: true, color: text, textSize: 10 },
        last: { show: true, upColor: UP, downColor: DOWN, noChangeColor: text, line: { show: true, style: 'dashed', dashedValue: [3, 3], size: 1 }, text: { show: true, size: 11, paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3, borderRadius: 2, color: '#FFFFFF' } },
      },
      tooltip: { showRule: compact ? 'follow_cross' : 'always', showType: compact ? 'rect' : 'standard', text: { size: 11, color: text, marginLeft: 8, marginTop: 6, marginRight: 8, marginBottom: 0 }, rect: { color: dark ? 'rgba(12,12,14,0.92)' : 'rgba(255,255,255,0.94)', borderColor: axis, borderSize: 1, borderRadius: 6 } },
    },
    indicator: {
      lastValueMark: { show: false },
      tooltip: { showRule: compact ? 'follow_cross' : 'always', showType: 'standard', text: { size: compact ? 10 : 11, color: text, marginLeft: 8, marginTop: 4 } },
      lines: [line(CHART_COLORS.accent), line('#2a78d6'), line('#8E5AC8'), line('#1BA39C'), line('#C24A7A')],
    },
    xAxis: { axisLine: { show: true, color: axis, size: 1 }, tickLine: { show: true, color: axis, size: 1, length: 3 }, tickText: { color: text, size: 11 } },
    yAxis: { axisLine: { show: true, color: axis, size: 1 }, tickLine: { show: true, color: axis, size: 1, length: 3 }, tickText: { color: text, size: 11 } },
    separator: { size: 1, color: axis, fill: true, activeBackgroundColor: 'rgba(209,168,91,0.15)' },
    crosshair: {
      horizontal: { line: { color: strong + '66', style: 'dashed', dashedValue: [4, 3], size: 1 }, text: { color: bg, backgroundColor: strong, borderColor: strong, size: 11 } },
      vertical: { line: { color: strong + '66', style: 'dashed', dashedValue: [4, 3], size: 1 }, text: { color: bg, backgroundColor: strong, borderColor: strong, size: 11 } },
    },
    overlay: {
      point: { color: CHART_COLORS.accent, borderColor: CHART_COLORS.accent + '55', borderSize: 1, radius: 5, activeColor: CHART_COLORS.accent, activeBorderColor: CHART_COLORS.accent + '55', activeBorderSize: 3, activeRadius: 5 },
      line: { color: '#2a78d6', size: 1, style: 'solid', smooth: false, dashedValue: [4, 4] },
      rect: { style: 'fill', color: 'rgba(42,120,214,0.12)', borderColor: '#2a78d6', borderSize: 1, borderRadius: 0, borderStyle: 'solid' },
      polygon: { style: 'fill', color: 'rgba(42,120,214,0.12)', borderColor: '#2a78d6', borderSize: 1, borderStyle: 'solid' },
      circle: { style: 'fill', color: 'rgba(42,120,214,0.12)', borderColor: '#2a78d6', borderSize: 1, borderStyle: 'solid' },
      text: { color: strong, size: 12, family: 'ui-sans-serif, system-ui, sans-serif', weight: 'normal', style: 'fill', backgroundColor: 'transparent', borderColor: 'transparent', borderSize: 0, paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 },
    },
  };
}
