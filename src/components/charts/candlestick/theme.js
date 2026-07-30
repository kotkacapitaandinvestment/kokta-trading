export const Y_AXIS_WIDTH = 70;
export const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };

export const CHART_THEMES = {
  app: {
    bg: null,
    grid: null,
    up: '#16a34a',
    down: '#ef4444',
    volUp: 'rgba(22,163,74,0.5)',
    volDown: 'rgba(239,68,68,0.5)',
    axisText: '#a3aabb',
    crosshair: '#a3aabb',
    tooltipClassName: 'border border-ink-100 bg-white text-ink-800 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-100',
  },
  terminal: {
    bg: '#0d1117',
    grid: '#1e2530',
    up: '#26a69a',
    down: '#ef5350',
    volUp: 'rgba(38,166,154,0.5)',
    volDown: 'rgba(239,83,80,0.5)',
    axisText: '#8b93a7',
    crosshair: '#758696',
    tooltipClassName: 'border border-[#2a2e39] bg-[#161b26] text-[#d1d4dc]',
  },
};

export function formatTime(t) {
  const d = new Date(t);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export const INDICATOR_COLORS = ['#3b82f6', '#f59e0b', '#a855f7', '#14b8a6'];
