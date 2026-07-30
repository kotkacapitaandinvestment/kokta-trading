import { useCallback, useEffect, useRef, useState } from 'react';
import { getPlotGeometry } from './chartGeometry';

const ZOOM_FACTOR = 0.85;

// Hard anti-cheat invariant: minIndex <= start < end <= totalBars, always.
// totalBars is exactly `bars.length` as revealed by the server so far — the
// upper bound is the only thing standing between "browse revealed history"
// and "peek ahead". minIndex only ever loosens backward (real extended
// history, never unrevealed future data) so it carries no anti-cheat risk.
export function clampRange(start, end, minIndex, totalBars, minVisibleBars) {
  const span = totalBars - minIndex;
  if (span <= 0) return { start: minIndex, end: minIndex };
  const width = Math.max(Math.min(minVisibleBars, span), Math.min(end - start, span));
  let newStart = Math.max(minIndex, Math.min(start, totalBars - width));
  let newEnd = Math.min(newStart + width, totalBars);
  if (newEnd - newStart < 1) {
    newStart = Math.max(minIndex, totalBars - 1);
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
  minIndex = 0,
  yAxisWidth = 0,
  margin = { left: 0, right: 0 },
}) {
  const [range, setRange] = useState(() => {
    const end = totalBars;
    const start = Math.max(minIndex, end - initialVisibleBars);
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
      const start = Math.max(minIndex, end - initialVisibleBars);
      setRange(clampRange(start, end, minIndex, totalBars, minVisibleBars));
    } else if (totalBars > prevTotal) {
      setRange((prev) => {
        const wasPinned = prev.end >= prevTotal;
        if (!wasPinned) return clampRange(prev.start, prev.end, minIndex, totalBars, minVisibleBars);
        const delta = totalBars - prevTotal;
        return clampRange(prev.start + delta, prev.end + delta, minIndex, totalBars, minVisibleBars);
      });
    }
    prevTotalBarsRef.current = totalBars;
    // minIndex is intentionally excluded — a change in minIndex (more
    // extended history loaded) only loosens the floor and must never itself
    // move the current range; the existing range already satisfies a
    // loosened bound trivially.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalBars, enabled, initialVisibleBars, minVisibleBars]);

  const geometry = useCallback(() => getPlotGeometry(containerRef, yAxisWidth, margin), [containerRef, yAxisWidth, margin.left, margin.right]);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e) => {
      e.preventDefault();
      const geo = geometry();
      if (!geo) return;
      setRange((prev) => {
        const currentWidth = prev.end - prev.start;
        const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
        const newWidth = Math.round(Math.min(totalBars - minIndex, Math.max(minVisibleBars, currentWidth * factor)));
        if (newWidth === currentWidth) return prev;

        const cursorRatio = Math.min(1, Math.max(0, (e.clientX - geo.plotLeft) / geo.plotWidth));
        const anchorIndex = prev.start + cursorRatio * currentWidth;
        const newStart = Math.round(anchorIndex - cursorRatio * newWidth);
        return clampRange(newStart, newStart + newWidth, minIndex, totalBars, minVisibleBars);
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enabled, containerRef, totalBars, minIndex, minVisibleBars, geometry]);

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
      const geo = geometry();
      if (!dragState || !geo) return;
      const width = dragState.startRange.end - dragState.startRange.start;
      const pxPerBar = geo.plotWidth / width;
      const deltaBars = Math.round((dragState.startClientX - e.clientX) / pxPerBar);
      const newStart = dragState.startRange.start + deltaBars;
      setRange(clampRange(newStart, newStart + width, minIndex, totalBars, minVisibleBars));
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
  }, [isDragging, totalBars, minIndex, minVisibleBars, geometry]);

  if (!enabled) {
    return { range: { start: minIndex, end: totalBars }, isDragging: false, dragHandlers: {} };
  }

  return { range, isDragging, dragHandlers: { onMouseDown } };
}
