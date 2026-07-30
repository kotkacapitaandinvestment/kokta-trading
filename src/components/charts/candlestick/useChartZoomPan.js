import { useCallback, useEffect, useRef, useState } from 'react';

const ZOOM_FACTOR = 0.85;

// Hard anti-cheat invariant: 0 <= start < end <= totalBars, always. totalBars
// is exactly `bars.length` as revealed by the server so far — this clamp is
// the only thing standing between "browse revealed history" and "peek ahead".
export function clampRange(start, end, totalBars, minVisibleBars) {
  if (totalBars <= 0) return { start: 0, end: 0 };
  const width = Math.max(Math.min(minVisibleBars, totalBars), Math.min(end - start, totalBars));
  let newStart = Math.max(0, Math.min(start, totalBars - width));
  let newEnd = Math.min(newStart + width, totalBars);
  if (newEnd - newStart < 1) {
    newStart = Math.max(0, totalBars - 1);
    newEnd = totalBars;
  }
  return { start: Math.round(newStart), end: Math.round(newEnd) };
}

export function useChartZoomPan({
  totalBars,
  containerRef,
  enabled,
  initialVisibleBars = 60,
  minVisibleBars = 10,
  yAxisWidth = 0,
  margin = { left: 0, right: 0 },
}) {
  const [range, setRange] = useState(() => {
    const end = totalBars;
    const start = Math.max(0, end - initialVisibleBars);
    return { start, end };
  });
  const [isDragging, setIsDragging] = useState(false);
  const prevTotalBarsRef = useRef(totalBars);
  const dragStateRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      prevTotalBarsRef.current = totalBars;
      return;
    }
    const prevTotal = prevTotalBarsRef.current;
    if (totalBars < prevTotal) {
      const end = totalBars;
      const start = Math.max(0, end - initialVisibleBars);
      setRange(clampRange(start, end, totalBars, minVisibleBars));
    } else if (totalBars > prevTotal) {
      setRange((prev) => {
        const wasPinned = prev.end >= prevTotal;
        if (!wasPinned) return clampRange(prev.start, prev.end, totalBars, minVisibleBars);
        const delta = totalBars - prevTotal;
        return clampRange(prev.start + delta, prev.end + delta, totalBars, minVisibleBars);
      });
    }
    prevTotalBarsRef.current = totalBars;
  }, [totalBars, enabled, initialVisibleBars, minVisibleBars]);

  const getPlotGeometry = useCallback(() => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const plotLeft = rect.left + yAxisWidth + margin.left;
    const plotWidth = Math.max(1, rect.width - yAxisWidth - margin.left - margin.right);
    return { rect, plotLeft, plotWidth };
  }, [containerRef, yAxisWidth, margin.left, margin.right]);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e) => {
      e.preventDefault();
      const geometry = getPlotGeometry();
      if (!geometry) return;
      setRange((prev) => {
        const currentWidth = prev.end - prev.start;
        const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
        const newWidth = Math.round(Math.min(totalBars, Math.max(minVisibleBars, currentWidth * factor)));
        if (newWidth === currentWidth) return prev;

        const cursorRatio = Math.min(1, Math.max(0, (e.clientX - geometry.plotLeft) / geometry.plotWidth));
        const anchorIndex = prev.start + cursorRatio * currentWidth;
        const newStart = Math.round(anchorIndex - cursorRatio * newWidth);
        return clampRange(newStart, newStart + newWidth, totalBars, minVisibleBars);
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enabled, containerRef, totalBars, minVisibleBars, getPlotGeometry]);

  const onMouseDown = useCallback(
    (e) => {
      if (!enabled) return;
      dragStateRef.current = { startClientX: e.clientX, startRange: range };
      setIsDragging(true);
    },
    [enabled, range],
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e) => {
      const dragState = dragStateRef.current;
      const geometry = getPlotGeometry();
      if (!dragState || !geometry) return;
      const width = dragState.startRange.end - dragState.startRange.start;
      const pxPerBar = geometry.plotWidth / width;
      const deltaBars = Math.round((dragState.startClientX - e.clientX) / pxPerBar);
      const newStart = dragState.startRange.start + deltaBars;
      setRange(clampRange(newStart, newStart + width, totalBars, minVisibleBars));
    };

    const onMouseUp = () => {
      setIsDragging(false);
      dragStateRef.current = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, totalBars, minVisibleBars, getPlotGeometry]);

  if (!enabled) {
    return { range: { start: 0, end: totalBars }, isDragging: false, dragHandlers: {} };
  }

  return { range, isDragging, dragHandlers: { onMouseDown } };
}
