import { useCallback, useState } from 'react';

export function useChartCrosshair({ enabled, chartRef, yAxisId = 0 }) {
  const [hover, setHover] = useState(null);

  const onMouseMove = useCallback(
    (state) => {
      if (!enabled) return;
      if (!state || state.activeTooltipIndex == null || !state.activePayload?.length) {
        setHover(null);
        return;
      }
      const bar = state.activePayload[0].payload;
      const x = state.activeCoordinate?.x ?? state.chartX;
      const chartY = state.chartY;

      let price = null;
      try {
        const scale = chartRef.current?.getYScaleByAxisId?.(yAxisId);
        if (scale && typeof scale.invert === 'function') {
          price = scale.invert(chartY);
        }
      } catch {
        price = null;
      }

      setHover({ index: state.activeTooltipIndex, bar, x, y: chartY, price });
    },
    [enabled, chartRef, yAxisId],
  );

  const onMouseLeave = useCallback(() => {
    if (!enabled) return;
    setHover(null);
  }, [enabled]);

  return { hover, onMouseMove, onMouseLeave };
}
