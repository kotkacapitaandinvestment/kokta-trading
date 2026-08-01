import { CHART_COLORS } from '../../../lib/chartColors';

export const Y_AXIS_WIDTH = 70;
export const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };

export const CHART_THEMES = {
  app: {
    bg: null,
    grid: null,
    up: CHART_COLORS.profit,
    down: CHART_COLORS.loss,
    volUp: 'rgba(61,153,112,0.5)',
    volDown: 'rgba(194,74,63,0.5)',
    axisText: CHART_COLORS.tick.light,
    crosshair: CHART_COLORS.tick.light,
    tooltipClassName: 'border border-ink-100 bg-white text-ink-800 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-100',
  },
  terminal: {
    bg: '#0C0C0E',
    grid: '#262320',
    up: CHART_COLORS.profit,
    down: CHART_COLORS.loss,
    volUp: 'rgba(61,153,112,0.5)',
    volDown: 'rgba(194,74,63,0.5)',
    axisText: '#B8AE9F',
    crosshair: '#948A7D',
    tooltipClassName: 'border border-[#262320] bg-[#171512] text-[#EDE8DD]',
  },
};

export function formatTime(t) {
  const d = new Date(t);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export const INDICATOR_COLORS = [CHART_COLORS.accent, CHART_COLORS.accentLight, CHART_COLORS.accentBronze, CHART_COLORS.accentDeep];
