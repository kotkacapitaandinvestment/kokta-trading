import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPlotGeometry, pixelXToIndex } from './chartGeometry';

function pointFromEvent(e, { chartRef, containerRef, range, yAxisWidth, margin }) {
  const geometry = getPlotGeometry(containerRef, yAxisWidth, margin);
  const container = containerRef.current;
  if (!geometry || !container) return null;

  const index = Math.round(pixelXToIndex(e.clientX, geometry, range));

  let price = null;
  try {
    const scale = chartRef.current?.getYScaleByAxisId?.(0);
    if (scale && typeof scale.invert === 'function') {
      const containerRect = container.getBoundingClientRect();
      const chartY = e.clientY - containerRect.top;
      price = scale.invert(chartY);
    }
  } catch {
    price = null;
  }
  if (price === null) return null;

  return { index, price };
}

// All drawings are stored in data-space ({index, price} points), never raw
// pixels, so they stay correctly positioned as the user zooms/pans — pixels
// are recomputed from data-space + the current range every render.
export function useChartDrawings({ enabled, containerRef, chartRef, range, yAxisWidth, margin }) {
  const [activeTool, setActiveToolState] = useState('cursor');
  const [drawings, setDrawings] = useState([]);
  const [pendingPoints, setPendingPointsState] = useState([]);
  const [livePoint, setLivePoint] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const pendingPointsRef = useRef([]);

  const getPoint = useCallback(
    (e) => pointFromEvent(e, { chartRef, containerRef, range, yAxisWidth, margin }),
    [chartRef, containerRef, range, yAxisWidth, margin],
  );

  const setActiveTool = useCallback((tool) => {
    pendingPointsRef.current = [];
    setPendingPointsState([]);
    setLivePoint(null);
    setDragPreview(null);
    setActiveToolState((prev) => (prev === tool ? 'cursor' : tool));
  }, []);

  const commitDrawing = useCallback((type, points) => {
    setDrawings((prev) => [...prev, { id: crypto.randomUUID(), type, points, createdAt: Date.now() }]);
    setActiveToolState('cursor');
  }, []);

  const onMouseDown = useCallback(
    (e) => {
      if (!enabled || activeTool === 'cursor') return;
      const point = getPoint(e);
      if (!point) return;

      if (activeTool === 'ray') {
        commitDrawing('ray', [point]);
        return;
      }

      if (activeTool === 'measure') {
        const start = point;
        const startClientX = e.clientX;
        const startClientY = e.clientY;
        setDragPreview({ points: [start, start] });
        const onMove = (moveE) => {
          const p = getPoint(moveE);
          if (p) setDragPreview({ points: [start, p] });
        };
        const onUp = (upE) => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          const end = getPoint(upE);
          setDragPreview(null);
          // Pixel-distance threshold, not data-space equality — sub-pixel
          // mouse jitter would make even a real "stationary click" produce a
          // slightly different inverted price, so comparing prices directly
          // would almost never treat anything as a no-op.
          const movedPixels = Math.hypot(upE.clientX - startClientX, upE.clientY - startClientY);
          const moved = end && movedPixels > 4;
          if (moved) commitDrawing('measure', [start, end]);
          else setActiveToolState('cursor');
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return;
      }

      // trendline / fib: two-click tools
      if (pendingPointsRef.current.length === 0) {
        pendingPointsRef.current = [point];
        setPendingPointsState([point]);
      } else {
        const first = pendingPointsRef.current[0];
        pendingPointsRef.current = [];
        setPendingPointsState([]);
        commitDrawing(activeTool, [first, point]);
      }
    },
    [enabled, activeTool, getPoint, commitDrawing],
  );

  useEffect(() => {
    if (pendingPoints.length !== 1) {
      setLivePoint(null);
      return;
    }
    const onMove = (e) => {
      const p = getPoint(e);
      if (p) setLivePoint(p);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [pendingPoints.length, getPoint]);

  const pendingDrawing = useMemo(() => {
    if (pendingPoints.length === 1 && livePoint) {
      return { id: 'pending', type: activeTool, points: [pendingPoints[0], livePoint], isPending: true };
    }
    if (dragPreview) {
      return { id: 'pending', type: 'measure', points: dragPreview.points, isPending: true };
    }
    return null;
  }, [pendingPoints, livePoint, activeTool, dragPreview]);

  const clearAll = useCallback(() => {
    setDrawings([]);
    pendingPointsRef.current = [];
    setPendingPointsState([]);
    setLivePoint(null);
    setDragPreview(null);
    setActiveToolState('cursor');
  }, []);

  const removeDrawing = useCallback((id) => {
    setDrawings((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return {
    activeTool,
    setActiveTool,
    drawings,
    pendingDrawing,
    isDrawing: pendingPoints.length === 1 || dragPreview !== null,
    clearAll,
    removeDrawing,
    drawingHandlers: { onMouseDown },
  };
}
